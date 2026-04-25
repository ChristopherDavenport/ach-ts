import {
  PPD, COR, DNE,
  ARC, BOC, CIE, ENR, MTE, POP, POS, RCK, SHR, TEL, WEB,
  CheckingPrenoteCredit, SavingsPrenoteCredit,
  CategoryNOC,
  entryDetailPos, entryAddendaPos, batchControlPos,
  batchHeaderPos, fileControlPos,
} from './constants.js';
import type { ValidateOpts } from './validateOpts.js';
import { File } from './file.js';
import { FileHeader } from './fileHeader.js';
import { FileControl, newFileControl } from './fileControl.js';
import { BatchHeader, newBatchHeader } from './batchHeader.js';
import { BatchControl, newBatchControl } from './batchControl.js';
import { EntryDetail } from './entryDetail.js';
import { IATBatchHeader } from './iatBatchHeader.js';
import { IATEntryDetail } from './iatEntryDetail.js';
import { IATBatch } from './iatBatch.js';
import { Reader } from './reader.js';
import { Batch, newBatch } from './batch.js';
import { converters } from './utils/converters.js';
import { validators } from './utils/validators.js';
import { classifyAmount, aba8 } from './utils/amounts.js';
import {
  ParseError, ErrFileEntryOutsideBatch,
  BatchError,
  fieldError,
  ErrBatchNoEntries,
  ErrBatchHeaderControlEquality,
  ErrBatchCalculatedControlEquality,
  ErrBatchAscending,
  ErrBatchTraceNumberNotODFI,
  ErrBatchAddendaIndicator,
  ErrBatchOriginatorDNE,
  ErrBatchCategory,
  ErrBatchAmountNonZero,
  ErrFileCalculatedControlEquality,
  ErrFileBatchNumberAscending,
} from './errors/index.js';
import { allSpaces } from './iterator.js';

export type StreamingBatchHeader = BatchHeader | IATBatchHeader;
export type StreamingEntryDetail = EntryDetail | IATEntryDetail;

// SEC codes that require IndividualName to be non-blank
const individualNameSECs = new Set([
  ARC, BOC, CIE, DNE, ENR, MTE, POP, POS, PPD, RCK, SHR, TEL, WEB,
]);

/**
 * StreamingReader processes an ACH file one entry at a time from an
 * AsyncIterable<string> of lines. Unlike Reader, it never loads the
 * entire file into memory, making it suitable for multi-GB files.
 *
 * It performs full NACHA validation (per-entry, per-batch, per-file)
 * using O(1) running accumulators. Validation errors are returned
 * inline via the `nextEntry()` tuple.
 *
 * Usage:
 * ```ts
 * import { createReadStream } from 'node:fs';
 * import { createInterface } from 'node:readline';
 *
 * const rl = createInterface({ input: createReadStream('huge.ach') });
 * const sr = new StreamingReader(rl);
 *
 * for await (const { batchHeader, entry } of sr.entries()) {
 *   console.log(entry.traceNumber);
 * }
 * ```
 */
export class StreamingReader {
  private reader: Reader;
  private source: AsyncIterator<string>;
  private cachedLine = '';
  private done = false;
  private entriesNeedClearing = false;
  private fakedBatch = false;

  // Error queue — drained before processing next entry
  private pendingErrors: Error[] = [];

  // Per-batch accumulators
  private batchEntryHash = 0;
  private batchTotalDebit = 0;
  private batchTotalCredit = 0;
  private batchEntryAddendaCount = 0;
  private lastTraceNumber = '';
  private batchCategory = '';
  private batchHasEntries = false;
  private currentBatchHeader: StreamingBatchHeader | null = null;

  // File-level accumulators
  private fileBatchCount = 0;
  private fileEntryAddendaCount = 0;
  private fileEntryHash = 0;
  private fileTotalDebit = 0;
  private fileTotalCredit = 0;
  private lastBatchNumber = 0;

  // User's original bypassBatchValidation (before we force it on the reader)
  private userBypassBatchValidation = false;

  constructor(input: AsyncIterable<string>) {
    this.reader = new Reader('');
    this.reader.skipBatchAccumulation = true;
    this.source = input[Symbol.asyncIterator]();
  }

  setValidation(opts: ValidateOpts): void {
    this.userBypassBatchValidation = !!opts.bypassBatchValidation;
    this.reader.setValidation(opts);
  }

  private get opts(): ValidateOpts | undefined {
    return this.reader.file.validateOpts;
  }

  private get skipValidation(): boolean {
    return !!(this.opts?.skipAll);
  }

  private get skipBatchValidation(): boolean {
    return this.userBypassBatchValidation;
  }

  /** Returns the FileHeader once encountered. Call nextEntry() at least once first. */
  getHeader(): FileHeader | null {
    return this.reader.file.header ?? null;
  }

  /** Returns the FileControl once encountered. Call nextEntry() at least once first. */
  getControl(): FileControl | null {
    return this.reader.file.control ?? null;
  }

  /**
   * Returns the next available entry record and the batch header it belongs to.
   * Returns [null, null, null] when the input is exhausted.
   * Validation errors are returned as [null, null, error] between entries.
   */
  async nextEntry(): Promise<[StreamingBatchHeader | null, StreamingEntryDetail | null, Error | null]> {
    // Drain pending errors first
    if (this.pendingErrors.length > 0) {
      return [null, null, this.pendingErrors.shift()!];
    }

    const cleanup = () => {
      const opts = this.reader.file.validateOpts;
      this.reader.file = new File();
      if (opts) this.reader.file.setValidation(opts);
    };

    let line = this.cachedLine;
    if (line !== '') {
      this.cachedLine = '';
    } else {
      line = await this.nextNonEmptyLine();
      if (line === '') {
        cleanup();
        return [null, null, null];
      }
    }

    let err = this.reader.readLine(line);

    // Clear entries from the previous call AFTER readLine processes the line.
    // readLine's batch-header handler checks entries.length > 0 to detect
    // consecutive batch headers, so we must clear only after that check runs.
    if (this.entriesNeedClearing) {
      this.entriesNeedClearing = false;
      this.clearEntries();
    }

    if (err) {
      if (err instanceof ParseError && err.cause === ErrFileEntryOutsideBatch) {
        // Fake a Batch so we can parse entries
        const bh = newBatchHeader();
        bh.standardEntryClassCode = PPD;
        const [batch, batchErr] = newBatch(bh);
        if (batchErr || !batch) {
          cleanup();
          return [null, null, new Error(`faking batch for line ${this.reader.lineNum} failed: ${batchErr?.message}`)];
        }
        this.reader.currentBatch = batch;
        this.fakedBatch = true;
        err = this.reader.readLine(line);
        if (err) {
          cleanup();
          return [null, null, new Error(`reading line ${this.reader.lineNum} with fake BatchHeader failed: ${err.message}`)];
        }
      } else {
        cleanup();
        return [null, null, new Error(`reading line ${this.reader.lineNum} failed: ${err.message}`)];
      }
    }

    // Track the current batch header for validation context
    if (line.startsWith(batchHeaderPos)) {
      this.fakedBatch = false;
      // New batch header → reset batch accumulators (handles files without batch controls)
      this.resetBatchAccumulators();
      if (this.reader.currentBatch !== null) {
        this.currentBatchHeader = this.reader.currentBatch.getHeader();
      } else if (this.reader.iatCurrentBatch.header.serviceClassCode > 0) {
        this.currentBatchHeader = this.reader.iatCurrentBatch.header;
      }
    }

    // Only collect addenda if we just parsed an entry detail ('6')
    if (line.startsWith(entryDetailPos)) {
      if (this.reader.currentBatch !== null) {
        const bh = this.reader.currentBatch.getHeader();
        const entries = this.reader.currentBatch.getEntries();
        if (entries.length > 0) {
          return this.collectAddendaAndReturn(bh, entries[entries.length - 1], cleanup);
        }
      }
      if (this.reader.iatCurrentBatch.entries.length > 0) {
        const bh = this.reader.iatCurrentBatch.header;
        const iatEntries = this.reader.iatCurrentBatch.entries;
        return this.collectAddendaAndReturn(bh, iatEntries[iatEntries.length - 1], cleanup);
      }
    }

    // Validate batch control when encountered in the main loop
    // (collectAddendaAndReturn handles it when batch control follows entries directly)
    if (line.startsWith(batchControlPos) && this.currentBatchHeader) {
      this.validateBatchBoundary(line, this.currentBatchHeader);
    }

    // Validate file control when encountered in the main loop
    // (collectAddendaAndReturn handles it when file control follows an entry directly)
    if (line[0] === '9' && line.length >= 94) {
      const isPadding = line === '9'.repeat(94) || allSpaces(line.substring(1));
      if (!isPadding) {
        this.validateFileControl(line);
      }
    }

    // For non-entry lines (file header, batch header, batch control,
    // file control, padding) recurse to find the next entry.
    return this.nextEntry();
  }

  /**
   * Async generator that yields `{ batchHeader, entry }` objects.
   * Errors are thrown for use with `for await...of`.
   */
  async *entries(): AsyncGenerator<{ batchHeader: StreamingBatchHeader; entry: StreamingEntryDetail }> {
    for (;;) {
      const [bh, ed, err] = await this.nextEntry();
      if (err) throw err;
      if (bh === null && ed === null) return;
      if (bh !== null && ed !== null) {
        yield { batchHeader: bh, entry: ed };
      }
    }
  }

  // ----------------------------------------------------------------
  // Batch & File accumulator validation
  // ----------------------------------------------------------------

  /** Update batch accumulators for a single entry. */
  private updateBatchAccumulators(entry: StreamingEntryDetail): void {
    this.batchHasEntries = true;
    this.batchEntryHash += parseInt(aba8(entry.rdfiIdentification), 10) || 0;
    const { credit, debit } = classifyAmount(entry.transactionCode, entry.amount);
    this.batchTotalCredit += credit;
    this.batchTotalDebit += debit;

    // Count entry + its addenda
    let addendaCount = 0;
    if (entry instanceof EntryDetail) {
      addendaCount = entry.addendaCount();
    } else {
      // IATEntryDetail
      if (entry.addenda10) addendaCount++;
      if (entry.addenda11) addendaCount++;
      if (entry.addenda12) addendaCount++;
      if (entry.addenda13) addendaCount++;
      if (entry.addenda14) addendaCount++;
      if (entry.addenda15) addendaCount++;
      if (entry.addenda16) addendaCount++;
      addendaCount += entry.addenda17.length;
      addendaCount += entry.addenda18.length;
      if (entry.addenda98) addendaCount++;
      if (entry.addenda99) addendaCount++;
    }
    this.batchEntryAddendaCount += 1 + addendaCount;
  }

  private resetBatchAccumulators(): void {
    this.batchEntryHash = 0;
    this.batchTotalDebit = 0;
    this.batchTotalCredit = 0;
    this.batchEntryAddendaCount = 0;
    this.lastTraceNumber = '';
    this.batchCategory = '';
    this.batchHasEntries = false;
    this.currentBatchHeader = null;
  }

  /** Run per-entry validation checks (from Batch.verify). */
  private runPerEntryChecks(entry: StreamingEntryDetail, bh: StreamingBatchHeader): void {
    if (this.skipValidation || this.skipBatchValidation || this.fakedBatch) return;
    const opts = this.opts;

    // Trace number ascending
    if (!opts?.customTraceNumbers) {
      const tn = entry.traceNumber;
      if (this.lastTraceNumber !== '' && tn <= this.lastTraceNumber) {
        this.pendingErrors.push(this.batchError(bh, 'TraceNumber',
          new ErrBatchAscending(this.lastTraceNumber, tn)));
      }
      this.lastTraceNumber = tn;
    }

    // Trace number ODFI match
    if (!opts?.customTraceNumbers && !opts?.bypassOriginValidation) {
      const bhODFI = bh instanceof BatchHeader
        ? bh.odfiIdentificationField()
        : converters.stringField(bh.odfiIdentification, 8);
      const entryODFI = entry.traceNumber.length >= 8 ? entry.traceNumber.substring(0, 8) : '';
      if (bhODFI !== entryODFI) {
        this.pendingErrors.push(this.batchError(bh, 'ODFIIdentificationField',
          new ErrBatchTraceNumberNotODFI(bhODFI, entryODFI)));
      }
    }

    // Category consistency
    const entryCat = entry instanceof EntryDetail ? entry.category : (entry as IATEntryDetail).category;
    if (this.batchCategory === '') {
      this.batchCategory = entryCat;
    } else {
      if (entryCat !== CategoryNOC && entryCat !== this.batchCategory) {
        this.pendingErrors.push(this.batchError(bh, 'Category',
          new ErrBatchCategory(entryCat, this.batchCategory)));
      }
    }

    // Originator DNE check (regular batches only)
    if (entry instanceof EntryDetail && bh instanceof BatchHeader) {
      if (bh.originatorStatusCode !== 2 && bh.standardEntryClassCode === DNE) {
        if (entry.transactionCode === CheckingPrenoteCredit || entry.transactionCode === SavingsPrenoteCredit) {
          this.pendingErrors.push(this.batchError(bh, 'OriginatorStatusCode',
            ErrBatchOriginatorDNE));
        }
      }
    }

    // Addenda checks for regular entries
    if (entry instanceof EntryDetail) {
      // Addenda record indicator
      if (!opts?.customTraceNumbers) {
        this.checkAddendaSequence(entry, bh);
      }

      // IndividualName for certain SEC codes
      if (!opts?.allowEmptyIndividualName && bh instanceof BatchHeader) {
        if (individualNameSECs.has(bh.standardEntryClassCode)) {
          const nameErr = validators.isNonZero(entry.individualName);
          if (nameErr) {
            const fe = fieldError('IndividualName', nameErr, entry.individualName);
            if (fe) this.pendingErrors.push(fe);
          }
        }
      }
    }
  }

  /** Check addenda sequence and indicator for a regular entry. */
  private checkAddendaSequence(entry: EntryDetail, bh: StreamingBatchHeader): void {
    if (entry.addenda02 && entry.addendaRecordIndicator !== 1) {
      this.pendingErrors.push(this.batchError(bh, 'AddendaRecordIndicator', ErrBatchAddendaIndicator));
    }
    if (entry.addenda05.length > 0) {
      if (entry.addendaRecordIndicator !== 1) {
        this.pendingErrors.push(this.batchError(bh, 'AddendaRecordIndicator', ErrBatchAddendaIndicator));
      }
      let lastSeq = -1;
      for (const a of entry.addenda05) {
        if (a.sequenceNumber < lastSeq) {
          this.pendingErrors.push(this.batchError(bh, 'SequenceNumber',
            new ErrBatchAscending(lastSeq, a.sequenceNumber)));
        }
        lastSeq = a.sequenceNumber;
        const edSeq = converters.numericField(a.entryDetailSequenceNumber, 7);
        const traceSeq = entry.traceNumberField().substring(8);
        if (edSeq !== traceSeq) {
          this.pendingErrors.push(this.batchError(bh, 'TraceNumber',
            new ErrBatchAscending(lastSeq, a.sequenceNumber)));
        }
      }
    }
    if (entry.addenda98 && entry.addendaRecordIndicator !== 1) {
      this.pendingErrors.push(this.batchError(bh, 'AddendaRecordIndicator', ErrBatchAddendaIndicator));
    }
    if (entry.addenda98Refused && entry.addendaRecordIndicator !== 1) {
      this.pendingErrors.push(this.batchError(bh, 'AddendaRecordIndicator', ErrBatchAddendaIndicator));
    }
    if (entry.addenda99 && entry.addendaRecordIndicator !== 1) {
      this.pendingErrors.push(this.batchError(bh, 'AddendaRecordIndicator', ErrBatchAddendaIndicator));
    }
    if (entry.addenda99Dishonored && entry.addendaRecordIndicator !== 1) {
      this.pendingErrors.push(this.batchError(bh, 'AddendaRecordIndicator', ErrBatchAddendaIndicator));
    }
    if (entry.addenda99Contested && entry.addendaRecordIndicator !== 1) {
      this.pendingErrors.push(this.batchError(bh, 'AddendaRecordIndicator', ErrBatchAddendaIndicator));
    }
  }

  /** Run SEC-specific per-entry validation via invalidEntries(). */
  private runSECEntryValidation(entry: StreamingEntryDetail, bh: StreamingBatchHeader): void {
    if (this.skipValidation || this.skipBatchValidation || this.fakedBatch) return;

    if (entry instanceof EntryDetail && this.reader.currentBatch !== null) {
      // The batch subclass has its own invalidEntries() implementation.
      // entries array contains only the current entry (previous cleared).
      const batch = this.reader.currentBatch as Batch;
      if (typeof (batch as any).invalidEntries === 'function') {
        const invalids = (batch as any).invalidEntries() as { entry?: EntryDetail; error: Error }[];
        for (const inv of invalids) {
          this.pendingErrors.push(inv.error);
        }
      }
    } else if (entry instanceof IATEntryDetail) {
      const iatBatch = this.reader.iatCurrentBatch;
      const invalids = iatBatch.invalidEntries();
      for (const inv of invalids) {
        this.pendingErrors.push(inv.error);
      }
    }
  }

  /** Validate batch at boundary (when BatchControl is encountered). */
  private validateBatchBoundary(controlLine: string, bh: StreamingBatchHeader): void {
    if (this.skipValidation || this.skipBatchValidation) return;

    const bc = newBatchControl();
    bc.parse(controlLine);

    // No entries check
    if (!this.batchHasEntries) {
      this.pendingErrors.push(this.batchError(bh, 'entries', ErrBatchNoEntries));
    }

    // Header/control matching
    if (bh instanceof BatchHeader) {
      if (!this.opts?.unequalServiceClassCode && bh.serviceClassCode !== bc.serviceClassCode) {
        this.pendingErrors.push(this.batchError(bh, 'ServiceClassCode',
          new ErrBatchHeaderControlEquality(bh.serviceClassCode, bc.serviceClassCode)));
      }
      if (!this.opts?.bypassCompanyIdentificationMatch && bh.companyIdentification !== bc.companyIdentification) {
        this.pendingErrors.push(this.batchError(bh, 'CompanyIdentification',
          new ErrBatchHeaderControlEquality(bh.companyIdentification, bc.companyIdentification)));
      }
      if (bh.odfiIdentification !== bc.odfiIdentification) {
        this.pendingErrors.push(this.batchError(bh, 'ODFIIdentification',
          new ErrBatchHeaderControlEquality(bh.odfiIdentification, bc.odfiIdentification)));
      }
      if (bh.batchNumber !== bc.batchNumber) {
        this.pendingErrors.push(this.batchError(bh, 'BatchNumber',
          new ErrBatchHeaderControlEquality(bh.batchNumber, bc.batchNumber)));
      }
    } else {
      // IATBatchHeader
      if (!this.opts?.unequalServiceClassCode && bh.serviceClassCode !== bc.serviceClassCode) {
        this.pendingErrors.push(this.batchError(bh, 'ServiceClassCode',
          new ErrBatchHeaderControlEquality(bh.serviceClassCode, bc.serviceClassCode)));
      }
      if (bh.odfiIdentification !== bc.odfiIdentification) {
        this.pendingErrors.push(this.batchError(bh, 'ODFIIdentification',
          new ErrBatchHeaderControlEquality(bh.odfiIdentification, bc.odfiIdentification)));
      }
      if (bh.batchNumber !== bc.batchNumber) {
        this.pendingErrors.push(this.batchError(bh, 'BatchNumber',
          new ErrBatchHeaderControlEquality(bh.batchNumber, bc.batchNumber)));
      }
    }

    // Accumulator vs control checks
    const computedHash = converters.leastSignificantDigits(this.batchEntryHash, 10);
    if (computedHash !== bc.entryHash) {
      this.pendingErrors.push(this.batchError(bh, 'EntryHash',
        new ErrBatchCalculatedControlEquality(computedHash, bc.entryHash)));
    }
    if (!this.opts?.unequalAddendaCounts && this.batchEntryAddendaCount !== bc.entryAddendaCount) {
      this.pendingErrors.push(this.batchError(bh, 'EntryAddendaCount',
        new ErrBatchCalculatedControlEquality(this.batchEntryAddendaCount, bc.entryAddendaCount)));
    }
    if (this.batchTotalDebit !== bc.totalDebitEntryDollarAmount) {
      this.pendingErrors.push(this.batchError(bh, 'TotalDebitEntryDollarAmount',
        new ErrBatchCalculatedControlEquality(this.batchTotalDebit, bc.totalDebitEntryDollarAmount)));
    }
    if (this.batchTotalCredit !== bc.totalCreditEntryDollarAmount) {
      this.pendingErrors.push(this.batchError(bh, 'TotalCreditEntryDollarAmount',
        new ErrBatchCalculatedControlEquality(this.batchTotalCredit, bc.totalCreditEntryDollarAmount)));
    }

    // COR-specific: amounts must be zero
    const sec = bh instanceof BatchHeader ? bh.standardEntryClassCode : bh.standardEntryClassCode;
    if (sec === COR) {
      if (bc.totalCreditEntryDollarAmount !== 0) {
        this.pendingErrors.push(this.batchError(bh, 'TotalCreditEntryDollarAmount',
          ErrBatchAmountNonZero));
      }
      if (bc.totalDebitEntryDollarAmount !== 0) {
        this.pendingErrors.push(this.batchError(bh, 'TotalDebitEntryDollarAmount',
          ErrBatchAmountNonZero));
      }
    }

    // Batch number ascending check (file-level)
    if (!this.opts?.allowUnorderedBatchNumbers) {
      if (this.lastBatchNumber > 0 && bc.batchNumber > 0 && bc.batchNumber <= this.lastBatchNumber) {
        this.pendingErrors.push(new ErrFileBatchNumberAscending(this.lastBatchNumber, bc.batchNumber));
      }
      this.lastBatchNumber = bc.batchNumber;
    }

    // Roll up into file-level accumulators
    this.fileBatchCount++;
    this.fileEntryAddendaCount += bc.entryAddendaCount;
    this.fileEntryHash += bc.entryHash;
    this.fileTotalDebit += bc.totalDebitEntryDollarAmount;
    this.fileTotalCredit += bc.totalCreditEntryDollarAmount;

    this.resetBatchAccumulators();
  }

  /** Validate file at boundary (when FileControl is encountered). */
  private validateFileControl(controlLine: string): void {
    if (this.skipValidation) return;

    const fc = newFileControl();
    fc.parse(controlLine);

    if (fc.batchCount !== this.fileBatchCount) {
      this.pendingErrors.push(new ErrFileCalculatedControlEquality(
        'BatchCount', this.fileBatchCount, fc.batchCount));
    }
    if (fc.entryAddendaCount !== this.fileEntryAddendaCount) {
      this.pendingErrors.push(new ErrFileCalculatedControlEquality(
        'EntryAddendaCount', this.fileEntryAddendaCount, fc.entryAddendaCount));
    }
    const computedHash = converters.leastSignificantDigits(this.fileEntryHash, 10);
    if (fc.entryHash !== computedHash) {
      this.pendingErrors.push(new ErrFileCalculatedControlEquality(
        'EntryHash', computedHash, fc.entryHash));
    }
    if (fc.totalDebitEntryDollarAmountInFile !== this.fileTotalDebit) {
      this.pendingErrors.push(new ErrFileCalculatedControlEquality(
        'TotalDebitEntryDollarAmountInFile', this.fileTotalDebit, fc.totalDebitEntryDollarAmountInFile));
    }
    if (fc.totalCreditEntryDollarAmountInFile !== this.fileTotalCredit) {
      this.pendingErrors.push(new ErrFileCalculatedControlEquality(
        'TotalCreditEntryDollarAmountInFile', this.fileTotalCredit, fc.totalCreditEntryDollarAmountInFile));
    }
  }

  /** Create a BatchError with the correct batch number and SEC code. */
  private batchError(bh: StreamingBatchHeader, field: string, err: Error, ...values: unknown[]): Error {
    if (err instanceof BatchError) return err;
    const batchNum = bh.batchNumber;
    const sec = bh instanceof BatchHeader ? bh.standardEntryClassCode : 'IAT';
    return new BatchError(batchNum, sec, field, err, values.length > 0 ? values[0] : undefined);
  }

  /** Clear previously yielded entries to maintain O(1) memory.
   *  Keep the last entry (just parsed by readLine) if any exist. */
  private clearEntries(): void {
    if (this.reader.currentBatch !== null) {
      const entries = (this.reader.currentBatch as Batch).entries;
      if (entries.length > 1) {
        entries.splice(0, entries.length - 1);
      }
    }
    const iatEntries = this.reader.iatCurrentBatch.entries;
    if (iatEntries.length > 1) {
      iatEntries.splice(0, iatEntries.length - 1);
    }
  }

  // ----------------------------------------------------------------
  // Line-level processing
  // ----------------------------------------------------------------

  /**
   * After parsing an entry detail, read ahead to collect any trailing
   * addenda records and the batch control, then return the entry.
   */
  private async collectAddendaAndReturn(
    bh: StreamingBatchHeader,
    entry: StreamingEntryDetail,
    cleanup: () => void,
  ): Promise<[StreamingBatchHeader | null, StreamingEntryDetail | null, Error | null]> {
    for (;;) {
      const foundLine = await this.nextLineRaw();
      if (this.done) {
        // Input exhausted — validate and return
        this.updateBatchAccumulators(entry);
        this.runPerEntryChecks(entry, bh);
        this.runSECEntryValidation(entry, bh);
        this.entriesNeedClearing = true;
        cleanup();
        return [bh, entry, null];
      }
      if (foundLine === '' || allSpaces(foundLine)) continue;

      if (foundLine.startsWith(entryDetailPos)) {
        // Next entry — validate current, cache next, return current
        this.updateBatchAccumulators(entry);
        this.runPerEntryChecks(entry, bh);
        this.runSECEntryValidation(entry, bh);
        this.entriesNeedClearing = true;
        this.cachedLine = foundLine;
        cleanup();
        return [bh, entry, null];
      }

      if (foundLine.startsWith(entryAddendaPos)) {
        this.reader.line = foundLine;
        const addendaErr = this.reader.parseEDAddenda();
        if (addendaErr) {
          this.entriesNeedClearing = true;
          cleanup();
          return [null, null, new Error(`reading addenda on line ${this.reader.lineNum} failed: ${addendaErr.message}`)];
        }

        // Re-read the updated entry (addenda is now attached)
        if (this.reader.currentBatch !== null) {
          const updatedEntries = this.reader.currentBatch.getEntries();
          entry = updatedEntries[updatedEntries.length - 1];
        } else {
          const iatEntries = this.reader.iatCurrentBatch.entries;
          entry = iatEntries[iatEntries.length - 1];
        }

        // Always continue reading — the next line will determine when to return
        // (next entry, batch control, file control, or EOF)
        continue;
      }

      if (foundLine.startsWith(batchControlPos)) {
        // Batch control — validate entry, then validate batch boundary
        this.updateBatchAccumulators(entry);
        this.runPerEntryChecks(entry, bh);
        this.runSECEntryValidation(entry, bh);
        this.entriesNeedClearing = true;
        this.validateBatchBoundary(foundLine, bh);
        cleanup();
        return [bh, entry, null];
      }

      if (foundLine.startsWith(batchHeaderPos)) {
        // New batch starting — validate current entry, cache header, return
        this.updateBatchAccumulators(entry);
        this.runPerEntryChecks(entry, bh);
        this.runSECEntryValidation(entry, bh);
        this.entriesNeedClearing = true;
        this.cachedLine = foundLine;
        cleanup();
        return [bh, entry, null];
      }

      // File control or padding lines start with '9'
      if (foundLine[0] === '9') {
        this.updateBatchAccumulators(entry);
        this.runPerEntryChecks(entry, bh);
        this.runSECEntryValidation(entry, bh);
        this.entriesNeedClearing = true;

        // Check if this is a real file control (not padding)
        const isPadding = foundLine === '9'.repeat(94) || allSpaces(foundLine.substring(1));
        if (!isPadding) {
          // Feed file control to reader for getControl() access
          this.reader.readLine(foundLine);
          this.validateFileControl(foundLine);
        }
        cleanup();
        return [bh, entry, null];
      }

      // Unknown record type — validate and return
      this.updateBatchAccumulators(entry);
      this.runPerEntryChecks(entry, bh);
      this.runSECEntryValidation(entry, bh);
      this.entriesNeedClearing = true;
      if (!foundLine.startsWith('9')) {
        this.cachedLine = foundLine;
      }
      cleanup();
      return [bh, entry, null];
    }
  }

  /** Pull the next raw line from the async source, incrementing lineNum. */
  private async nextLineRaw(): Promise<string> {
    if (this.done) return '';
    const result = await this.source.next();
    if (result.done) {
      this.done = true;
      return '';
    }
    this.reader.lineNum++;
    return result.value;
  }

  /** Pull the next non-empty, non-whitespace line from the async source. */
  private async nextNonEmptyLine(): Promise<string> {
    for (;;) {
      const line = await this.nextLineRaw();
      if (this.done) return '';
      if (line === '' || allSpaces(line)) continue;
      return line;
    }
  }
}
