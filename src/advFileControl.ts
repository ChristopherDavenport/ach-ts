import { fileControlPos } from './constants.js';
import { Converters } from './utils/converters.js';
import { fieldError, ErrConstructor } from './errors/index.js';

/**
 * ADVFileControl record contains entry counts, dollar totals and hash
 * totals accumulated from each ADV batch control record in the file.
 */
export class ADVFileControl {
  id = '';
  batchCount = 0;
  blockCount = 0;
  entryAddendaCount = 0;
  entryHash = 0;
  totalDebitEntryDollarAmountInFile = 0;
  totalCreditEntryDollarAmountInFile = 0;
  lineNumber = 0;

  private converters = new Converters();

  parse(record: string): void {
    const runes = [...record];
    if (runes.length < 71) return;

    // 1-1 Always "9"
    // 2-7 BatchCount
    this.batchCount = this.converters.parseNumField(runes.slice(1, 7).join(''));
    // 8-13 BlockCount
    this.blockCount = this.converters.parseNumField(runes.slice(7, 13).join(''));
    // 14-21 EntryAddendaCount
    this.entryAddendaCount = this.converters.parseNumField(runes.slice(13, 21).join(''));
    // 22-31 EntryHash
    this.entryHash = this.converters.parseNumField(runes.slice(21, 31).join(''));
    // 32-51 TotalDebitEntryDollarAmountInFile
    this.totalDebitEntryDollarAmountInFile = this.converters.parseNumField(runes.slice(31, 51).join(''));
    // 52-71 TotalCreditEntryDollarAmountInFile
    this.totalCreditEntryDollarAmountInFile = this.converters.parseNumField(runes.slice(51, 71).join(''));
    // 72-94 Reserved (blank)
  }

  string(): string {
    return (
      fileControlPos +
      this.batchCountField() +
      this.blockCountField() +
      this.entryAddendaCountField() +
      this.entryHashField() +
      this.totalDebitEntryDollarAmountInFileField() +
      this.totalCreditEntryDollarAmountInFileField() +
      '                       ' // 23 spaces reserved
    );
  }

  validate(): Error | null {
    return this.fieldInclusion();
  }

  private fieldInclusion(): Error | null {
    if (this.batchCount === 0) return fieldError('BatchCount', ErrConstructor, this.batchCountField());
    if (this.blockCount === 0) return fieldError('BlockCount', ErrConstructor, this.blockCountField());
    if (this.entryAddendaCount === 0) return fieldError('EntryAddendaCount', ErrConstructor, this.entryAddendaCountField());
    if (this.entryHash === 0) return fieldError('EntryHash', ErrConstructor, this.entryHashField());
    return null;
  }

  batchCountField(): string { return this.converters.numericField(this.batchCount, 6); }
  blockCountField(): string { return this.converters.numericField(this.blockCount, 6); }
  entryAddendaCountField(): string { return this.converters.numericField(this.entryAddendaCount, 8); }
  entryHashField(): string { return this.converters.numericField(this.entryHash, 10); }
  totalDebitEntryDollarAmountInFileField(): string { return this.converters.numericField(this.totalDebitEntryDollarAmountInFile, 20); }
  totalCreditEntryDollarAmountInFileField(): string { return this.converters.numericField(this.totalCreditEntryDollarAmountInFile, 20); }
}

export function newADVFileControl(): ADVFileControl {
  return new ADVFileControl();
}
