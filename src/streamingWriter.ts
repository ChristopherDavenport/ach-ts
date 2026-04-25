import { FileHeader } from './fileHeader.js';
import { BatchHeader } from './batchHeader.js';
import { BatchControl, newBatchControl } from './batchControl.js';
import { FileControl, newFileControl } from './fileControl.js';
import { EntryDetail } from './entryDetail.js';
import { IATBatchHeader } from './iatBatchHeader.js';
import { IATEntryDetail } from './iatEntryDetail.js';
import { converters } from './utils/converters.js';
import { classifyAmount, aba8 } from './utils/amounts.js';
import type { StreamingBatchHeader, StreamingEntryDetail } from './streamingReader.js';

export interface StreamingWriterOpts {
  lineEnding?: string;
  bypassValidation?: boolean;
}

const paddingLine = '9'.repeat(94);

/**
 * StreamingWriter writes ACH records incrementally via an async callback,
 * computing BatchControl and FileControl totals on the fly. It auto-detects
 * batch transitions, so you just feed it entries one at a time.
 *
 * Usage:
 * ```ts
 * import { createWriteStream } from 'node:fs';
 * import { createReadStream } from 'node:fs';
 * import { createInterface } from 'node:readline';
 *
 * const rl = createInterface({ input: createReadStream('input.ach') });
 * const out = createWriteStream('output.ach');
 * const sr = new StreamingReader(rl);
 * const sw = new StreamingWriter(fileHeader, (line) => { out.write(line); });
 *
 * for await (const { batchHeader, entry } of sr.entries()) {
 *   await sw.writeEntry(batchHeader, entry);
 * }
 * await sw.close();
 * out.end();
 * ```
 */
export class StreamingWriter {
  private sink: (line: string) => void | Promise<void>;
  private lineEnding: string;
  private bypassValidation: boolean;

  // Current batch state
  private currentBatchHeader: StreamingBatchHeader | null = null;
  private batchEntryAddendaCount = 0;
  private batchEntryHash = 0;
  private batchTotalDebit = 0;
  private batchTotalCredit = 0;

  // File-level accumulators
  private fileBatchCount = 0;
  private fileEntryAddendaCount = 0;
  private fileEntryHash = 0;
  private fileTotalDebit = 0;
  private fileTotalCredit = 0;
  private lineCount = 0;

  private closed = false;

  constructor(header: FileHeader, sink: (line: string) => void | Promise<void>, opts?: StreamingWriterOpts) {
    this.sink = sink;
    this.lineEnding = opts?.lineEnding ?? '\n';
    this.bypassValidation = opts?.bypassValidation ?? false;

    // Write the FileHeader immediately (synchronously started)
    this.emitLine(header.string());
  }

  /**
   * Write an entry and its addenda records. Batch transitions are detected
   * automatically — when the batch header changes, the previous batch's
   * BatchControl is written and the new BatchHeader is emitted.
   */
  async writeEntry(batchHeader: StreamingBatchHeader, entry: StreamingEntryDetail): Promise<void> {
    if (this.closed) {
      throw new Error('StreamingWriter is closed');
    }

    // Detect batch transition
    if (!this.isSameBatch(batchHeader)) {
      if (this.currentBatchHeader !== null) {
        await this.endBatch();
      }
      await this.startBatch(batchHeader);
    }

    // Write entry line
    await this.emitLine(entry.string());

    // Write addenda in the same order as Writer
    let addendaLines = 0;
    if (entry instanceof EntryDetail) {
      addendaLines = this.writeEntryAddenda(entry);
    } else if (entry instanceof IATEntryDetail) {
      addendaLines = this.writeIATEntryAddenda(entry);
    }

    // Update batch accumulators
    this.batchEntryAddendaCount += 1 + addendaLines;
    this.batchEntryHash += parseInt(aba8(entry.rdfiIdentification), 10) || 0;

    const { credit, debit } = classifyAmount(entry.transactionCode, entry.amount);
    this.batchTotalCredit += credit;
    this.batchTotalDebit += debit;
  }

  /**
   * Finalize the file: flush the last batch, write FileControl, and pad
   * to block boundary (multiple of 10 lines).
   */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;

    // Flush the last batch
    if (this.currentBatchHeader !== null) {
      await this.endBatch();
    }

    // Build FileControl
    const fc = newFileControl();
    fc.batchCount = this.fileBatchCount;
    fc.entryAddendaCount = this.fileEntryAddendaCount;
    fc.entryHash = converters.leastSignificantDigits(this.fileEntryHash, 10);
    fc.totalDebitEntryDollarAmountInFile = this.fileTotalDebit;
    fc.totalCreditEntryDollarAmountInFile = this.fileTotalCredit;

    // +1 for the FileControl line itself
    const totalRecords = this.lineCount + 1;
    fc.blockCount = totalRecords % 10 === 0
      ? totalRecords / 10
      : Math.floor(totalRecords / 10) + 1;

    await this.emitLine(fc.string());

    // Pad to block boundary
    if (this.lineCount % 10 !== 0) {
      const padCount = 10 - (this.lineCount % 10);
      for (let i = 0; i < padCount; i++) {
        await this.emitLineRaw(paddingLine + this.lineEnding);
      }
    }
  }

  private isSameBatch(bh: StreamingBatchHeader): boolean {
    if (this.currentBatchHeader === null) return false;

    // If the incoming header has the same object reference, it's always the same batch
    if (bh === this.currentBatchHeader) return true;

    // Different types (BatchHeader vs IATBatchHeader) → different batch
    if (bh instanceof BatchHeader && this.currentBatchHeader instanceof BatchHeader) {
      // If batch numbers are explicitly set and differ, it's a different batch
      if (bh.batchNumber > 0 && this.currentBatchHeader.batchNumber > 0 &&
          bh.batchNumber !== this.currentBatchHeader.batchNumber) {
        return false;
      }
      return (
        bh.serviceClassCode === this.currentBatchHeader.serviceClassCode &&
        bh.standardEntryClassCode === this.currentBatchHeader.standardEntryClassCode &&
        bh.companyIdentification === this.currentBatchHeader.companyIdentification &&
        bh.companyEntryDescription === this.currentBatchHeader.companyEntryDescription &&
        bh.effectiveEntryDate === this.currentBatchHeader.effectiveEntryDate &&
        bh.odfiIdentification === this.currentBatchHeader.odfiIdentification
      );
    }

    if (bh instanceof IATBatchHeader && this.currentBatchHeader instanceof IATBatchHeader) {
      if (bh.batchNumber > 0 && this.currentBatchHeader.batchNumber > 0 &&
          bh.batchNumber !== this.currentBatchHeader.batchNumber) {
        return false;
      }
      return (
        bh.serviceClassCode === this.currentBatchHeader.serviceClassCode &&
        bh.standardEntryClassCode === this.currentBatchHeader.standardEntryClassCode &&
        bh.originatorIdentification === this.currentBatchHeader.originatorIdentification &&
        bh.companyEntryDescription === this.currentBatchHeader.companyEntryDescription &&
        bh.effectiveEntryDate === this.currentBatchHeader.effectiveEntryDate &&
        bh.odfiIdentification === this.currentBatchHeader.odfiIdentification
      );
    }

    return false;
  }

  private async startBatch(bh: StreamingBatchHeader): Promise<void> {
    this.fileBatchCount++;

    // Clone the header and assign batch number
    if (bh instanceof BatchHeader) {
      bh.batchNumber = this.fileBatchCount;
    } else {
      bh.batchNumber = this.fileBatchCount;
    }
    this.currentBatchHeader = bh;

    // Reset batch accumulators
    this.batchEntryAddendaCount = 0;
    this.batchEntryHash = 0;
    this.batchTotalDebit = 0;
    this.batchTotalCredit = 0;

    await this.emitLine(bh.string());
  }

  private async endBatch(): Promise<void> {
    if (this.currentBatchHeader === null) return;

    const bc = newBatchControl();
    bc.entryAddendaCount = this.batchEntryAddendaCount;
    bc.entryHash = converters.leastSignificantDigits(this.batchEntryHash, 10);
    bc.totalDebitEntryDollarAmount = this.batchTotalDebit;
    bc.totalCreditEntryDollarAmount = this.batchTotalCredit;
    bc.batchNumber = this.fileBatchCount;

    if (this.currentBatchHeader instanceof BatchHeader) {
      bc.serviceClassCode = this.currentBatchHeader.serviceClassCode;
      bc.companyIdentification = this.currentBatchHeader.companyIdentification;
      bc.odfiIdentification = this.currentBatchHeader.odfiIdentification;
    } else {
      bc.serviceClassCode = this.currentBatchHeader.serviceClassCode;
      bc.companyIdentification = this.currentBatchHeader.originatorIdentification;
      bc.odfiIdentification = this.currentBatchHeader.odfiIdentification;
    }

    await this.emitLine(bc.string());

    // Roll up into file-level accumulators
    this.fileEntryAddendaCount += this.batchEntryAddendaCount;
    this.fileEntryHash += this.batchEntryHash;
    this.fileTotalDebit += this.batchTotalDebit;
    this.fileTotalCredit += this.batchTotalCredit;

    this.currentBatchHeader = null;
  }

  /** Write addenda for a regular EntryDetail. Returns addenda line count. */
  private writeEntryAddenda(entry: EntryDetail): number {
    let count = 0;
    if (entry.addenda02) {
      this.emitLine(entry.addenda02.string());
      count++;
    }
    for (const a05 of entry.addenda05) {
      if (a05) {
        this.emitLine(a05.string());
        count++;
      }
    }
    if (entry.addenda98) {
      this.emitLine(entry.addenda98.string());
      count++;
    }
    if (entry.addenda98Refused) {
      this.emitLine(entry.addenda98Refused.string());
      count++;
    }
    if (entry.addenda99) {
      this.emitLine(entry.addenda99.string());
      count++;
    }
    if (entry.addenda99Dishonored) {
      this.emitLine(entry.addenda99Dishonored.string());
      count++;
    }
    if (entry.addenda99Contested) {
      this.emitLine(entry.addenda99Contested.string());
      count++;
    }
    return count;
  }

  /** Write addenda for an IATEntryDetail. Returns addenda line count. */
  private writeIATEntryAddenda(entry: IATEntryDetail): number {
    let count = 0;
    if (entry.addenda10) { this.emitLine(entry.addenda10.string()); count++; }
    if (entry.addenda11) { this.emitLine(entry.addenda11.string()); count++; }
    if (entry.addenda12) { this.emitLine(entry.addenda12.string()); count++; }
    if (entry.addenda13) { this.emitLine(entry.addenda13.string()); count++; }
    if (entry.addenda14) { this.emitLine(entry.addenda14.string()); count++; }
    if (entry.addenda15) { this.emitLine(entry.addenda15.string()); count++; }
    if (entry.addenda16) { this.emitLine(entry.addenda16.string()); count++; }
    for (const a17 of entry.addenda17) {
      if (a17) { this.emitLine(a17.string()); count++; }
    }
    for (const a18 of entry.addenda18) {
      if (a18) { this.emitLine(a18.string()); count++; }
    }
    if (entry.addenda98) { this.emitLine(entry.addenda98.string()); count++; }
    if (entry.addenda99) { this.emitLine(entry.addenda99.string()); count++; }
    return count;
  }

  /** Emit a single 94-char record line through the sink. */
  private emitLine(record: string): void | Promise<void> {
    this.lineCount++;
    return this.sink(record + this.lineEnding);
  }

  /** Emit a raw pre-formatted line (for padding). */
  private emitLineRaw(line: string): void | Promise<void> {
    return this.sink(line);
  }
}
