import { fileControlPos } from './constants.js';
import { enrichErrors, fileControlFieldPositions } from './fieldPositions.js';
import { Converters } from './utils/converters.js';
import { fieldError, ErrConstructor } from './errors/index.js';

/**
 * FileControl record contains entry counts, dollar totals and hash
 * totals accumulated from each batch control record in the file.
 */
export class FileControl {
  id = '';
  /** Total number of batches in the file */
  batchCount = 0;
  /** Total number of records in the file divided by 10 */
  blockCount = 0;
  /** Tally of each Entry Detail and Addenda Record processed */
  entryAddendaCount = 0;
  /** Sum of all RDFI routing numbers in the file (truncated to 10 digits) */
  entryHash = 0;
  /** Accumulated Batch debit totals within the file */
  totalDebitEntryDollarAmountInFile = 0;
  /** Accumulated Batch credit totals within the file */
  totalCreditEntryDollarAmountInFile = 0;
  /** Reserved field (positions 56-94) */
  reserved = '';
  /** Line number at which the record appears */
  lineNumber = 0;

  private converters = new Converters();

  static readonly NachaFileDebitCreditLimit = 9_999_999_999_99;

  /** Parse takes the input record string and parses the FileControl values */
  parse(record: string): void {
    const runes = [...record];
    if (runes.length !== 94) return;

    // 1-1 Always "9"
    // 2-7 BatchCount
    this.batchCount = this.converters.parseNumField(runes.slice(1, 7).join(''));
    // 8-13 BlockCount
    this.blockCount = this.converters.parseNumField(runes.slice(7, 13).join(''));
    // 14-21 EntryAddendaCount
    this.entryAddendaCount = this.converters.parseNumField(runes.slice(13, 21).join(''));
    // 22-31 EntryHash
    this.entryHash = this.converters.parseNumField(runes.slice(21, 31).join(''));
    // 32-43 TotalDebitEntryDollarAmountInFile
    this.totalDebitEntryDollarAmountInFile = this.converters.parseNumField(runes.slice(31, 43).join(''));
    // 44-55 TotalCreditEntryDollarAmountInFile
    this.totalCreditEntryDollarAmountInFile = this.converters.parseNumField(runes.slice(43, 55).join(''));
    // 56-94 Reserved
    this.reserved = runes.slice(55, 94).join('');
  }

  /** String writes the FileControl struct to a 94 character string */
  string(): string {
    return (
      fileControlPos +
      this.batchCountField() +
      this.blockCountField() +
      this.entryAddendaCountField() +
      this.entryHashField() +
      this.totalDebitEntryDollarAmountInFileField() +
      this.totalCreditEntryDollarAmountInFileField() +
      '                                       ' // 39 spaces for reserved
    );
  }

  /** Validate performs NACHA format rule checks */
  validate(): Error | null {
    const inclErr = this.fieldInclusion();
    if (inclErr) return inclErr;

    if (this.totalDebitEntryDollarAmountInFile > FileControl.NachaFileDebitCreditLimit) {
      return fieldError(
        'TotalDebitEntryDollarAmount',
        new Error(`does not match formatted value ${this.totalDebitEntryDollarAmountInFileField()}`),
        this.totalDebitEntryDollarAmountInFile,
      );
    }
    if (this.totalCreditEntryDollarAmountInFile > FileControl.NachaFileDebitCreditLimit) {
      return fieldError(
        'TotalCreditEntryDollarAmount',
        new Error(`does not match formatted value ${this.totalCreditEntryDollarAmountInFileField()}`),
        this.totalCreditEntryDollarAmountInFile,
      );
    }

    return null;
  }

  /** ValidateAll performs all NACHA format rule checks and returns all errors found */
  validateAll(): Error[] {
    const errors: Error[] = [];
    const push = (err: Error | null | undefined) => { if (err) errors.push(err); };

    // Field inclusion checks (inlined to collect all)
    if (this.blockCount === 0) push(fieldError('BlockCount', ErrConstructor, this.blockCountField()));
    if (this.totalCreditEntryDollarAmountInFile !== 0 || this.totalDebitEntryDollarAmountInFile !== 0) {
      if (this.batchCount === 0) push(fieldError('BatchCount', ErrConstructor, this.batchCountField()));
      if (this.entryAddendaCount === 0) push(fieldError('EntryAddendaCount', ErrConstructor, this.entryAddendaCountField()));
      if (this.entryHash === 0) push(fieldError('EntryHash', ErrConstructor, this.entryAddendaCountField()));
    }

    if (this.totalDebitEntryDollarAmountInFile > FileControl.NachaFileDebitCreditLimit) {
      push(fieldError(
        'TotalDebitEntryDollarAmount',
        new Error(`does not match formatted value ${this.totalDebitEntryDollarAmountInFileField()}`),
        this.totalDebitEntryDollarAmountInFile,
      ));
    }
    if (this.totalCreditEntryDollarAmountInFile > FileControl.NachaFileDebitCreditLimit) {
      push(fieldError(
        'TotalCreditEntryDollarAmount',
        new Error(`does not match formatted value ${this.totalCreditEntryDollarAmountInFileField()}`),
        this.totalCreditEntryDollarAmountInFile,
      ));
    }

    return enrichErrors(errors, this.lineNumber, fileControlFieldPositions);
  }

  private fieldInclusion(): Error | null {
    if (this.blockCount === 0) {
      return fieldError('BlockCount', ErrConstructor, this.blockCountField());
    }
    if (this.totalCreditEntryDollarAmountInFile !== 0 || this.totalDebitEntryDollarAmountInFile !== 0) {
      if (this.batchCount === 0) {
        return fieldError('BatchCount', ErrConstructor, this.batchCountField());
      }
      if (this.entryAddendaCount === 0) {
        return fieldError('EntryAddendaCount', ErrConstructor, this.entryAddendaCountField());
      }
      if (this.entryHash === 0) {
        return fieldError('EntryHash', ErrConstructor, this.entryAddendaCountField());
      }
    }
    return null;
  }

  batchCountField(): string { return this.converters.numericField(this.batchCount, 6); }
  blockCountField(): string { return this.converters.numericField(this.blockCount, 6); }
  entryAddendaCountField(): string { return this.converters.numericField(this.entryAddendaCount, 8); }
  entryHashField(): string { return this.converters.numericField(this.entryHash, 10); }
  totalDebitEntryDollarAmountInFileField(): string { return this.converters.numericField(this.totalDebitEntryDollarAmountInFile, 12); }
  totalCreditEntryDollarAmountInFileField(): string { return this.converters.numericField(this.totalCreditEntryDollarAmountInFile, 12); }
}

export function newFileControl(): FileControl {
  return new FileControl();
}
