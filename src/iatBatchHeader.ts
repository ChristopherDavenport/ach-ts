import { batchHeaderPos } from './constants.js';
import { enrichErrors, enrichError, iatBatchHeaderFieldPositions } from './fieldPositions.js';
import type { ValidateOpts } from './validateOpts.js';
import { isSkipped, applyErrorLevel, applyErrorLevels } from './validateOpts.js';
import { Converters, converters } from './utils/converters.js';
import { Validators, validators } from './utils/validators.js';
import {
  fieldError,
  ErrFieldInclusion,
  ErrFieldRequired,
  ErrValidISO3166,
  ErrValidISO4217,
  ErrForeignExchangeIndicator,
  ErrForeignExchangeReferenceIndicator,
} from './errors/index.js';

const IATCOR = 'IATCOR';

// Simple ISO 3166-1 alpha-2 validation (common country codes)
// In production you'd use a complete list; here we accept any 2-letter uppercase string
function isValidISO3166(code: string): boolean {
  return /^[A-Z]{2}$/.test(code);
}

// Simple ISO 4217 currency code validation
function isValidISO4217(code: string): boolean {
  return /^[A-Z]{3}$/.test(code);
}

/**
 * IATBatchHeader identifies the originating entity and the type of transactions
 * contained in the batch for SEC Code IAT.
 */
export class IATBatchHeader {
  id = '';
  serviceClassCode = 0;
  iatIndicator = '';
  foreignExchangeIndicator = '';
  foreignExchangeReferenceIndicator = 0;
  foreignExchangeReference = '';
  isoDestinationCountryCode = '';
  originatorIdentification = '';
  standardEntryClassCode = '';
  companyEntryDescription = '';
  isoOriginatingCurrencyCode = '';
  isoDestinationCurrencyCode = '';
  effectiveEntryDate = '';
  settlementDate = '';
  originatorStatusCode = 0;
  odfiIdentification = '';
  batchNumber = 1;
  lineNumber = 0;
  validateOpts?: ValidateOpts;

  static newIATBatchHeader(): IATBatchHeader {
    const bh = new IATBatchHeader();
    bh.originatorStatusCode = 0;
    bh.batchNumber = 1;
    return bh;
  }

  parse(record: string): void {
    if (record.length !== 94) return;
    // 1-1 Record Type "5"
    // 2-4 ServiceClassCode
    this.serviceClassCode = converters.parseNumField(record.substring(1, 4));
    // 5-20 IATIndicator
    this.iatIndicator = converters.parseStringField(record.substring(4, 20));
    // 21-22 ForeignExchangeIndicator
    this.foreignExchangeIndicator = converters.parseStringField(record.substring(20, 22));
    // 23-23 ForeignExchangeReferenceIndicator
    this.foreignExchangeReferenceIndicator = converters.parseNumField(record.substring(22, 23));
    // 24-38 ForeignExchangeReference
    this.foreignExchangeReference = converters.parseStringField(record.substring(23, 38));
    // 39-40 ISODestinationCountryCode
    this.isoDestinationCountryCode = converters.parseStringField(record.substring(38, 40));
    // 41-50 OriginatorIdentification
    this.originatorIdentification = converters.parseStringField(record.substring(40, 50));
    // 51-53 StandardEntryClassCode
    this.standardEntryClassCode = record.substring(50, 53);
    // 54-63 CompanyEntryDescription
    this.companyEntryDescription = record.substring(53, 63).trim();
    // 64-66 ISOOriginatingCurrencyCode
    this.isoOriginatingCurrencyCode = converters.parseStringField(record.substring(63, 66));
    // 67-69 ISODestinationCurrencyCode
    this.isoDestinationCurrencyCode = converters.parseStringField(record.substring(66, 69));
    // 70-75 EffectiveEntryDate
    this.effectiveEntryDate = validators.validateSimpleDate(record.substring(69, 75));
    // 76-78 SettlementDate
    this.settlementDate = validators.validateSettlementDate(record.substring(75, 78));
    // 79-79 OriginatorStatusCode
    this.originatorStatusCode = converters.parseNumField(record.substring(78, 79));
    // 80-87 ODFIIdentification
    this.odfiIdentification = converters.parseStringField(record.substring(79, 87));
    // 88-94 BatchNumber
    this.batchNumber = converters.parseNumField(record.substring(87, 94));
  }

  string(): string {
    let out = batchHeaderPos;
    out += String(this.serviceClassCode);
    out += this.iatIndicatorField();
    out += this.foreignExchangeIndicatorField();
    out += this.foreignExchangeReferenceIndicatorField();
    out += this.foreignExchangeReferenceField();
    out += this.isoDestinationCountryCodeField();
    out += this.originatorIdentificationField();
    out += this.standardEntryClassCode;
    out += this.companyEntryDescriptionField();
    out += this.isoOriginatingCurrencyCodeField();
    out += this.isoDestinationCurrencyCodeField();
    out += this.effectiveEntryDateField();
    out += this.settlementDateField();
    out += String(this.originatorStatusCode);
    out += this.odfiIdentificationField();
    out += this.batchNumberField();
    return out;
  }

  setValidation(opts: ValidateOpts): void {
    this.validateOpts = opts;
  }

  validate(): Error | null {
    let err = this._validate();
    if (err) enrichError(err, this.lineNumber, iatBatchHeaderFieldPositions);
    err = applyErrorLevel(err, this.validateOpts);
    return err;
  }

  private _validate(): Error | null {
    const fiErr = this.fieldInclusion();
    if (fiErr) return fiErr;

    if (validators.isServiceClass(this.serviceClassCode)) {
      return fieldError('ServiceClassCode', validators.isServiceClass(this.serviceClassCode)!, String(this.serviceClassCode));
    }
    if (this.isForeignExchangeIndicator()) {
      return fieldError('ForeignExchangeIndicator', this.isForeignExchangeIndicator()!, this.foreignExchangeIndicator);
    }
    if (this.isForeignExchangeReferenceIndicator()) {
      return fieldError('ForeignExchangeReferenceIndicator', this.isForeignExchangeReferenceIndicator()!, String(this.foreignExchangeReferenceIndicator));
    }
    if (!isValidISO3166(this.isoDestinationCountryCode)) {
      return fieldError('ISODestinationCountryCode', ErrValidISO3166, this.isoDestinationCountryCode);
    }
    if (validators.isSECCode(this.standardEntryClassCode)) {
      return fieldError('StandardEntryClassCode', validators.isSECCode(this.standardEntryClassCode)!, this.standardEntryClassCode);
    }
    if (!isSkipped(this.validateOpts, 'allowSpecialCharacters')) {
      if (validators.isAlphanumeric(this.companyEntryDescription)) {
        return fieldError('CompanyEntryDescription', validators.isAlphanumeric(this.companyEntryDescription)!, this.companyEntryDescription);
      }
    }
    if (!isValidISO4217(this.isoOriginatingCurrencyCode)) {
      return fieldError('ISOOriginatingCurrencyCode', ErrValidISO4217, this.isoOriginatingCurrencyCode);
    }
    if (!isValidISO4217(this.isoDestinationCurrencyCode)) {
      return fieldError('ISODestinationCurrencyCode', ErrValidISO4217, this.isoDestinationCurrencyCode);
    }
    if (validators.isOriginatorStatusCode(this.originatorStatusCode)) {
      return fieldError('OriginatorStatusCode', validators.isOriginatorStatusCode(this.originatorStatusCode)!, String(this.originatorStatusCode));
    }
    return null;
  }

  /** ValidateAll performs all NACHA format rule checks and returns all errors found */
  validateAll(): Error[] {
    const errors: Error[] = [];
    const push = (err: Error | null | undefined) => { if (err) errors.push(err); };

    // Field inclusion checks (inlined to collect all)
    if (this.serviceClassCode === 0) push(fieldError('ServiceClassCode', ErrFieldInclusion, String(this.serviceClassCode)));
    if (this.foreignExchangeIndicator === '') push(fieldError('ForeignExchangeIndicator', ErrFieldInclusion, this.foreignExchangeIndicator));
    if (this.foreignExchangeReferenceIndicator === 0 && this.foreignExchangeIndicator !== 'FF') {
      push(fieldError('ForeignExchangeReferenceIndicator', ErrFieldRequired, String(this.foreignExchangeReferenceIndicator)));
    }
    if (this.isoDestinationCountryCode === '') push(fieldError('ISODestinationCountryCode', ErrFieldInclusion, this.isoDestinationCountryCode));
    if (this.originatorIdentification === '') push(fieldError('OriginatorIdentification', ErrFieldInclusion, this.originatorIdentification));
    if (this.standardEntryClassCode === '') push(fieldError('StandardEntryClassCode', ErrFieldInclusion, this.standardEntryClassCode));
    if (this.companyEntryDescription === '') push(fieldError('CompanyEntryDescription', ErrFieldInclusion, this.companyEntryDescription));
    if (this.isoOriginatingCurrencyCode === '') push(fieldError('ISOOriginatingCurrencyCode', ErrFieldInclusion, this.isoOriginatingCurrencyCode));
    if (this.isoDestinationCurrencyCode === '') push(fieldError('ISODestinationCurrencyCode', ErrFieldInclusion, this.isoDestinationCurrencyCode));
    if (this.odfiIdentification === '') push(fieldError('ODFIIdentification', ErrFieldInclusion, this.odfiIdentificationField()));

    push(fieldError('ServiceClassCode', validators.isServiceClass(this.serviceClassCode), String(this.serviceClassCode)));
    push(fieldError('ForeignExchangeIndicator', this.isForeignExchangeIndicator(), this.foreignExchangeIndicator));
    push(fieldError('ForeignExchangeReferenceIndicator', this.isForeignExchangeReferenceIndicator(), String(this.foreignExchangeReferenceIndicator)));
    if (!isValidISO3166(this.isoDestinationCountryCode)) push(fieldError('ISODestinationCountryCode', ErrValidISO3166, this.isoDestinationCountryCode));
    push(fieldError('StandardEntryClassCode', validators.isSECCode(this.standardEntryClassCode), this.standardEntryClassCode));
    if (!isSkipped(this.validateOpts, 'allowSpecialCharacters')) {
      push(fieldError('CompanyEntryDescription', validators.isAlphanumeric(this.companyEntryDescription), this.companyEntryDescription));
    }
    if (!isValidISO4217(this.isoOriginatingCurrencyCode)) push(fieldError('ISOOriginatingCurrencyCode', ErrValidISO4217, this.isoOriginatingCurrencyCode));
    if (!isValidISO4217(this.isoDestinationCurrencyCode)) push(fieldError('ISODestinationCurrencyCode', ErrValidISO4217, this.isoDestinationCurrencyCode));
    push(fieldError('OriginatorStatusCode', validators.isOriginatorStatusCode(this.originatorStatusCode), String(this.originatorStatusCode)));

    return applyErrorLevels(
      enrichErrors(errors, this.lineNumber, iatBatchHeaderFieldPositions),
      this.validateOpts,
    );
  }

  private isForeignExchangeIndicator(): Error | null {
    switch (this.foreignExchangeIndicator) {
      case 'FV': case 'VF': case 'FF':
        return null;
    }
    return ErrForeignExchangeIndicator;
  }

  private isForeignExchangeReferenceIndicator(): Error | null {
    switch (this.foreignExchangeReferenceIndicator) {
      case 1: case 2: case 3:
        return null;
      case 0:
        if (this.foreignExchangeIndicator === 'FF') return null;
        return ErrForeignExchangeReferenceIndicator;
    }
    return ErrForeignExchangeReferenceIndicator;
  }

  private fieldInclusion(): Error | null {
    if (this.serviceClassCode === 0) {
      return fieldError('ServiceClassCode', ErrFieldInclusion, String(this.serviceClassCode));
    }
    if (this.foreignExchangeIndicator === '') {
      return fieldError('ForeignExchangeIndicator', ErrFieldInclusion, this.foreignExchangeIndicator);
    }
    if (this.foreignExchangeReferenceIndicator === 0 && this.foreignExchangeIndicator !== 'FF') {
      return fieldError('ForeignExchangeReferenceIndicator', ErrFieldRequired, String(this.foreignExchangeReferenceIndicator));
    }
    if (this.isoDestinationCountryCode === '') {
      return fieldError('ISODestinationCountryCode', ErrFieldInclusion, this.isoDestinationCountryCode);
    }
    if (this.originatorIdentification === '') {
      return fieldError('OriginatorIdentification', ErrFieldInclusion, this.originatorIdentification);
    }
    if (this.standardEntryClassCode === '') {
      return fieldError('StandardEntryClassCode', ErrFieldInclusion, this.standardEntryClassCode);
    }
    if (this.companyEntryDescription === '') {
      return fieldError('CompanyEntryDescription', ErrFieldInclusion, this.companyEntryDescription);
    }
    if (this.isoOriginatingCurrencyCode === '') {
      return fieldError('ISOOriginatingCurrencyCode', ErrFieldInclusion, this.isoOriginatingCurrencyCode);
    }
    if (this.isoDestinationCurrencyCode === '') {
      return fieldError('ISODestinationCurrencyCode', ErrFieldInclusion, this.isoDestinationCurrencyCode);
    }
    if (this.odfiIdentification === '') {
      return fieldError('ODFIIdentification', ErrFieldInclusion, this.odfiIdentificationField());
    }
    return null;
  }

  // Field formatting methods
  iatIndicatorField(): string { return converters.alphaField(this.iatIndicator, 16); }
  foreignExchangeIndicatorField(): string { return converters.alphaField(this.foreignExchangeIndicator, 2); }
  foreignExchangeReferenceIndicatorField(): string { return converters.numericField(this.foreignExchangeReferenceIndicator, 1); }
  foreignExchangeReferenceField(): string {
    if (this.foreignExchangeReferenceIndicator === 3) return '               ';
    return converters.alphaField(this.foreignExchangeReference, 15);
  }
  isoDestinationCountryCodeField(): string { return converters.alphaField(this.isoDestinationCountryCode, 2); }
  originatorIdentificationField(): string { return converters.alphaField(this.originatorIdentification, 10); }
  companyEntryDescriptionField(): string { return converters.alphaField(this.companyEntryDescription, 10); }
  isoOriginatingCurrencyCodeField(): string { return converters.alphaField(this.isoOriginatingCurrencyCode, 3); }
  isoDestinationCurrencyCodeField(): string { return converters.alphaField(this.isoDestinationCurrencyCode, 3); }
  effectiveEntryDateField(): string { return converters.stringField(this.effectiveEntryDate, 6); }
  odfiIdentificationField(): string { return converters.stringField(this.odfiIdentification, 8); }
  batchNumberField(): string { return converters.numericField(this.batchNumber, 7); }
  settlementDateField(): string { return converters.alphaField(this.settlementDate, 3); }

  equal(other: IATBatchHeader | null): boolean {
    if (!other) return false;
    return this.serviceClassCode === other.serviceClassCode
      && this.foreignExchangeIndicator === other.foreignExchangeIndicator
      && this.foreignExchangeReferenceIndicator === other.foreignExchangeReferenceIndicator
      && this.isoDestinationCountryCode === other.isoDestinationCountryCode
      && this.originatorIdentification === other.originatorIdentification
      && this.standardEntryClassCode === other.standardEntryClassCode
      && this.isoOriginatingCurrencyCode === other.isoOriginatingCurrencyCode
      && this.isoDestinationCurrencyCode === other.isoDestinationCurrencyCode
      && this.odfiIdentification === other.odfiIdentification;
  }
}

export { IATCOR };
