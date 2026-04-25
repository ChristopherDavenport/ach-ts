import { batchHeaderPos } from './constants.js';
import { enrichErrors, enrichError, batchHeaderFieldPositions } from './fieldPositions.js';
import type { ValidateOpts } from './validateOpts.js';
import { isSkipped, applyErrorLevel, applyErrorLevels } from './validateOpts.js';
import { Converters, converters } from './utils/converters.js';
import { Validators, validators } from './utils/validators.js';
import {
  fieldError,
  ErrConstructor,
  ErrServiceClass,
  ErrSECCode,
  ErrOrigStatusCode,
} from './errors/index.js';

/**
 * BatchHeader identifies the originating entity and the type of transactions
 * contained in the batch.
 */
export class BatchHeader {
  id = '';
  /** ServiceClassCode ACH Mixed Debits and Credits '200', ACH Credits Only '220', ACH Debits Only '225' */
  serviceClassCode = 0;
  /** CompanyName the company originating the entries in the batch */
  companyName = '';
  /** CompanyDiscretionaryData for the Originator's use */
  companyDiscretionaryData = '';
  /** CompanyIdentification assigned to the Originator by the ODFI */
  companyIdentification = '';
  /** StandardEntryClassCode SEC code (PPD, CCD, WEB, etc.) */
  standardEntryClassCode = '';
  /** CompanyEntryDescription describes the purpose of the entry */
  companyEntryDescription = '';
  /** CompanyDescriptiveDate additional date information for Receivor */
  companyDescriptiveDate = '';
  /** EffectiveEntryDate the date on which the entries should be settled */
  effectiveEntryDate = '';
  /** SettlementDate Julian date ODFI requests entries are settled */
  settlementDate = '';
  /** OriginatorStatusCode "0" ADV, "1" non-federal govt, "2" federal govt */
  originatorStatusCode = 0;
  /** ODFIIdentification first 8 digits of the originating DFI transit routing number */
  odfiIdentification = '';
  /** BatchNumber assigns a number in ascending order to each batch in a file */
  batchNumber = 0;
  /** Line number at which the record appears */
  lineNumber = 0;
  validateOpts?: ValidateOpts;

  /** Parse takes the input record string and parses the BatchHeader values */
  parse(record: string): void {
    const runes = [...record];
    if (runes.length !== 94) return;

    // 1-1 Always "5"
    // 2-4 ServiceClassCode
    this.serviceClassCode = converters.parseNumField(runes.slice(1, 4).join(''));
    // 5-20 CompanyName
    this.companyName = converters.parseStringFieldWithOpts(runes.slice(4, 20).join(''), this.validateOpts);
    // 21-40 CompanyDiscretionaryData
    this.companyDiscretionaryData = converters.parseStringFieldWithOpts(runes.slice(20, 40).join(''), this.validateOpts);
    // 41-50 CompanyIdentification
    this.companyIdentification = converters.parseStringFieldWithOpts(runes.slice(40, 50).join(''), this.validateOpts);
    // 51-53 StandardEntryClassCode
    this.standardEntryClassCode = runes.slice(50, 53).join('');
    // 54-63 CompanyEntryDescription
    this.companyEntryDescription = converters.parseStringFieldWithOpts(runes.slice(53, 63).join(''), this.validateOpts);
    // 64-69 CompanyDescriptiveDate
    this.companyDescriptiveDate = converters.parseStringFieldWithOpts(runes.slice(63, 69).join(''), this.validateOpts);
    // 70-75 EffectiveEntryDate
    this.effectiveEntryDate = validators.validateSimpleDate(runes.slice(69, 75).join(''));
    // 76-78 SettlementDate (Julian)
    this.settlementDate = validators.validateSettlementDate(runes.slice(75, 78).join(''));
    // 79-79 OriginatorStatusCode
    this.originatorStatusCode = converters.parseNumField(runes.slice(78, 79).join(''));
    // 80-87 ODFIIdentification
    this.odfiIdentification = converters.parseStringField(runes.slice(79, 87).join(''));
    // 88-94 BatchNumber
    this.batchNumber = converters.parseNumField(runes.slice(87, 94).join(''));
  }

  /** String writes the BatchHeader struct to a 94 character string */
  string(): string {
    return (
      batchHeaderPos +
      this.serviceClassCodeField() +
      this.companyNameField() +
      this.companyDiscretionaryDataField() +
      this.companyIdentificationField() +
      this.standardEntryClassCode +
      this.companyEntryDescriptionField() +
      this.companyDescriptiveDateField() +
      this.effectiveEntryDateField() +
      this.settlementDateField() +
      String(this.originatorStatusCode) +
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
    if (err) enrichError(err, this.lineNumber, batchHeaderFieldPositions);
    err = applyErrorLevel(err, this.validateOpts);
    return err;
  }

  private _validate(): Error | null {
    const inclErr = this.fieldInclusion();
    if (inclErr) return inclErr;

    if (validators.isServiceClass(this.serviceClassCode)) {
      return fieldError('ServiceClassCode', ErrServiceClass, this.serviceClassCode);
    }
    if (!isSkipped(this.validateOpts, 'skipBatchHeaderCompanyValidation')) {
      if (validators.isSECCode(this.standardEntryClassCode)) {
        return fieldError('StandardEntryClassCode', ErrSECCode, this.standardEntryClassCode);
      }
    }
    if (validators.isOriginatorStatusCode(this.originatorStatusCode)) {
      return fieldError('OriginatorStatusCode', ErrOrigStatusCode, this.originatorStatusCode);
    }
    if (!isSkipped(this.validateOpts, 'allowSpecialCharacters')) {
      const nameErr = validators.isAlphanumeric(this.companyName);
      if (nameErr) return fieldError('CompanyName', nameErr, this.companyName);

      const discErr = validators.isAlphanumeric(this.companyDiscretionaryData);
      if (discErr) return fieldError('CompanyDiscretionaryData', discErr, this.companyDiscretionaryData);

      const descErr = validators.isAlphanumeric(this.companyEntryDescription);
      if (descErr) return fieldError('CompanyEntryDescription', descErr, this.companyEntryDescription);

      const identErr = validators.isAlphanumeric(this.companyIdentification);
      if (identErr) return fieldError('CompanyIdentification', identErr, this.companyIdentification);
    }
    return null;
  }

  /** ValidateAll performs all NACHA format rule checks and returns all errors found */
  validateAll(): Error[] {
    const errors: Error[] = [];
    const push = (err: Error | null | undefined) => { if (err) errors.push(err); };

    // Field inclusion checks (inlined to collect all)
    if (!isSkipped(this.validateOpts, 'skipBatchHeaderCompanyValidation')) {
      if (this.serviceClassCode === 0) push(fieldError('ServiceClassCode', ErrConstructor, this.serviceClassCodeField()));
      if (this.standardEntryClassCode === '') push(fieldError('StandardEntryClassCode', ErrConstructor, this.standardEntryClassCode));
      if (this.companyName === '') push(fieldError('CompanyName', ErrConstructor, this.companyNameField()));
      if (this.companyIdentification === '') push(fieldError('CompanyIdentification', ErrConstructor, this.companyIdentificationField()));
      if (this.odfiIdentification === '') push(fieldError('ODFIIdentification', ErrConstructor, this.odfiIdentificationField()));
    }

    if (validators.isServiceClass(this.serviceClassCode)) {
      push(fieldError('ServiceClassCode', ErrServiceClass, this.serviceClassCode));
    }
    if (!isSkipped(this.validateOpts, 'skipBatchHeaderCompanyValidation')) {
      if (validators.isSECCode(this.standardEntryClassCode)) {
        push(fieldError('StandardEntryClassCode', ErrSECCode, this.standardEntryClassCode));
      }
    }
    if (validators.isOriginatorStatusCode(this.originatorStatusCode)) {
      push(fieldError('OriginatorStatusCode', ErrOrigStatusCode, this.originatorStatusCode));
    }
    if (!isSkipped(this.validateOpts, 'allowSpecialCharacters')) {
      push(fieldError('CompanyName', validators.isAlphanumeric(this.companyName), this.companyName));
      push(fieldError('CompanyDiscretionaryData', validators.isAlphanumeric(this.companyDiscretionaryData), this.companyDiscretionaryData));
      push(fieldError('CompanyEntryDescription', validators.isAlphanumeric(this.companyEntryDescription), this.companyEntryDescription));
      push(fieldError('CompanyIdentification', validators.isAlphanumeric(this.companyIdentification), this.companyIdentification));
    }

    return applyErrorLevels(
      enrichErrors(errors, this.lineNumber, batchHeaderFieldPositions),
      this.validateOpts,
    );
  }

  private fieldInclusion(): Error | null {
    if (isSkipped(this.validateOpts, 'skipBatchHeaderCompanyValidation')) return null;

    if (this.serviceClassCode === 0) {
      return fieldError('ServiceClassCode', ErrConstructor, this.serviceClassCodeField());
    }
    if (this.standardEntryClassCode === '') {
      return fieldError('StandardEntryClassCode', ErrConstructor, this.standardEntryClassCode);
    }
    if (this.companyName === '') {
      return fieldError('CompanyName', ErrConstructor, this.companyNameField());
    }
    if (this.companyIdentification === '') {
      return fieldError('CompanyIdentification', ErrConstructor, this.companyIdentificationField());
    }
    if (this.odfiIdentification === '') {
      return fieldError('ODFIIdentification', ErrConstructor, this.odfiIdentificationField());
    }
    return null;
  }

  /** Check if two BatchHeaders are equal (uses Nacha-defined fields only) */
  equal(other: BatchHeader): boolean {
    if (!other) return false;
    return (
      this.serviceClassCode === other.serviceClassCode &&
      this.companyName.toLowerCase() === other.companyName.toLowerCase() &&
      this.companyIdentification === other.companyIdentification &&
      this.standardEntryClassCode === other.standardEntryClassCode &&
      this.companyEntryDescription === other.companyEntryDescription &&
      this.effectiveEntryDate === other.effectiveEntryDate &&
      this.odfiIdentification === other.odfiIdentification
    );
  }

  // Field formatters
  serviceClassCodeField(): string { return converters.numericField(this.serviceClassCode, 3); }
  companyNameField(): string { return converters.alphaField(this.companyName, 16); }
  companyDiscretionaryDataField(): string { return converters.alphaField(this.companyDiscretionaryData, 20); }
  companyIdentificationField(): string { return converters.alphaField(this.companyIdentification, 10); }
  companyEntryDescriptionField(): string { return converters.alphaField(this.companyEntryDescription, 10); }
  companyDescriptiveDateField(): string { return converters.alphaField(this.companyDescriptiveDate, 6); }
  effectiveEntryDateField(): string { return converters.formatSimpleDate(this.effectiveEntryDate); }
  settlementDateField(): string {
    if (this.settlementDate === '') return '   ';
    return converters.alphaField(this.settlementDate, 3);
  }
  odfiIdentificationField(): string { return converters.stringField(this.odfiIdentification, 8); }
  batchNumberField(): string { return converters.numericField(this.batchNumber, 7); }
}

export function newBatchHeader(): BatchHeader {
  return new BatchHeader();
}
