import { batchControlPos, AutomatedAccountingAdvices } from './constants.js';
import { enrichErrors, enrichError, advBatchControlFieldPositions } from './fieldPositions.js';
import type { ValidateOpts } from './validateOpts.js';
import { Converters, converters } from './utils/converters.js';
import { Validators, validators } from './utils/validators.js';
import { fieldError, ErrConstructor } from './errors/index.js';

/**
 * ADVBatchControl contains entry counts, dollar totals and hash totals
 * for all entries contained in the preceding ADV batch.
 */
export class ADVBatchControl {
  id = '';
  serviceClassCode: number = AutomatedAccountingAdvices;
  entryAddendaCount = 0;
  entryHash = 0;
  totalDebitEntryDollarAmount = 0;
  totalCreditEntryDollarAmount = 0;
  achOperatorData = '';
  odfiIdentification = '';
  batchNumber = 1;
  lineNumber = 0;
  validateOpts?: ValidateOpts;

  parse(record: string): void {
    const runes = [...record];
    if (runes.length !== 94) return;

    // 1-1 Always "8"
    // 2-4 ServiceClassCode
    this.serviceClassCode = converters.parseNumField(runes.slice(1, 4).join(''));
    // 5-10 EntryAddendaCount
    this.entryAddendaCount = converters.parseNumField(runes.slice(4, 10).join(''));
    // 11-20 EntryHash
    this.entryHash = converters.parseNumField(runes.slice(10, 20).join(''));
    // 21-40 TotalDebitEntryDollarAmount
    this.totalDebitEntryDollarAmount = converters.parseNumField(runes.slice(20, 40).join(''));
    // 41-60 TotalCreditEntryDollarAmount
    this.totalCreditEntryDollarAmount = converters.parseNumField(runes.slice(40, 60).join(''));
    // 61-79 ACHOperatorData
    this.achOperatorData = runes.slice(60, 79).join('').trim();
    // 80-87 ODFIIdentification
    this.odfiIdentification = converters.parseStringField(runes.slice(79, 87).join(''));
    // 88-94 BatchNumber
    this.batchNumber = converters.parseNumField(runes.slice(87, 94).join(''));
  }

  setValidation(opts: ValidateOpts | undefined): void {
    this.validateOpts = opts;
  }

  string(): string {
    return (
      batchControlPos +
      String(this.serviceClassCode) +
      this.entryAddendaCountField() +
      this.entryHashField() +
      this.totalDebitEntryDollarAmountField() +
      this.totalCreditEntryDollarAmountField() +
      this.achOperatorDataField() +
      this.odfiIdentificationField() +
      this.batchNumberField()
    );
  }

  validate(): Error | null {
    const err = this._validate();
    if (err) enrichError(err, this.lineNumber, advBatchControlFieldPositions);
    return err;
  }

  private _validate(): Error | null {
    const inclErr = this.fieldInclusion();
    if (inclErr) return inclErr;

    if (validators.isServiceClass(this.serviceClassCode)) {
      return fieldError('ServiceClassCode', new Error('invalid service class code'), String(this.serviceClassCode));
    }

    if (!this.validateOpts?.allowSpecialCharacters) {
      const err = validators.isAlphanumeric(this.achOperatorData);
      if (err) return fieldError('ACHOperatorData', err, this.achOperatorData);
    }

    return null;
  }

  /** ValidateAll performs all NACHA format rule checks and returns all errors found */
  validateAll(): Error[] {
    const errors: Error[] = [];
    const push = (err: Error | null | undefined) => { if (err) errors.push(err); };

    if (this.serviceClassCode === 0) push(fieldError('ServiceClassCode', ErrConstructor, String(this.serviceClassCode)));
    if (this.odfiIdentification === '000000000' || this.odfiIdentification === '') {
      push(fieldError('ODFIIdentification', ErrConstructor, this.odfiIdentificationField()));
    }

    if (validators.isServiceClass(this.serviceClassCode)) {
      push(fieldError('ServiceClassCode', new Error('invalid service class code'), String(this.serviceClassCode)));
    }
    if (!this.validateOpts?.allowSpecialCharacters) {
      push(fieldError('ACHOperatorData', validators.isAlphanumeric(this.achOperatorData), this.achOperatorData));
    }

    return enrichErrors(errors, this.lineNumber, advBatchControlFieldPositions);
  }

  private fieldInclusion(): Error | null {
    if (this.serviceClassCode === 0) {
      return fieldError('ServiceClassCode', ErrConstructor, String(this.serviceClassCode));
    }
    if (this.odfiIdentification === '000000000' || this.odfiIdentification === '') {
      return fieldError('ODFIIdentification', ErrConstructor, this.odfiIdentificationField());
    }
    return null;
  }

  entryAddendaCountField(): string { return converters.numericField(this.entryAddendaCount, 6); }
  entryHashField(): string { return converters.numericField(this.entryHash, 10); }
  totalDebitEntryDollarAmountField(): string { return converters.numericField(this.totalDebitEntryDollarAmount, 20); }
  totalCreditEntryDollarAmountField(): string { return converters.numericField(this.totalCreditEntryDollarAmount, 20); }
  achOperatorDataField(): string { return converters.alphaField(this.achOperatorData, 19); }
  odfiIdentificationField(): string { return converters.stringField(this.odfiIdentification, 8); }
  batchNumberField(): string { return converters.numericField(this.batchNumber, 7); }
}

export function newADVBatchControl(): ADVBatchControl {
  const bc = new ADVBatchControl();
  bc.entryHash = 1;
  return bc;
}
