import {
  ADV, ATX, CTX,
  MixedDebitsAndCredits, CreditsOnly, DebitsOnly, AutomatedAccountingAdvices,
  CheckingCredit, CheckingReturnNOCCredit, CheckingPrenoteCredit, CheckingZeroDollarRemittanceCredit,
  CheckingDebit, CheckingReturnNOCDebit, CheckingPrenoteDebit, CheckingZeroDollarRemittanceDebit,
  SavingsCredit, SavingsReturnNOCCredit, SavingsPrenoteCredit, SavingsZeroDollarRemittanceCredit,
  SavingsDebit, SavingsReturnNOCDebit, SavingsPrenoteDebit, SavingsZeroDollarRemittanceDebit,
  GLCredit, GLReturnNOCCredit, GLPrenoteCredit, GLZeroDollarRemittanceCredit,
  GLDebit, GLReturnNOCDebit, GLPrenoteDebit, GLZeroDollarRemittanceDebit,
  LoanCredit, LoanReturnNOCCredit, LoanPrenoteCredit, LoanZeroDollarRemittanceCredit,
  LoanDebit, LoanReturnNOCDebit,
  CreditForDebitsOriginated, DebitForCreditsOriginated,
  CreditForCreditsReceived, DebitForDebitsReceived,
  CreditForCreditsRejected, DebitForDebitsRejectedBatches,
  CreditSummary, DebitSummary,
  CategoryReturn, CategoryNOC,
  CategoryForward,
} from './constants.js';
import type { ValidateOpts } from './validateOpts.js';
import { mergeValidateOpts } from './validateOpts.js';
import { FileHeader, newFileHeader } from './fileHeader.js';
import { FileControl, newFileControl } from './fileControl.js';
import { ADVFileControl, newADVFileControl } from './advFileControl.js';
import { BatchHeader, newBatchHeader } from './batchHeader.js';
import { BatchControl, newBatchControl } from './batchControl.js';
import { ADVBatchControl, newADVBatchControl } from './advBatchControl.js';
import { EntryDetail } from './entryDetail.js';
import { ADVEntryDetail } from './advEntryDetail.js';
import { IATBatch } from './iatBatch.js';
import { IATBatchHeader } from './iatBatchHeader.js';
import { IATEntryDetail } from './iatEntryDetail.js';
import { Addenda05, newAddenda05 } from './addenda05.js';
import { newAddenda98 } from './addenda98.js';
import { Addenda98Refused, newAddenda98Refused } from './addenda98Refused.js';
import { newAddenda99 } from './addenda99.js';
import { Addenda99Dishonored, newAddenda99Dishonored } from './addenda99Dishonored.js';
import { Addenda99Contested, newAddenda99Contested } from './addenda99Contested.js';
import { Addenda02, newAddenda02 } from './addenda02.js';
import { Addenda10 } from './addenda10.js';
import { Addenda11 } from './addenda11.js';
import { Addenda12 } from './addenda12.js';
import { Addenda13 } from './addenda13.js';
import { Addenda14 } from './addenda14.js';
import { Addenda15 } from './addenda15.js';
import { Addenda16 } from './addenda16.js';
import type { Batcher } from './batch.js';
import { Batch, newBatch, convertBatchType } from './batch.js';
import { Converters } from './utils/converters.js';
import {
  FileError,
  ErrFileNoBatches,
  ErrFileADVOnly,
  ErrFileCalculatedControlEquality,
  ErrFileBatchNumberAscending,
  ErrInvalidJSON,
  ACHError,
} from './errors/index.js';

const converters = new Converters();

// Date parsing formats (JS equivalents of Go's time layouts)
const datetimeFormats = [
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?Z$/,  // ISO 8601
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:[+-]\d{2}:\d{2})$/,  // RFC 3339
  /^(\d{2})\/(\d{2})\/(\d{4})$/,  // MM/DD/YYYY
];

export function datetimeParse(v: string): Date | null {
  if (!v) return null;

  // ISO 8601 / RFC 3339 patterns
  const isoMatch = v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/);
  if (isoMatch) {
    const d = new Date(v);
    if (!isNaN(d.getTime()) && d.getTime() !== 0) return d;
  }

  // DD/MM/YYYY
  const slashMatch = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (slashMatch) {
    const d = new Date(
      parseInt(slashMatch[3], 10),
      parseInt(slashMatch[1], 10) - 1,
      parseInt(slashMatch[2], 10),
    );
    if (!isNaN(d.getTime()) && d.getTime() !== 0) return d;
  }

  return null;
}

function formatYYMMDD(d: Date): string {
  const yy = String(d.getUTCFullYear() % 100).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

function formatHHmm(d: Date): string {
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}${mm}`;
}

/**
 * File contains the structures of a parsed ACH File.
 */
export class File {
  id = '';
  header: FileHeader;
  batches: Batcher[] = [];
  iatBatches: IATBatch[] = [];
  control: FileControl;
  advControl: ADVFileControl;
  notificationOfChange: Batcher[] = [];
  returnEntries: Batcher[] = [];
  validateOpts?: ValidateOpts;

  constructor() {
    this.header = newFileHeader();
    this.control = newFileControl();
    this.advControl = newADVFileControl();
  }

  // --- Configuration ---

  setHeader(h: FileHeader): File {
    this.header = h;
    return this;
  }

  setValidation(opts: ValidateOpts | undefined): void {
    this.validateOpts = opts;
    this.header.setValidation(opts);
  }

  getValidation(): ValidateOpts | undefined {
    return this.validateOpts;
  }

  // --- Batch management ---

  addBatch(batch: Batcher): Batcher[] {
    if (!batch) return this.batches;
    if (batch.category() === CategoryNOC) {
      this.notificationOfChange.push(batch);
    }
    if (batch.category() === CategoryReturn) {
      this.returnEntries.push(batch);
    }
    this.batches.push(batch);
    return this.batches;
  }

  removeBatch(batch: Batcher): void {
    if (batch.category() === CategoryNOC) {
      for (let i = 0; i < this.notificationOfChange.length; i++) {
        if (this.notificationOfChange[i].equal(batch)) {
          this.notificationOfChange.splice(i, 1);
          i--;
        }
      }
    }
    if (batch.category() === CategoryReturn) {
      for (let i = 0; i < this.returnEntries.length; i++) {
        if (this.returnEntries[i].equal(batch)) {
          this.returnEntries.splice(i, 1);
          i--;
        }
      }
    }
    for (let i = 0; i < this.batches.length; i++) {
      if (this.batches[i].equal(batch)) {
        this.batches.splice(i, 1);
        i--;
      }
    }
  }

  addIATBatch(iatBatch: IATBatch): IATBatch[] {
    this.iatBatches.push(iatBatch);
    return this.iatBatches;
  }

  // --- File type detection ---

  isADV(): boolean {
    for (const batch of this.batches) {
      if (!batch.getHeader()) {
        batch.setHeader(newBatchHeader());
      }
      if (!batch.getControl()) {
        batch.setControl(newBatchControl());
      }
      if (batch.getHeader().standardEntryClassCode === ADV) {
        return true;
      }
    }
    return false;
  }

  // --- Create ---

  create(): Error | null {
    const opts = this.validateOpts ?? {};
    if (!opts.skipAll) {
      if (!opts.allowMissingFileHeader) {
        const err = this.header.validate();
        if (err) return err;
      }
      if (!opts.allowZeroBatches && this.batches.length === 0 && this.iatBatches.length === 0) {
        return ErrFileNoBatches;
      }
    }

    if (!this.isADV()) {
      // add 2 for FileHeader/FileControl
      let totalRecordsInFile = 2;
      let batchSeq = 1;
      let fileEntryAddendaCount = 0;
      let fileEntryHashSum = 0;
      let totalDebitAmount = 0;
      let totalCreditAmount = 0;

      for (const batch of this.batches) {
        if (batch.getHeader().batchNumber <= 1) {
          batch.getHeader().batchNumber = batchSeq;
          batch.getControl().batchNumber = batchSeq;
        }
        batchSeq++;
        fileEntryAddendaCount += batch.getControl().entryAddendaCount;
        totalRecordsInFile += 2 + batch.getControl().entryAddendaCount;
        fileEntryHashSum += batch.getControl().entryHash;
        totalDebitAmount += batch.getControl().totalDebitEntryDollarAmount;
        totalCreditAmount += batch.getControl().totalCreditEntryDollarAmount;
      }

      for (const iatBatch of this.iatBatches) {
        if (iatBatch.header.batchNumber <= 1) {
          iatBatch.header.batchNumber = batchSeq;
          iatBatch.control.batchNumber = batchSeq;
        }
        batchSeq++;
        fileEntryAddendaCount += iatBatch.control.entryAddendaCount;
        totalRecordsInFile += 2 + iatBatch.control.entryAddendaCount;
        fileEntryHashSum += iatBatch.control.entryHash;
        totalDebitAmount += iatBatch.control.totalDebitEntryDollarAmount;
        totalCreditAmount += iatBatch.control.totalCreditEntryDollarAmount;
      }

      const fc = newFileControl();
      fc.id = this.id;
      fc.batchCount = batchSeq - 1;
      if (totalRecordsInFile % 10 !== 0) {
        fc.blockCount = Math.floor(totalRecordsInFile / 10) + 1;
      } else {
        fc.blockCount = totalRecordsInFile / 10;
      }
      fc.entryAddendaCount = fileEntryAddendaCount;
      fc.entryHash = converters.leastSignificantDigits(fileEntryHashSum, 10);
      fc.totalDebitEntryDollarAmountInFile = totalDebitAmount;
      fc.totalCreditEntryDollarAmountInFile = totalCreditAmount;
      this.control = fc;
    } else {
      const err = this.createFileADV();
      if (err) return err;
    }

    this.annotateLineNumbers();
    return null;
  }

  private createFileADV(): Error | null {
    let totalRecordsInFile = 2;
    let batchSeq = 1;
    let fileEntryAddendaCount = 0;
    let fileEntryHashSum = 0;
    let totalDebitAmount = 0;
    let totalCreditAmount = 0;

    for (const batch of this.batches) {
      if (batch.getHeader().standardEntryClassCode !== ADV) {
        return ErrFileADVOnly;
      }
      if (batch.getHeader().batchNumber <= 1) {
        batch.getHeader().batchNumber = batchSeq;
        batch.getADVControl().batchNumber = batchSeq;
      }
      batchSeq++;
      fileEntryAddendaCount += batch.getADVControl().entryAddendaCount;
      totalRecordsInFile += 2 + batch.getADVControl().entryAddendaCount;
      fileEntryHashSum += batch.getADVControl().entryHash;
      totalDebitAmount += batch.getADVControl().totalDebitEntryDollarAmount;
      totalCreditAmount += batch.getADVControl().totalCreditEntryDollarAmount;
    }

    const fc = newADVFileControl();
    fc.id = this.id;
    fc.batchCount = batchSeq - 1;
    if (totalRecordsInFile % 10 !== 0) {
      fc.blockCount = Math.floor(totalRecordsInFile / 10) + 1;
    } else {
      fc.blockCount = totalRecordsInFile / 10;
    }
    fc.entryAddendaCount = fileEntryAddendaCount;
    fc.entryHash = fileEntryHashSum;
    fc.totalDebitEntryDollarAmountInFile = totalDebitAmount;
    fc.totalCreditEntryDollarAmountInFile = totalCreditAmount;
    this.advControl = fc;
    return null;
  }

  // --- Validate ---

  validate(): Error | null {
    return this.validateWith(this.validateOpts);
  }

  validateWith(opts?: ValidateOpts): Error | null {
    if (!opts) opts = {};

    if (opts.skipAll) return null;

    if (!opts.allowMissingFileHeader) {
      const err = this.header.validateWith(opts);
      if (err) return err;
    }

    if (!this.isADV()) {
      if (this.control.batchCount !== (this.batches.length + this.iatBatches.length)) {
        return new ErrFileCalculatedControlEquality(
          'BatchCount', this.batches.length + this.iatBatches.length, this.control.batchCount,
        );
      }

      if (!opts.bypassBatchValidation) {
        for (const b of this.batches) {
          const err = b.validate();
          if (err) return err;
        }
      }

      if (!opts.allowMissingFileControl) {
        const err = this.control.validate();
        if (err) return err;
      }
      if (!opts.allowUnorderedBatchNumbers) {
        const err = this.isSequenceAscending();
        if (err) return err;
      }
      return this.validateTotals();
    }

    // ADV file
    if (this.advControl.batchCount !== this.batches.length) {
      return new ErrFileCalculatedControlEquality(
        'BatchCount', this.batches.length, this.advControl.batchCount,
      );
    }
    if (!opts.allowMissingFileControl) {
      const err = this.advControl.validate();
      if (err) return err;
    }
    return this.validateTotals();
  }

  // --- ValidateTotals ---

  validateTotals(): Error | null {
    const isADV = this.isADV();
    let err = this.isEntryAddendaCount(isADV);
    if (err) return err;
    err = this.isFileAmount(isADV);
    if (err) return err;
    err = this.isEntryHash(isADV);
    if (err) return err;
    for (const b of this.batches) {
      const bErr = b.validateTotals();
      if (bErr) return bErr;
    }
    for (const b of this.iatBatches) {
      const bErr = b.validateTotals();
      if (bErr) return bErr;
    }
    return this.isBatchCount(isADV);
  }

  private isBatchCount(isADV: boolean): Error | null {
    const batchCount = isADV ? this.advControl.batchCount : this.control.batchCount;
    const calculated = this.batches.length + this.iatBatches.length;
    if (calculated !== batchCount) {
      return new ErrFileCalculatedControlEquality('BatchCount', calculated, batchCount);
    }
    return null;
  }

  private isEntryAddendaCount(isADV: boolean): Error | null {
    let count = 0;
    if (!isADV) {
      for (const batch of this.batches) {
        count += batch.getControl().entryAddendaCount;
      }
      for (const iatBatch of this.iatBatches) {
        count += iatBatch.control.entryAddendaCount;
      }
      if (this.control.entryAddendaCount !== count) {
        if (this.validateOpts?.unequalAddendaCounts) return null;
        return new ErrFileCalculatedControlEquality('EntryAddendaCount', count, this.control.entryAddendaCount);
      }
    } else {
      for (const batch of this.batches) {
        count += batch.getADVControl().entryAddendaCount;
      }
      if (this.advControl.entryAddendaCount !== count) {
        if (this.validateOpts?.unequalAddendaCounts) return null;
        return new ErrFileCalculatedControlEquality('EntryAddendaCount', count, this.advControl.entryAddendaCount);
      }
    }
    return null;
  }

  private isFileAmount(isADV: boolean): Error | null {
    let debit = 0;
    let credit = 0;

    if (!isADV) {
      for (const batch of this.batches) {
        debit += batch.getControl().totalDebitEntryDollarAmount;
        credit += batch.getControl().totalCreditEntryDollarAmount;
      }
      for (const iatBatch of this.iatBatches) {
        debit += iatBatch.control.totalDebitEntryDollarAmount;
        credit += iatBatch.control.totalCreditEntryDollarAmount;
      }
      if (this.control.totalDebitEntryDollarAmountInFile !== debit) {
        return new ErrFileCalculatedControlEquality(
          'TotalDebitEntryDollarAmountInFile', debit, this.control.totalDebitEntryDollarAmountInFile,
        );
      }
      if (this.control.totalCreditEntryDollarAmountInFile !== credit) {
        return new ErrFileCalculatedControlEquality(
          'TotalCreditEntryDollarAmountInFile', credit, this.control.totalCreditEntryDollarAmountInFile,
        );
      }
    } else {
      for (const batch of this.batches) {
        debit += batch.getADVControl().totalDebitEntryDollarAmount;
        credit += batch.getADVControl().totalCreditEntryDollarAmount;
      }
      if (this.advControl.totalDebitEntryDollarAmountInFile !== debit) {
        return new ErrFileCalculatedControlEquality(
          'TotalDebitEntryDollarAmountInFile', debit, this.advControl.totalDebitEntryDollarAmountInFile,
        );
      }
      if (this.advControl.totalCreditEntryDollarAmountInFile !== credit) {
        return new ErrFileCalculatedControlEquality(
          'TotalCreditEntryDollarAmountInFile', credit, this.advControl.totalCreditEntryDollarAmountInFile,
        );
      }
    }
    return null;
  }

  private isEntryHash(isADV: boolean): Error | null {
    const hashField = this.calculateEntryHash(isADV);
    if (!isADV) {
      if (hashField !== this.control.entryHash) {
        return new ErrFileCalculatedControlEquality('EntryHash', hashField, this.control.entryHash);
      }
    } else {
      if (hashField !== this.advControl.entryHash) {
        return new ErrFileCalculatedControlEquality('EntryHash', hashField, this.advControl.entryHash);
      }
    }
    return null;
  }

  private calculateEntryHash(isADV: boolean): number {
    let hash = 0;
    if (!isADV) {
      for (const batch of this.batches) {
        hash += batch.getControl().entryHash;
      }
      for (const iatBatch of this.iatBatches) {
        hash += iatBatch.control.entryHash;
      }
    } else {
      for (const batch of this.batches) {
        hash += batch.getADVControl().entryHash;
      }
    }
    return converters.leastSignificantDigits(hash, 10);
  }

  private isSequenceAscending(): Error | null {
    let lastSeq = 0;
    for (const batch of this.batches) {
      const current = batch.getHeader().batchNumber;
      if (!this.validateOpts?.customTraceNumbers) {
        if (current <= lastSeq) {
          return new ErrFileBatchNumberAscending(lastSeq, current);
        }
      }
      lastSeq = current;
    }
    return null;
  }

  // --- Line number annotation ---

  annotateLineNumbers(): void {
    let n = 1;
    this.header.lineNumber = n;
    n++;

    const isADV = this.isADV();

    for (const b of this.batches) {
      n = annotateBatchLineNumbers(b, n);
    }
    for (const iatBatch of this.iatBatches) {
      n = annotateIATBatchLineNumbers(iatBatch, n);
    }

    if (!isADV) {
      this.control.lineNumber = n;
    } else {
      this.advControl.lineNumber = n;
    }
  }

  // --- Date/Time field normalization ---

  overwriteDateTimeFields(): void {
    // File header
    const headerDateParsed = datetimeParse(this.header.fileCreationDate);
    if (headerDateParsed) {
      this.header.fileCreationDate = formatYYMMDD(headerDateParsed);
    }
    const headerTimeParsed = datetimeParse(this.header.fileCreationTime);
    if (headerTimeParsed) {
      this.header.fileCreationTime = formatHHmm(headerTimeParsed);
    }

    // Batches
    for (const batch of this.batches) {
      const bh = batch.getHeader();
      const descDate = bh.companyDescriptiveDate;
      if (descDate) {
        const stripped = descDate.startsWith('SD') ? descDate.substring(2) : descDate;
        const parsed = datetimeParse(stripped);
        if (parsed) {
          bh.companyDescriptiveDate = 'SD' + formatHHmm(parsed);
        }
      }
      const effDate = datetimeParse(bh.effectiveEntryDate);
      if (effDate) {
        bh.effectiveEntryDate = formatYYMMDD(effDate);
      }
      batch.setHeader(bh);
    }

    // IAT Batches
    for (const iatBatch of this.iatBatches) {
      const effDate = datetimeParse(iatBatch.header.effectiveEntryDate);
      if (effDate) {
        iatBatch.header.effectiveEntryDate = formatYYMMDD(effDate);
      }
    }
  }

  // --- JSON serialization ---

  toJSON(): object {
    const obj: Record<string, unknown> = {
      id: this.id,
      fileHeader: this.header,
      batches: this.batches.map(b => ({
        batchHeader: b.getHeader(),
        entries: b.getEntries(),
        batchControl: b.getControl(),
      })),
      IATBatches: this.iatBatches.map(ib => ({
        IATBatchHeader: ib.header,
        IATEntries: ib.entries,
        batchControl: ib.control,
      })),
      fileControl: this.control,
      fileADVControl: this.advControl,
      NotificationOfChange: this.notificationOfChange,
      ReturnEntries: this.returnEntries,
    };
    if (this.validateOpts) {
      // Omit checkTransactionCode (it's a function)
      const { checkTransactionCode, ...serializable } = this.validateOpts;
      obj.validateOpts = serializable;
    }
    return obj;
  }

  // --- Reversal ---

  reversal(effectiveEntryDate: Date): Error | null {
    this.header.fileCreationDate = formatYYMMDD(effectiveEntryDate);
    this.header.fileCreationTime = formatHHmm(effectiveEntryDate);

    for (let i = 0; i < this.batches.length; i++) {
      const bh = this.batches[i].getHeader();
      bh.companyEntryDescription = 'REVERSAL';
      bh.effectiveEntryDate = formatYYMMDD(effectiveEntryDate);

      let hasCredits = false;
      let hasDebits = false;

      const entries = this.batches[i].getEntries();
      for (let j = 0; j < entries.length; j++) {
        switch (entries[j].transactionCode) {
          case CheckingCredit:
          case CheckingReturnNOCCredit:
          case CheckingPrenoteCredit:
          case CheckingZeroDollarRemittanceCredit:
          case GLCredit:
          case GLPrenoteCredit:
          case GLReturnNOCCredit:
          case GLZeroDollarRemittanceCredit:
          case LoanPrenoteCredit:
          case LoanReturnNOCCredit:
          case LoanZeroDollarRemittanceCredit:
          case SavingsCredit:
          case SavingsPrenoteCredit:
          case SavingsReturnNOCCredit:
          case SavingsZeroDollarRemittanceCredit:
            // Credit -> Debit
            hasDebits = true;
            entries[j].transactionCode += 5;
            break;

          case LoanCredit:
            hasDebits = true;
            entries[j].transactionCode += 3;
            break;

          case CheckingDebit:
          case CheckingPrenoteDebit:
          case CheckingReturnNOCDebit:
          case CheckingZeroDollarRemittanceDebit:
          case GLDebit:
          case GLPrenoteDebit:
          case GLReturnNOCDebit:
          case GLZeroDollarRemittanceDebit:
          case LoanReturnNOCDebit:
          case SavingsDebit:
          case SavingsPrenoteDebit:
          case SavingsReturnNOCDebit:
          case SavingsZeroDollarRemittanceDebit:
            // Debit -> Credit
            hasCredits = true;
            entries[j].transactionCode -= 5;
            break;

          case LoanDebit:
            hasCredits = true;
            entries[j].transactionCode -= 3;
            break;
        }
      }

      // Re-calculate control record — swap debits and credits
      const bc = this.batches[i].getControl();
      const prevDebits = bc.totalDebitEntryDollarAmount;
      bc.totalDebitEntryDollarAmount = bc.totalCreditEntryDollarAmount;
      bc.totalCreditEntryDollarAmount = prevDebits;

      // Fixup ServiceClassCode
      if (hasCredits) {
        bh.serviceClassCode = CreditsOnly;
        bc.serviceClassCode = CreditsOnly;
      }
      if (hasDebits) {
        bh.serviceClassCode = DebitsOnly;
        bc.serviceClassCode = DebitsOnly;
      }
      if (hasCredits && hasDebits) {
        bh.serviceClassCode = MixedDebitsAndCredits;
        bc.serviceClassCode = MixedDebitsAndCredits;
      }

      // Update header and control
      this.batches[i].setHeader(bh);
      this.batches[i].setControl(bc);

      // Rebuild the batch
      if (this.batches[i] instanceof Batch) {
        const err = (this.batches[i] as Batch).create();
        if (err) return new Error(`rebuilding batch index ${i} failed: ${err.message}`);
      }
    }
    return this.create();
  }

  // --- Segmentation ---

  segmentFile(): [File | null, File | null, Error | null] {
    const valErr = this.validate();
    if (valErr) return [null, null, valErr];

    const creditFile = newFile();
    const debitFile = newFile();

    if (this.validateOpts) {
      creditFile.setValidation(this.validateOpts);
      debitFile.setValidation(this.validateOpts);
    }

    if (this.batches.length > 0) {
      const err = this.segmentFileBatches(creditFile, debitFile);
      if (err) return [null, null, err];
    }

    if (this.iatBatches.length > 0) {
      this.segmentFileIATBatches(creditFile, debitFile);
    }

    if (creditFile.batches.length > 0 || creditFile.iatBatches.length > 0) {
      this.addFileHeaderData(creditFile);
      let err = creditFile.create();
      if (err) return [null, null, err];
      err = creditFile.validate();
      if (err) return [null, null, err];
    }
    if (debitFile.batches.length > 0 || debitFile.iatBatches.length > 0) {
      this.addFileHeaderData(debitFile);
      let err = debitFile.create();
      if (err) return [null, null, err];
      err = debitFile.validate();
      if (err) return [null, null, err];
    }

    return [creditFile, debitFile, null];
  }

  private segmentFileBatches(creditFile: File, debitFile: File): Error | null {
    for (const batch of this.batches) {
      const bh = batch.getHeader();

      if (bh.standardEntryClassCode === ADV) {
        if (bh.serviceClassCode === AutomatedAccountingAdvices) {
          const segBh = createSegmentFileBatchHeader(AutomatedAccountingAdvices, bh);
          const [creditBatch] = newBatch(segBh);
          const segBh2 = createSegmentFileBatchHeader(AutomatedAccountingAdvices, bh);
          const [debitBatch] = newBatch(segBh2);

          for (const entry of batch.getADVEntries()) {
            const err = segmentFileBatchAddADVEntry(creditBatch, debitBatch, entry);
            if (err) return err;
          }
          if (creditBatch && creditBatch.getADVEntries().length > 0) {
            creditBatch.create();
            creditFile.addBatch(creditBatch);
          }
          if (debitBatch && debitBatch.getADVEntries().length > 0) {
            debitBatch.create();
            debitFile.addBatch(debitBatch);
          }
        }
      } else {
        switch (bh.serviceClassCode) {
          case MixedDebitsAndCredits: {
            const cbh = createSegmentFileBatchHeader(CreditsOnly, bh);
            const [creditBatch] = newBatch(cbh);
            const dbh = createSegmentFileBatchHeader(DebitsOnly, bh);
            const [debitBatch] = newBatch(dbh);

            for (const entry of batch.getEntries()) {
              const err = segmentFileBatchAddEntry(creditBatch, debitBatch, entry);
              if (err) return err;
            }
            if (creditBatch && creditBatch.getEntries().length > 0) {
              creditBatch.create();
              creditFile.addBatch(creditBatch);
            }
            if (debitBatch && debitBatch.getEntries().length > 0) {
              debitBatch.create();
              debitFile.addBatch(debitBatch);
            }
            break;
          }
          case CreditsOnly:
            creditFile.addBatch(batch);
            break;
          case DebitsOnly:
            debitFile.addBatch(batch);
            break;
        }
      }
    }
    return null;
  }

  private segmentFileIATBatches(creditFile: File, debitFile: File): void {
    for (const iatb of this.iatBatches) {
      const IATBh = iatb.header;

      switch (IATBh.serviceClassCode) {
        case MixedDebitsAndCredits: {
          const cbh = createSegmentFileIATBatchHeader(CreditsOnly, IATBh);
          const creditIATBatch = new IATBatch(cbh);
          const dbh = createSegmentFileIATBatchHeader(DebitsOnly, IATBh);
          const debitIATBatch = new IATBatch(dbh);

          for (const IATEntry of iatb.entries) {
            IATEntry.traceNumber = ''; // unset so batch.build generates a TraceNumber
            if (isCreditTransactionCode(IATEntry.transactionCode)) {
              creditIATBatch.addEntry(IATEntry);
            } else if (isDebitTransactionCode(IATEntry.transactionCode)) {
              debitIATBatch.addEntry(IATEntry);
            }
          }

          if (creditIATBatch.entries.length > 0) {
            creditIATBatch.create();
            creditFile.addIATBatch(creditIATBatch);
          }
          if (debitIATBatch.entries.length > 0) {
            debitIATBatch.create();
            debitFile.addIATBatch(debitIATBatch);
          }
          break;
        }
        case CreditsOnly:
          creditFile.addIATBatch(iatb);
          break;
        case DebitsOnly:
          debitFile.addIATBatch(iatb);
          break;
      }
    }
  }

  addFileHeaderData(file: File): File {
    file.id = generateID();
    file.header.id = generateID();
    file.header.immediateOrigin = this.header.immediateOrigin;
    file.header.immediateDestination = this.header.immediateDestination;
    const now = new Date();
    file.header.fileCreationDate = formatYYMMDD(now);
    file.header.fileCreationTime = formatHHmm(now);
    file.header.fileIDModifier = this.header.fileIDModifier;
    file.header.immediateDestinationName = this.header.immediateDestinationName;
    file.header.immediateOriginName = this.header.immediateOriginName;
    return file;
  }

  // --- Flatten Batches ---

  flattenBatches(): [File | null, Error | null] {
    return flatten(this);
  }
}

// --- Factory ---

export function newFile(): File {
  return new File();
}

// --- JSON key remapping (Go JSON tags → TypeScript property names) ---

// Maps Go-style JSON keys to our camelCase TypeScript property names.
// Only includes keys where the Go json tag differs from our TS property name.
const jsonKeyMap: Record<string, string> = {
  // BatchHeader / BatchControl / ADVBatchControl / IATBatchHeader
  ODFIIdentification: 'odfiIdentification',
  // EntryDetail / ADVEntryDetail / IATEntryDetail
  RDFIIdentification: 'rdfiIdentification',
  DFIAccountNumber: 'dfiAccountNumber',
  // IATEntryDetail
  AddendaRecords: 'addendaRecords',
  OFACScreeningIndicator: 'ofacScreeningIndicator',
  SecondaryOFACScreeningIndicator: 'secondaryOFACScreeningIndicator',
  // BatchControl / ADVBatchControl
  totalDebit: 'totalDebitEntryDollarAmount',
  totalCredit: 'totalCreditEntryDollarAmount',
  messageAuthentication: 'messageAuthenticationCode',
  // IATBatchHeader
  ISODestinationCountryCode: 'isoDestinationCountryCode',
  ISOOriginatingCurrencyCode: 'isoOriginatingCurrencyCode',
  ISODestinationCurrencyCode: 'isoDestinationCurrencyCode',
  IATIndicator: 'iatIndicator',
  // Addenda13
  ODFIName: 'odfiName',
  ODFIIDNumberQualifier: 'odfiIDNumberQualifier',
  ODFIBranchCountryCode: 'odfiBranchCountryCode',
  // Addenda14
  RDFIName: 'rdfiName',
  RDFIIDNumberQualifier: 'rdfiIDNumberQualifier',
  RDFIBranchCountryCode: 'rdfiBranchCountryCode',
};

// FileControl / ADVFileControl have different target names for totalDebit/totalCredit
const fileControlKeyMap: Record<string, string> = {
  totalDebit: 'totalDebitEntryDollarAmountInFile',
  totalCredit: 'totalCreditEntryDollarAmountInFile',
};

function remapKeys(
  obj: Record<string, unknown>,
  extraMap?: Record<string, string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    // Skip internal/private fields that should not be assigned to class instances
    if (k === 'validators' || k === 'converters' || k === 'validateOpts') continue;
    const mapped = extraMap?.[k] ?? jsonKeyMap[k] ?? k;
    // Recursively remap nested objects (addenda records, etc.)
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[mapped] = remapKeys(v as Record<string, unknown>, extraMap);
    } else if (Array.isArray(v)) {
      out[mapped] = v.map((item) =>
        item && typeof item === 'object' && !Array.isArray(item)
          ? remapKeys(item as Record<string, unknown>, extraMap)
          : item,
      );
    } else {
      out[mapped] = v;
    }
  }
  return out;
}

// --- JSON deserialization ---

export function fileFromJSON(bs: string | Uint8Array): [File | null, Error | null] {
  return fileFromJSONWith(bs, undefined);
}

export function fileFromJSONWith(
  bs: string | Uint8Array,
  opts: ValidateOpts | undefined,
): [File | null, Error | null] {
  const raw = typeof bs === 'string' ? bs : String.fromCharCode(...bs);
  if (!raw || raw.trim().length === 0) {
    return [null, new Error('no JSON data provided')];
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [null, new Error(`problem reading File: ${ErrInvalidJSON.message}`)];
  }

  // Read ValidateOpts from JSON
  const jsonOpts = parsed.validateOpts as ValidateOpts | undefined;
  const mergedOpts = mergeValidateOpts(opts, jsonOpts);

  const out = newFile();
  out.setValidation(mergedOpts);

  // Read file root level
  if (typeof parsed.id === 'string') {
    out.id = parsed.id;
  }

  // Read FileHeader
  if (parsed.fileHeader && typeof parsed.fileHeader === 'object') {
    Object.assign(out.header, remapKeys(parsed.fileHeader as Record<string, unknown>));
  }

  // Build batches from JSON
  const batchErr = setBatchesFromJSON(out, parsed);
  if (batchErr) return [null, batchErr];

  // Overwrite date/time fields
  out.overwriteDateTimeFields();

  // Read FileControl
  if (!out.isADV()) {
    if (parsed.fileControl && typeof parsed.fileControl === 'object') {
      const fc = newFileControl();
      Object.assign(fc, remapKeys(parsed.fileControl as Record<string, unknown>, fileControlKeyMap));
      out.control = fc;
    }
  } else {
    if (parsed.advFileControl && typeof parsed.advFileControl === 'object') {
      const afc = newADVFileControl();
      Object.assign(afc, remapKeys(parsed.advFileControl as Record<string, unknown>, fileControlKeyMap));
      out.advControl = afc;
    } else if (parsed.fileADVControl && typeof parsed.fileADVControl === 'object') {
      const afc = newADVFileControl();
      Object.assign(afc, remapKeys(parsed.fileADVControl as Record<string, unknown>, fileControlKeyMap));
      out.advControl = afc;
    }
  }

  if (!out.isADV()) {
    out.control.batchCount = out.batches.length;
  } else {
    out.advControl.batchCount = out.batches.length;
  }

  let err = out.create();
  if (err) return [out, err];
  err = out.validate();
  if (err) return [out, err];
  return [out, null];
}

function setBatchesFromJSON(file: File, parsed: Record<string, unknown>): Error | null {
  // Parse regular batches
  const batchesArr = parsed.batches as Array<Record<string, unknown>> | undefined;
  if (batchesArr && Array.isArray(batchesArr)) {
    for (const batchJSON of batchesArr) {
      if (!batchJSON || typeof batchJSON !== 'object') continue;
      const headerObj = batchJSON.batchHeader as Record<string, unknown> | undefined;
      if (!headerObj) continue;

      const bh = newBatchHeader();
      Object.assign(bh, remapKeys(headerObj));
      bh.setValidation(file.validateOpts);

      const batch = new Batch(bh);
      batch.setID(bh.id);
      batch.setValidation(file.validateOpts ?? {});

      const secCode = (bh.standardEntryClassCode || '').toUpperCase();

      // Parse entries (Go JSON key: "entryDetails")
      const entriesArr = (batchJSON.entryDetails ?? batchJSON.entries) as Array<Record<string, unknown>> | undefined;
      if (entriesArr && Array.isArray(entriesArr)) {
        for (const entryJSON of entriesArr) {
          if (!entryJSON || typeof entryJSON !== 'object') continue;
          const entry = new EntryDetail();
          Object.assign(entry, remapKeys(entryJSON));
          hydrateEntryAddenda(entry);
          if (file.validateOpts) entry.setValidation(file.validateOpts);

          setEntryRecordType(entry);

          if (!entry.secCode) {
            entry.setSECCode(secCode);
          }

          // Handle ATX/CTX special field handling
          if (secCode === ATX || secCode === CTX) {
            handleATXCTXEntry(entry);
          }

          batch.addEntry(entry);
        }
      }

      // Parse ADV entries (Go JSON key: "advEntryDetails")
      const advEntriesArr = (batchJSON.advEntryDetails ?? batchJSON.advEntries) as Array<Record<string, unknown>> | undefined;
      if (advEntriesArr && Array.isArray(advEntriesArr)) {
        for (const advJSON of advEntriesArr) {
          if (!advJSON || typeof advJSON !== 'object') continue;
          const advEntry = new ADVEntryDetail();
          Object.assign(advEntry, remapKeys(advJSON));
          setADVEntryRecordType(advEntry);
          batch.addADVEntry(advEntry);
        }
      }

      // Parse batch control if provided
      const bcObj = batchJSON.batchControl as Record<string, unknown> | undefined;
      if (bcObj) {
        const bc = newBatchControl();
        Object.assign(bc, remapKeys(bcObj));
        batch.setControl(bc);
      }

      // Parse ADV batch control if provided
      const advBcObj = batchJSON.advBatchControl as Record<string, unknown> | undefined;
      if (advBcObj) {
        const abc = newADVBatchControl();
        Object.assign(abc, remapKeys(advBcObj));
        batch.setADVControl(abc);
      }

      // Build the batch — call protected build via type assertion
      const buildErr = (batch as unknown as { build(): Error | null }).build();
      if (buildErr) {
        return batch.batchError('Invalid Batch', buildErr, bh.id);
      }

      // Convert to proper SEC type
      file.batches.push(convertBatchType(batch));
    }
  }

  // Parse IAT batches
  const iatBatchesArr = (parsed.iatBatches ?? parsed.IATBatches) as Array<Record<string, unknown>> | undefined;
  if (iatBatchesArr && Array.isArray(iatBatchesArr)) {
    for (const iatJSON of iatBatchesArr) {
      if (!iatJSON || typeof iatJSON !== 'object') continue;
      const headerObj = (iatJSON.IATBatchHeader ?? iatJSON.iatBatchHeader) as Record<string, unknown> | undefined;
      if (!headerObj) continue;

      const bh = IATBatchHeader.newIATBatchHeader();
      Object.assign(bh, remapKeys(headerObj));

      const iatBatch = new IATBatch(bh);
      iatBatch.id = bh.id;
      if (file.validateOpts) iatBatch.setValidation(file.validateOpts);

      // Parse IAT entries (Go JSON key: "IATEntryDetails")
      const entriesArr = (iatJSON.IATEntryDetails ?? iatJSON.IATEntries ?? iatJSON.iatEntries ?? iatJSON.entries) as Array<Record<string, unknown>> | undefined;
      if (entriesArr && Array.isArray(entriesArr)) {
        for (const entryJSON of entriesArr) {
          if (!entryJSON || typeof entryJSON !== 'object') continue;
          const entry = new IATEntryDetail();
          Object.assign(entry, remapKeys(entryJSON));
          hydrateIATEntryAddenda(entry);
          setIATEntryRecordType(entry);
          iatBatch.addEntry(entry);
        }
      }

      // Parse IAT batch control if provided (to preserve fields like companyIdentification)
      const iatBcObj = iatJSON.batchControl as Record<string, unknown> | undefined;

      const buildErr = iatBatch.build();
      if (buildErr) return buildErr;

      // Merge any JSON batch control fields back (build() recreates control)
      if (iatBcObj) {
        const parsed = remapKeys(iatBcObj);
        if (typeof parsed.companyIdentification === 'string' && parsed.companyIdentification) {
          iatBatch.control.companyIdentification = parsed.companyIdentification;
        }
      }

      file.iatBatches.push(iatBatch);
    }
  }

  return null;
}

// --- Helper functions for JSON parsing ---

// Reconstruct addenda class instances from plain objects after Object.assign
function hydrateEntryAddenda(e: EntryDetail): void {
  if (!e) return;
  if (e.addenda02 && !(e.addenda02 instanceof Addenda02)) {
    const a = newAddenda02();
    Object.assign(a, e.addenda02);
    a.typeCode = '02';
    e.addenda02 = a;
  }
  if (e.addenda05 && Array.isArray(e.addenda05)) {
    e.addenda05 = e.addenda05.map((plain: unknown) => {
      if (plain instanceof Addenda05) return plain;
      const a = newAddenda05();
      Object.assign(a, plain);
      a.typeCode = '05';
      return a;
    });
  }
  if (e.addenda98 && typeof e.addenda98 === 'object') {
    const a = newAddenda98();
    Object.assign(a, e.addenda98);
    a.typeCode = '98';
    e.addenda98 = a;
  }
  if (e.addenda99 && typeof e.addenda99 === 'object') {
    const a = newAddenda99();
    Object.assign(a, e.addenda99);
    a.typeCode = '99';
    e.addenda99 = a;
  }
  if (e.addenda98Refused && !(e.addenda98Refused instanceof Addenda98Refused)) {
    const a = newAddenda98Refused();
    Object.assign(a, e.addenda98Refused);
    a.typeCode = '98';
    e.addenda98Refused = a;
  }
  if (e.addenda99Dishonored && !(e.addenda99Dishonored instanceof Addenda99Dishonored)) {
    const a = newAddenda99Dishonored();
    Object.assign(a, e.addenda99Dishonored);
    a.typeCode = '99';
    e.addenda99Dishonored = a;
  }
  if (e.addenda99Contested && !(e.addenda99Contested instanceof Addenda99Contested)) {
    const a = newAddenda99Contested();
    Object.assign(a, e.addenda99Contested);
    a.typeCode = '99';
    e.addenda99Contested = a;
  }
}

function hydrateIATEntryAddenda(e: IATEntryDetail): void {
  if (!e) return;
  if (e.addenda10 && !(e.addenda10 instanceof Addenda10)) {
    const a = new Addenda10();
    Object.assign(a, remapKeys(e.addenda10 as unknown as Record<string, unknown>));
    a.typeCode = '10';
    e.addenda10 = a;
  }
  if (e.addenda11 && !(e.addenda11 instanceof Addenda11)) {
    const a = new Addenda11();
    Object.assign(a, remapKeys(e.addenda11 as unknown as Record<string, unknown>));
    a.typeCode = '11';
    e.addenda11 = a;
  }
  if (e.addenda12 && !(e.addenda12 instanceof Addenda12)) {
    const a = new Addenda12();
    Object.assign(a, remapKeys(e.addenda12 as unknown as Record<string, unknown>));
    a.typeCode = '12';
    e.addenda12 = a;
  }
  if (e.addenda13 && !(e.addenda13 instanceof Addenda13)) {
    const a = new Addenda13();
    Object.assign(a, remapKeys(e.addenda13 as unknown as Record<string, unknown>));
    a.typeCode = '13';
    e.addenda13 = a;
  }
  if (e.addenda14 && !(e.addenda14 instanceof Addenda14)) {
    const a = new Addenda14();
    Object.assign(a, remapKeys(e.addenda14 as unknown as Record<string, unknown>));
    a.typeCode = '14';
    e.addenda14 = a;
  }
  if (e.addenda15 && !(e.addenda15 instanceof Addenda15)) {
    const a = new Addenda15();
    Object.assign(a, remapKeys(e.addenda15 as unknown as Record<string, unknown>));
    a.typeCode = '15';
    e.addenda15 = a;
  }
  if (e.addenda16 && !(e.addenda16 instanceof Addenda16)) {
    const a = new Addenda16();
    Object.assign(a, remapKeys(e.addenda16 as unknown as Record<string, unknown>));
    a.typeCode = '16';
    e.addenda16 = a;
  }
  if (e.addenda98 && typeof e.addenda98 === 'object') {
    const a = newAddenda98();
    Object.assign(a, remapKeys(e.addenda98 as unknown as Record<string, unknown>));
    a.typeCode = '98';
    e.addenda98 = a;
  }
  if (e.addenda99 && typeof e.addenda99 === 'object') {
    const a = newAddenda99();
    Object.assign(a, remapKeys(e.addenda99 as unknown as Record<string, unknown>));
    a.typeCode = '99';
    e.addenda99 = a;
  }
}

function setEntryRecordType(e: EntryDetail): void {
  if (!e) return;
  if (e.addenda02) e.addenda02.typeCode = '02';
  if (e.addenda05) {
    for (const a of e.addenda05) {
      if (a) a.typeCode = '05';
    }
  }
  if (e.addenda98) e.addenda98.typeCode = '98';
  if (e.addenda98Refused) e.addenda98Refused.typeCode = '98';
  if (e.addenda99) e.addenda99.typeCode = '99';
  if (e.addenda99Dishonored) e.addenda99Dishonored.typeCode = '99';
  if (e.addenda99Contested) e.addenda99Contested.typeCode = '99';
}

function setADVEntryRecordType(e: ADVEntryDetail): void {
  if (!e) return;
  if (!e.addenda99) {
    e.category = CategoryForward;
  }
}

function setIATEntryRecordType(e: IATEntryDetail): void {
  if (!e) return;
  if (e.addenda10) e.addenda10.typeCode = '10';
  if (e.addenda11) e.addenda11.typeCode = '11';
  if (e.addenda12) e.addenda12.typeCode = '12';
  if (e.addenda13) e.addenda13.typeCode = '13';
  if (e.addenda14) e.addenda14.typeCode = '14';
  if (e.addenda15) e.addenda15.typeCode = '15';
  if (e.addenda16) e.addenda16.typeCode = '16';
  if (e.addenda17) {
    for (const a of e.addenda17) {
      if (a) a.typeCode = '17';
    }
  }
  if (e.addenda18) {
    for (const a of e.addenda18) {
      if (a) a.typeCode = '18';
    }
  }
  if (e.addenda98) e.addenda98.typeCode = '98';
  if (e.addenda99) e.addenda99.typeCode = '99';
}

function handleATXCTXEntry(entry: EntryDetail): void {
  const addendaIndicator = entry.addendaRecordIndicator;
  const addendaField = parseInt(entry.catxAddendaRecordsField?.() ?? '0', 10) || 0;
  const individualName = entry.individualName;

  if (addendaIndicator > 0 && addendaField === 0) {
    entry.setCATXAddendaRecords?.(addendaIndicator);
  }
  if (addendaIndicator === 0 && addendaField > 0) {
    entry.setCATXAddendaRecords?.(addendaField);
  }
  if (addendaField === 0) {
    entry.setCATXReceivingCompany?.(individualName);
  }
}

// --- Line number annotation helpers ---

function annotateBatchLineNumbers(b: Batcher, startIndex: number): number {
  let n = startIndex;
  const bh = b.getHeader();
  if (bh) {
    bh.lineNumber = n;
    n++;
  }

  const isADV = bh?.standardEntryClassCode === ADV;

  if (!isADV) {
    for (const ed of b.getEntries()) {
      n = annotateEntryLineNumbers(ed, n);
    }
  } else {
    for (const ed of b.getADVEntries()) {
      n = annotateADVEntryLineNumbers(ed, n);
    }
  }

  if (!isADV) {
    const bc = b.getControl();
    if (bc) {
      bc.lineNumber = n;
      n++;
    }
  } else {
    const bc = b.getADVControl();
    if (bc) {
      bc.lineNumber = n;
      n++;
    }
  }
  return n;
}

function annotateIATBatchLineNumbers(b: IATBatch, startIndex: number): number {
  let n = startIndex;
  if (b.header) {
    b.header.lineNumber = n;
    n++;
  }

  for (const ed of b.entries) {
    n = annotateIATEntryLineNumbers(ed, n);
  }

  if (b.control) {
    b.control.lineNumber = n;
    n++;
  }
  return n;
}

function annotateEntryLineNumbers(ed: EntryDetail, startIndex: number): number {
  let n = startIndex;
  if (!ed) return n;

  ed.lineNumber = n;
  n++;

  if (ed.addenda02) { ed.addenda02.lineNumber = n; n++; }
  if (ed.addenda05) {
    for (const a05 of ed.addenda05) {
      if (a05) { a05.lineNumber = n; n++; }
    }
  }
  if (ed.addenda98) { ed.addenda98.lineNumber = n; n++; }
  if (ed.addenda98Refused) { ed.addenda98Refused.lineNumber = n; n++; }
  if (ed.addenda99) { ed.addenda99.lineNumber = n; n++; }
  if (ed.addenda99Dishonored) { ed.addenda99Dishonored.lineNumber = n; n++; }
  if (ed.addenda99Contested) { ed.addenda99Contested.lineNumber = n; n++; }
  return n;
}

function annotateADVEntryLineNumbers(ed: ADVEntryDetail, startIndex: number): number {
  let n = startIndex;
  if (!ed) return n;
  ed.lineNumber = n;
  n++;
  if (ed.addenda99) { ed.addenda99.lineNumber = n; n++; }
  return n;
}

function annotateIATEntryLineNumbers(ed: IATEntryDetail, startIndex: number): number {
  let n = startIndex;
  if (!ed) return n;

  ed.lineNumber = n;
  n++;

  if (ed.addenda10) { ed.addenda10.lineNumber = n; n++; }
  if (ed.addenda11) { ed.addenda11.lineNumber = n; n++; }
  if (ed.addenda12) { ed.addenda12.lineNumber = n; n++; }
  if (ed.addenda13) { ed.addenda13.lineNumber = n; n++; }
  if (ed.addenda14) { ed.addenda14.lineNumber = n; n++; }
  if (ed.addenda15) { ed.addenda15.lineNumber = n; n++; }
  if (ed.addenda16) { ed.addenda16.lineNumber = n; n++; }
  if (ed.addenda17) {
    for (const a17 of ed.addenda17) {
      if (a17) { a17.lineNumber = n; n++; }
    }
  }
  if (ed.addenda18) {
    for (const a18 of ed.addenda18) {
      if (a18) { a18.lineNumber = n; n++; }
    }
  }
  if (ed.addenda98) { ed.addenda98.lineNumber = n; n++; }
  if (ed.addenda99) { ed.addenda99.lineNumber = n; n++; }
  return n;
}

// --- Segmentation helpers ---

function createSegmentFileBatchHeader(serviceClassCode: number, bh: BatchHeader): BatchHeader {
  const nbh = newBatchHeader();
  nbh.id = generateID();
  nbh.serviceClassCode = serviceClassCode;
  nbh.companyName = bh.companyName;
  nbh.companyDiscretionaryData = bh.companyDiscretionaryData;
  nbh.companyIdentification = bh.companyIdentification;
  nbh.standardEntryClassCode = bh.standardEntryClassCode;
  nbh.companyEntryDescription = bh.companyEntryDescription;
  nbh.companyDescriptiveDate = bh.companyDescriptiveDate;
  nbh.effectiveEntryDate = bh.effectiveEntryDate;
  nbh.settlementDate = bh.settlementDate;
  if (serviceClassCode === AutomatedAccountingAdvices) {
    nbh.originatorStatusCode = 0;
  } else {
    nbh.originatorStatusCode = bh.originatorStatusCode;
  }
  nbh.odfiIdentification = bh.odfiIdentification;
  return nbh;
}

function createSegmentFileIATBatchHeader(serviceClassCode: number, iatBh: IATBatchHeader): IATBatchHeader {
  const nbh = IATBatchHeader.newIATBatchHeader();
  nbh.id = generateID();
  nbh.serviceClassCode = serviceClassCode;
  nbh.foreignExchangeIndicator = iatBh.foreignExchangeIndicator;
  nbh.foreignExchangeReferenceIndicator = iatBh.foreignExchangeReferenceIndicator;
  nbh.isoDestinationCountryCode = iatBh.isoDestinationCountryCode;
  nbh.originatorIdentification = iatBh.originatorIdentification;
  nbh.standardEntryClassCode = iatBh.standardEntryClassCode;
  nbh.companyEntryDescription = iatBh.companyEntryDescription;
  nbh.isoOriginatingCurrencyCode = iatBh.isoOriginatingCurrencyCode;
  nbh.isoDestinationCurrencyCode = iatBh.isoDestinationCurrencyCode;
  nbh.odfiIdentification = iatBh.odfiIdentification;
  return nbh;
}

function segmentFileBatchAddEntry(
  creditBatch: Batcher | null,
  debitBatch: Batcher | null,
  entry: EntryDetail,
): Error | null {
  if (isCreditTransactionCode(entry.transactionCode)) {
    if (!creditBatch) return new Error('missing creditBatch');
    creditBatch.addEntry(entry);
  } else if (isDebitTransactionCode(entry.transactionCode)) {
    if (!debitBatch) return new Error('missing debitBatch');
    debitBatch.addEntry(entry);
  }
  return null;
}

function segmentFileBatchAddADVEntry(
  creditBatch: Batcher | null,
  debitBatch: Batcher | null,
  entry: ADVEntryDetail,
): Error | null {
  switch (entry.transactionCode) {
    case CreditForDebitsOriginated:
    case CreditForCreditsReceived:
    case CreditForCreditsRejected:
    case CreditSummary:
      if (!creditBatch) return new Error('missing creditBatch');
      creditBatch.addADVEntry(entry);
      break;
    case DebitForCreditsOriginated:
    case DebitForDebitsReceived:
    case DebitForDebitsRejectedBatches:
    case DebitSummary:
      if (!debitBatch) return new Error('missing debitBatch');
      debitBatch.addADVEntry(entry);
      break;
  }
  return null;
}

// --- Transaction code classification ---

const creditTransactionCodes = new Set([
  CheckingCredit, CheckingReturnNOCCredit, CheckingPrenoteCredit, CheckingZeroDollarRemittanceCredit,
  SavingsCredit, SavingsReturnNOCCredit, SavingsPrenoteCredit, SavingsZeroDollarRemittanceCredit,
  GLCredit, GLReturnNOCCredit, GLPrenoteCredit, GLZeroDollarRemittanceCredit,
  LoanCredit, LoanReturnNOCCredit, LoanPrenoteCredit, LoanZeroDollarRemittanceCredit,
]);

const debitTransactionCodes = new Set([
  CheckingDebit, CheckingReturnNOCDebit, CheckingPrenoteDebit, CheckingZeroDollarRemittanceDebit,
  SavingsDebit, SavingsReturnNOCDebit, SavingsPrenoteDebit, SavingsZeroDollarRemittanceDebit,
  GLDebit, GLReturnNOCDebit, GLPrenoteDebit, GLZeroDollarRemittanceDebit,
  LoanDebit, LoanReturnNOCDebit,
]);

function isCreditTransactionCode(code: number): boolean {
  return creditTransactionCodes.has(code);
}

function isDebitTransactionCode(code: number): boolean {
  return debitTransactionCodes.has(code);
}

// --- Flatten ---

const ErrFlattenChangedEntryCount = new Error('Flatten operation changed entry and addenda count');
const ErrFlattenChangedDebitAmount = new Error('Flatten operation changed total debit entry amount');
const ErrFlattenChangedCreditAmount = new Error('Flatten operation changed total credit entry amount');

interface Mergeable {
  getHeaderSignature(): string;
  getTraceNumbers(): Map<string, boolean>;
  consume(other: Mergeable): Error | null;
  getBatch(): Batcher | IATBatch;
  getBatchNumber(): number;
  copy(): Mergeable;
  getEntryCount(): number;
  addToFile(file: File): Error | null;
}

class MergeableBatcher implements Mergeable {
  batcher: Batcher;
  private _traceNumbers: Map<string, boolean> | null = null;

  constructor(batcher: Batcher) {
    this.batcher = batcher;
  }

  getHeaderSignature(): string {
    return this.batcher.getHeader().string().substring(0, 87);
  }

  getBatch(): Batcher { return this.batcher; }
  getEntryCount(): number { return this.batcher.getEntries().length; }
  getBatchNumber(): number { return this.batcher.getHeader().batchNumber; }

  getTraceNumbers(): Map<string, boolean> {
    if (this._traceNumbers) return this._traceNumbers;
    this._traceNumbers = new Map();
    for (const entry of this.batcher.getEntries()) {
      this._traceNumbers.set(entry.traceNumber, true);
    }
    return this._traceNumbers;
  }

  consume(other: Mergeable): Error | null {
    const otherBatcher = other.getBatch() as Batcher;
    if (!otherBatcher?.getEntries) {
      return new Error(`cannot consume incompatible batch type`);
    }
    // Keep the lower batch number
    if (otherBatcher.getHeader().batchNumber < this.batcher.getHeader().batchNumber) {
      this.batcher.getHeader().batchNumber = otherBatcher.getHeader().batchNumber;
    }
    for (const entry of otherBatcher.getEntries()) {
      this.batcher.addEntry(entry);
    }
    for (const entry of otherBatcher.getADVEntries()) {
      this.batcher.addADVEntry(entry);
    }
    return null;
  }

  copy(): Mergeable {
    const [newBatcher_] = newBatch(this.batcher.getHeader());
    const newMergeable = new MergeableBatcher(newBatcher_!);
    newMergeable.consume(this);
    return newMergeable;
  }

  addToFile(file: File): Error | null {
    // Sort entries by trace number
    const entries = this.batcher.getEntries();
    entries.sort((a, b) => a.traceNumber < b.traceNumber ? -1 : a.traceNumber > b.traceNumber ? 1 : 0);

    // Inherit validation opts from file
    const opts = file.getValidation();
    if (opts) {
      this.batcher.setValidation(opts);
      for (const entry of this.batcher.getEntries()) {
        entry.setValidation(opts);
      }
      for (const entry of this.batcher.getADVEntries()) {
        entry.setValidation(opts);
      }
    }

    const err = this.batcher.create();
    if (err) return new Error(`mergeableBatcher - AddToFile: ${err.message}`);

    this.batcher.getHeader().batchNumber = 0;
    file.addBatch(this.batcher);
    return null;
  }
}

class MergeableIATBatch implements Mergeable {
  iatBatch: IATBatch;
  private _traceNumbers: Map<string, boolean> | null = null;

  constructor(iatBatch: IATBatch) {
    this.iatBatch = iatBatch;
  }

  getHeaderSignature(): string {
    return this.iatBatch.header.string().substring(0, 87);
  }

  getBatch(): IATBatch { return this.iatBatch; }
  getEntryCount(): number { return this.iatBatch.entries.length; }
  getBatchNumber(): number { return this.iatBatch.header.batchNumber; }

  getTraceNumbers(): Map<string, boolean> {
    if (this._traceNumbers) return this._traceNumbers;
    this._traceNumbers = new Map();
    for (const entry of this.iatBatch.entries) {
      this._traceNumbers.set(entry.traceNumber, true);
    }
    return this._traceNumbers;
  }

  consume(other: Mergeable): Error | null {
    const otherBatch = other.getBatch() as IATBatch;
    if (!otherBatch?.entries) {
      return new Error('IAT cannot consume incompatible batch type');
    }
    if (otherBatch.header.batchNumber < this.iatBatch.header.batchNumber) {
      this.iatBatch.header.batchNumber = otherBatch.header.batchNumber;
    }
    for (const entry of otherBatch.entries) {
      this.iatBatch.addEntry(entry);
    }
    return null;
  }

  copy(): Mergeable {
    const newIATBatch = new IATBatch(this.iatBatch.header);
    const newMergeable = new MergeableIATBatch(newIATBatch);
    newMergeable.consume(this);
    return newMergeable;
  }

  addToFile(file: File): Error | null {
    // Sort entries by trace number
    this.iatBatch.entries.sort((a, b) =>
      a.traceNumber < b.traceNumber ? -1 : a.traceNumber > b.traceNumber ? 1 : 0,
    );

    const opts = file.getValidation();
    if (opts) {
      this.iatBatch.setValidation(opts);
      for (const entry of this.iatBatch.entries) {
        entry.setValidation(opts);
      }
    }

    const err = this.iatBatch.create();
    if (err) return new Error(`mergeableIATBatch - AddToFile: ${err.message}`);

    this.iatBatch.header.batchNumber = 0;
    file.addIATBatch(this.iatBatch);
    return null;
  }
}

function canMerge(a: Mergeable, b: Mergeable): boolean {
  const traceNumbers = b.getTraceNumbers();
  for (const [tn] of a.getTraceNumbers()) {
    if (traceNumbers.has(tn)) return false;
  }
  return a.getHeaderSignature() === b.getHeaderSignature();
}

function flatten(originalFile: File): [File | null, Error | null] {
  const originalBatches: Mergeable[] = [];

  for (const batch of originalFile.batches) {
    originalBatches.push(new MergeableBatcher(batch));
  }
  for (const iatBatch of originalFile.iatBatches) {
    originalBatches.push(new MergeableIATBatch(iatBatch));
  }

  // Sort smallest first
  originalBatches.sort((a, b) => a.getEntryCount() - b.getEntryCount());

  // Merge batches with matching headers
  const newBatchesByHeader = new Map<string, Mergeable[]>();
  for (const batch of originalBatches) {
    let batchToMergeWith: Mergeable | null = null;
    const matchingBatches = newBatchesByHeader.get(batch.getHeaderSignature());
    if (matchingBatches) {
      for (const candidate of matchingBatches) {
        if (canMerge(batch, candidate)) {
          batchToMergeWith = candidate;
          break;
        }
      }
    }

    if (!batchToMergeWith) {
      const existing = newBatchesByHeader.get(batch.getHeaderSignature()) || [];
      existing.push(batch.copy());
      newBatchesByHeader.set(batch.getHeaderSignature(), existing);
    } else {
      batchToMergeWith.consume(batch);
    }
  }

  // Create new file
  const newFileObj = newFile();
  newFileObj.setValidation(originalFile.getValidation());
  originalFile.addFileHeaderData(newFileObj);

  // Collect and sort all merged batches
  const allBatches: Mergeable[] = [];
  for (const batches of newBatchesByHeader.values()) {
    allBatches.push(...batches);
  }
  allBatches.sort((a, b) => a.getBatchNumber() - b.getBatchNumber());

  for (const batch of allBatches) {
    const err = batch.addToFile(newFileObj);
    if (err) return [null, err];
  }

  let err = newFileObj.create();
  if (err) return [null, err];
  err = newFileObj.validate();
  if (err) return [null, err];

  // Sanity checks
  if (originalFile.control.entryAddendaCount !== newFileObj.control.entryAddendaCount) {
    return [null, ErrFlattenChangedEntryCount];
  }
  if (originalFile.control.totalDebitEntryDollarAmountInFile !== newFileObj.control.totalDebitEntryDollarAmountInFile) {
    return [null, ErrFlattenChangedDebitAmount];
  }
  if (originalFile.control.totalCreditEntryDollarAmountInFile !== newFileObj.control.totalCreditEntryDollarAmountInFile) {
    return [null, ErrFlattenChangedCreditAmount];
  }

  return [newFileObj, null];
}

// --- Utilities ---

let idCounter = 0;
function generateID(): string {
  idCounter++;
  return `id-${Date.now()}-${idCounter}`;
}
