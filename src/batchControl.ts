import { batchControlPos } from './constants.js';
import { enrichErrors, enrichError, batchControlFieldPositions } from './fieldPositions.js';
import type { ValidateOpts } from './validateOpts.js';
import { isSkipped, applyErrorLevel, applyErrorLevels } from './validateOpts.js';
import { Converters, converters } from './utils/converters.js';
import { Validators, validators } from './utils/validators.js';
import { fieldError, ErrConstructor, ErrServiceClass } from './errors/index.js';

/**
 * BatchControl contains entry counts, dollar totals and hash
 * totals accumulated from each entry detail record in the batch.
 */
export class BatchControl {
  id = '';
  /** ServiceClassCode same as BatchHeader */
  serviceClassCode = 0;
  /** EntryAddendaCount tally of each Entry Detail and Addenda */
  entryAddendaCount = 0;
  /** EntryHash sum of RDFIs receiving entries routing numbers (truncated to 10 digits) */
  entryHash = 0;
  /** TotalDebitEntryDollarAmount dollar totals of debit entries in the batch */
  totalDebitEntryDollarAmount = 0;
  /** TotalCreditEntryDollarAmount dollar totals of credit entries in the batch */
  totalCreditEntryDollarAmount = 0;
  /** CompanyIdentification alphanumeric code used to identify an Originator */
  companyIdentification = '';
  /** MessageAuthenticationCode the MAC is an eight character code derived from a special key */
  messageAuthenticationCode = '';
  /** Reserved for future use */
  reserved = '';
  /** ODFIIdentification the routing number is used to identify the DFI */
  odfiIdentification = '';
  /** BatchNumber assigned in ascending order to each batch */
  batchNumber = 0;
  /** Line number at which the record appears */
  lineNumber = 0;
  validateOpts?: ValidateOpts;

  static readonly NachaBatchDebitCreditLimit = 999_999_999_999;

  /** Parse takes the input record string and parses the BatchControl values */
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
    // 21-32 TotalDebitEntryDollarAmount
    this.totalDebitEntryDollarAmount = converters.parseNumField(runes.slice(20, 32).join(''));
    // 33-44 TotalCreditEntryDollarAmount
    this.totalCreditEntryDollarAmount = converters.parseNumField(runes.slice(32, 44).join(''));
    // 45-54 CompanyIdentification
    this.companyIdentification = converters.parseStringFieldWithOpts(runes.slice(44, 54).join(''), this.validateOpts);
    // 55-73 MessageAuthenticationCode
    this.messageAuthenticationCode = converters.parseStringField(runes.slice(54, 73).join(''));
    // 74-79 Reserved
    this.reserved = runes.slice(73, 79).join('');
    // 80-87 ODFIIdentification
    this.odfiIdentification = converters.parseStringField(runes.slice(79, 87).join(''));
    // 88-94 BatchNumber
    this.batchNumber = converters.parseNumField(runes.slice(87, 94).join(''));
  }

  /** String writes the BatchControl struct to a 94 character string */
  string(): string {
    return (
      batchControlPos +
      this.serviceClassCodeField() +
      this.entryAddendaCountField() +
      this.entryHashField() +
      this.totalDebitEntryDollarAmountField() +
      this.totalCreditEntryDollarAmountField() +
      this.companyIdentificationField() +
      this.messageAuthenticationCodeField() +
      '      ' + // 6 spaces reserved
      this.odfiIdentificationField() +
      this.batchNumberField()
    );
  }

  setValidation(opts: ValidateOpts | undefined): void {
    this.validateOpts = opts;
  }

  /** Validate performs NACHA format rule checks */
  validate(): Error | null {
    let err = this._validate();
    if (err) enrichError(err, this.lineNumber, batchControlFieldPositions);
    err = applyErrorLevel(err, this.validateOpts);
    return err;
  }

  private _validate(): Error | null {
    const inclErr = this.fieldInclusion();
    if (inclErr) return inclErr;

    if (validators.isServiceClass(this.serviceClassCode)) {
      return fieldError('ServiceClassCode', ErrServiceClass, this.serviceClassCode);
    }
    if (!isSkipped(this.validateOpts, 'allowSpecialCharacters')) {
      const err = validators.isAlphanumeric(this.companyIdentification);
      if (err) return fieldError('CompanyIdentification', err, this.companyIdentification);
    }
    if (this.totalDebitEntryDollarAmount > BatchControl.NachaBatchDebitCreditLimit) {
      return fieldError(
        'TotalDebitEntryDollarAmount',
        new Error(`does not match formatted value ${this.totalDebitEntryDollarAmountField()}`),
        this.totalDebitEntryDollarAmount,
      );
    }
    if (this.totalCreditEntryDollarAmount > BatchControl.NachaBatchDebitCreditLimit) {
      return fieldError(
        'TotalCreditEntryDollarAmount',
        new Error(`does not match formatted value ${this.totalCreditEntryDollarAmountField()}`),
        this.totalCreditEntryDollarAmount,
      );
    }
    return null;
  }

  /** ValidateAll performs all NACHA format rule checks and returns all errors found */
  validateAll(): Error[] {
    const errors: Error[] = [];
    const push = (err: Error | null | undefined) => { if (err) errors.push(err); };

    // Field inclusion checks (inlined to collect all)
    if (this.serviceClassCode === 0) push(fieldError('ServiceClassCode', ErrConstructor, this.serviceClassCodeField()));
    if (this.odfiIdentification === '') push(fieldError('ODFIIdentification', ErrConstructor, this.odfiIdentificationField()));

    if (validators.isServiceClass(this.serviceClassCode)) {
      push(fieldError('ServiceClassCode', ErrServiceClass, this.serviceClassCode));
    }
    if (!isSkipped(this.validateOpts, 'allowSpecialCharacters')) {
      push(fieldError('CompanyIdentification', validators.isAlphanumeric(this.companyIdentification), this.companyIdentification));
    }
    if (this.totalDebitEntryDollarAmount > BatchControl.NachaBatchDebitCreditLimit) {
      push(fieldError(
        'TotalDebitEntryDollarAmount',
        new Error(`does not match formatted value ${this.totalDebitEntryDollarAmountField()}`),
        this.totalDebitEntryDollarAmount,
      ));
    }
    if (this.totalCreditEntryDollarAmount > BatchControl.NachaBatchDebitCreditLimit) {
      push(fieldError(
        'TotalCreditEntryDollarAmount',
        new Error(`does not match formatted value ${this.totalCreditEntryDollarAmountField()}`),
        this.totalCreditEntryDollarAmount,
      ));
    }

    return applyErrorLevels(
      enrichErrors(errors, this.lineNumber, batchControlFieldPositions),
      this.validateOpts,
    );
  }

  private fieldInclusion(): Error | null {
    if (this.serviceClassCode === 0) {
      return fieldError('ServiceClassCode', ErrConstructor, this.serviceClassCodeField());
    }
    if (this.odfiIdentification === '') {
      return fieldError('ODFIIdentification', ErrConstructor, this.odfiIdentificationField());
    }
    return null;
  }

  // Field formatters
  serviceClassCodeField(): string { return converters.numericField(this.serviceClassCode, 3); }
  entryAddendaCountField(): string { return converters.numericField(this.entryAddendaCount, 6); }
  entryHashField(): string { return converters.numericField(this.entryHash, 10); }
  totalDebitEntryDollarAmountField(): string { return converters.numericField(this.totalDebitEntryDollarAmount, 12); }
  totalCreditEntryDollarAmountField(): string { return converters.numericField(this.totalCreditEntryDollarAmount, 12); }
  companyIdentificationField(): string { return converters.alphaField(this.companyIdentification, 10); }
  messageAuthenticationCodeField(): string { return converters.alphaField(this.messageAuthenticationCode, 19); }
  odfiIdentificationField(): string { return converters.stringField(this.odfiIdentification, 8); }
  batchNumberField(): string { return converters.numericField(this.batchNumber, 7); }
}

export function newBatchControl(): BatchControl {
  return new BatchControl();
}
