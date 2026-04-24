import { batchHeaderPos } from './constants.js';
import type { ValidateOpts } from './validateOpts.js';
import { Converters } from './utils/converters.js';
import { Validators } from './utils/validators.js';
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

  protected converters = new Converters();
  protected validators = new Validators();
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
    this.serviceClassCode = this.converters.parseNumField(record.substring(1, 4));
    // 5-20 IATIndicator
    this.iatIndicator = this.converters.parseStringField(record.substring(4, 20));
    // 21-22 ForeignExchangeIndicator
    this.foreignExchangeIndicator = this.converters.parseStringField(record.substring(20, 22));
    // 23-23 ForeignExchangeReferenceIndicator
    this.foreignExchangeReferenceIndicator = this.converters.parseNumField(record.substring(22, 23));
    // 24-38 ForeignExchangeReference
    this.foreignExchangeReference = this.converters.parseStringField(record.substring(23, 38));
    // 39-40 ISODestinationCountryCode
    this.isoDestinationCountryCode = this.converters.parseStringField(record.substring(38, 40));
    // 41-50 OriginatorIdentification
    this.originatorIdentification = this.converters.parseStringField(record.substring(40, 50));
    // 51-53 StandardEntryClassCode
    this.standardEntryClassCode = record.substring(50, 53);
    // 54-63 CompanyEntryDescription
    this.companyEntryDescription = record.substring(53, 63).trim();
    // 64-66 ISOOriginatingCurrencyCode
    this.isoOriginatingCurrencyCode = this.converters.parseStringField(record.substring(63, 66));
    // 67-69 ISODestinationCurrencyCode
    this.isoDestinationCurrencyCode = this.converters.parseStringField(record.substring(66, 69));
    // 70-75 EffectiveEntryDate
    this.effectiveEntryDate = this.validators.validateSimpleDate(record.substring(69, 75));
    // 76-78 SettlementDate
    this.settlementDate = this.validators.validateSettlementDate(record.substring(75, 78));
    // 79-79 OriginatorStatusCode
    this.originatorStatusCode = this.converters.parseNumField(record.substring(78, 79));
    // 80-87 ODFIIdentification
    this.odfiIdentification = this.converters.parseStringField(record.substring(79, 87));
    // 88-94 BatchNumber
    this.batchNumber = this.converters.parseNumField(record.substring(87, 94));
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
    const fiErr = this.fieldInclusion();
    if (fiErr) return fiErr;

    if (this.validators.isServiceClass(this.serviceClassCode)) {
      return fieldError('ServiceClassCode', this.validators.isServiceClass(this.serviceClassCode)!, String(this.serviceClassCode));
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
    if (this.validators.isSECCode(this.standardEntryClassCode)) {
      return fieldError('StandardEntryClassCode', this.validators.isSECCode(this.standardEntryClassCode)!, this.standardEntryClassCode);
    }
    if (!this.validateOpts?.allowSpecialCharacters) {
      if (this.validators.isAlphanumeric(this.companyEntryDescription)) {
        return fieldError('CompanyEntryDescription', this.validators.isAlphanumeric(this.companyEntryDescription)!, this.companyEntryDescription);
      }
    }
    if (!isValidISO4217(this.isoOriginatingCurrencyCode)) {
      return fieldError('ISOOriginatingCurrencyCode', ErrValidISO4217, this.isoOriginatingCurrencyCode);
    }
    if (!isValidISO4217(this.isoDestinationCurrencyCode)) {
      return fieldError('ISODestinationCurrencyCode', ErrValidISO4217, this.isoDestinationCurrencyCode);
    }
    if (this.validators.isOriginatorStatusCode(this.originatorStatusCode)) {
      return fieldError('OriginatorStatusCode', this.validators.isOriginatorStatusCode(this.originatorStatusCode)!, String(this.originatorStatusCode));
    }
    return null;
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
  iatIndicatorField(): string { return this.converters.alphaField(this.iatIndicator, 16); }
  foreignExchangeIndicatorField(): string { return this.converters.alphaField(this.foreignExchangeIndicator, 2); }
  foreignExchangeReferenceIndicatorField(): string { return this.converters.numericField(this.foreignExchangeReferenceIndicator, 1); }
  foreignExchangeReferenceField(): string {
    if (this.foreignExchangeReferenceIndicator === 3) return '               ';
    return this.converters.alphaField(this.foreignExchangeReference, 15);
  }
  isoDestinationCountryCodeField(): string { return this.converters.alphaField(this.isoDestinationCountryCode, 2); }
  originatorIdentificationField(): string { return this.converters.alphaField(this.originatorIdentification, 10); }
  companyEntryDescriptionField(): string { return this.converters.alphaField(this.companyEntryDescription, 10); }
  isoOriginatingCurrencyCodeField(): string { return this.converters.alphaField(this.isoOriginatingCurrencyCode, 3); }
  isoDestinationCurrencyCodeField(): string { return this.converters.alphaField(this.isoDestinationCurrencyCode, 3); }
  effectiveEntryDateField(): string { return this.converters.stringField(this.effectiveEntryDate, 6); }
  odfiIdentificationField(): string { return this.converters.stringField(this.odfiIdentification, 8); }
  batchNumberField(): string { return this.converters.numericField(this.batchNumber, 7); }
  settlementDateField(): string { return this.converters.alphaField(this.settlementDate, 3); }

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
