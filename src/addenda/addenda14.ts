import { entryAddendaPos } from '../constants.js';
import { enrichErrors, enrichError, addenda14FieldPositions } from '../fieldPositions.js';
import type { ValidateOpts } from '../validateOpts.js';
import { Converters, converters } from '../utils/converters.js';
import { Validators, validators } from '../utils/validators.js';
import {
  fieldError,
  ErrConstructor,
  ErrAddendaTypeCode,
  ErrIDNumberQualifier,
} from '../errors/index.js';

/**
 * Addenda14 is an IAT addenda record providing RDFI information
 * (name, ID qualifier, identification, branch country code).
 */
export class Addenda14 {
  id = '';
  typeCode = '14';
  rdfiName = '';
  rdfiIDNumberQualifier = '';
  rdfiIdentification = '';
  rdfiBranchCountryCode = '';
  entryDetailSequenceNumber = 0;
  lineNumber = 0;
  validateOpts?: ValidateOpts;

  parse(record: string): void {
    const runes = [...record];
    if (runes.length !== 94) return;

    this.typeCode = runes.slice(1, 3).join('');
    this.rdfiName = runes.slice(3, 38).join('').trim();
    this.rdfiIDNumberQualifier = runes.slice(38, 40).join('').trim();
    this.rdfiIdentification = converters.parseStringField(runes.slice(40, 74).join(''));
    this.rdfiBranchCountryCode = runes.slice(74, 77).join('').trim();
    // 78-87 Reserved
    this.entryDetailSequenceNumber = converters.parseNumField(runes.slice(87, 94).join(''));
  }

  setValidation(opts: ValidateOpts | undefined): void { this.validateOpts = opts; }

  string(): string {
    return (
      entryAddendaPos +
      this.typeCode +
      this.rdfiNameField() +
      this.rdfiIDNumberQualifierField() +
      this.rdfiIdentificationField() +
      this.rdfiBranchCountryCodeField() +
      '          ' +
      this.entryDetailSequenceNumberField()
    );
  }

  validate(): Error | null {
    const err = this._validate();
    if (err) enrichError(err, this.lineNumber, addenda14FieldPositions);
    return err;
  }

  private _validate(): Error | null {
    const inclErr = this.fieldInclusion();
    if (inclErr) return inclErr;

    if (this.typeCode !== '14') return fieldError('TypeCode', ErrAddendaTypeCode, this.typeCode);

    if (validators.isIDNumberQualifier(this.rdfiIDNumberQualifier)) {
      return fieldError('RDFIIDNumberQualifier', ErrIDNumberQualifier, this.rdfiIDNumberQualifier);
    }

    if (!this.validateOpts?.allowSpecialCharacters) {
      const nameErr = validators.isAlphanumeric(this.rdfiName);
      if (nameErr) return fieldError('RDFIName', nameErr, this.rdfiName);
      const idErr = validators.isAlphanumeric(this.rdfiIdentification);
      if (idErr) return fieldError('RDFIIdentification', idErr, this.rdfiIdentification);
      const ccErr = validators.isAlphanumeric(this.rdfiBranchCountryCode);
      if (ccErr) return fieldError('RDFIBranchCountryCode', ccErr, this.rdfiBranchCountryCode);
    }
    return null;
  }

  /** ValidateAll performs all NACHA format rule checks and returns all errors found */
  validateAll(): Error[] {
    const errors: Error[] = [];
    const push = (err: Error | null | undefined) => { if (err) errors.push(err); };

    if (this.typeCode === '') push(fieldError('TypeCode', ErrConstructor, this.typeCode));
    if (this.rdfiName === '') push(fieldError('RDFIName', ErrConstructor, this.rdfiName));
    if (this.rdfiIDNumberQualifier === '') push(fieldError('RDFIIDNumberQualifier', ErrConstructor, this.rdfiIDNumberQualifier));
    if (this.rdfiIdentification === '') push(fieldError('RDFIIdentification', ErrConstructor, this.rdfiIdentification));
    if (this.rdfiBranchCountryCode === '') push(fieldError('RDFIBranchCountryCode', ErrConstructor, this.rdfiBranchCountryCode));
    if (this.entryDetailSequenceNumber < 0) push(fieldError('EntryDetailSequenceNumber', ErrConstructor, this.entryDetailSequenceNumberField()));

    if (this.typeCode !== '14') push(fieldError('TypeCode', ErrAddendaTypeCode, this.typeCode));
    if (validators.isIDNumberQualifier(this.rdfiIDNumberQualifier)) {
      push(fieldError('RDFIIDNumberQualifier', ErrIDNumberQualifier, this.rdfiIDNumberQualifier));
    }
    if (!this.validateOpts?.allowSpecialCharacters) {
      push(fieldError('RDFIName', validators.isAlphanumeric(this.rdfiName), this.rdfiName));
      push(fieldError('RDFIIdentification', validators.isAlphanumeric(this.rdfiIdentification), this.rdfiIdentification));
      push(fieldError('RDFIBranchCountryCode', validators.isAlphanumeric(this.rdfiBranchCountryCode), this.rdfiBranchCountryCode));
    }

    return enrichErrors(errors, this.lineNumber, addenda14FieldPositions);
  }

  private fieldInclusion(): Error | null {
    if (this.typeCode === '') return fieldError('TypeCode', ErrConstructor, this.typeCode);
    if (this.rdfiName === '') return fieldError('RDFIName', ErrConstructor, this.rdfiName);
    if (this.rdfiIDNumberQualifier === '') return fieldError('RDFIIDNumberQualifier', ErrConstructor, this.rdfiIDNumberQualifier);
    if (this.rdfiIdentification === '') return fieldError('RDFIIdentification', ErrConstructor, this.rdfiIdentification);
    if (this.rdfiBranchCountryCode === '') return fieldError('RDFIBranchCountryCode', ErrConstructor, this.rdfiBranchCountryCode);
    if (this.entryDetailSequenceNumber < 0) return fieldError('EntryDetailSequenceNumber', ErrConstructor, this.entryDetailSequenceNumberField());
    return null;
  }

  rdfiNameField(): string { return converters.alphaField(this.rdfiName, 35); }
  rdfiIDNumberQualifierField(): string { return converters.alphaField(this.rdfiIDNumberQualifier, 2); }
  rdfiIdentificationField(): string { return converters.alphaField(this.rdfiIdentification, 34); }
  rdfiBranchCountryCodeField(): string { return converters.alphaField(this.rdfiBranchCountryCode, 3); }
  entryDetailSequenceNumberField(): string { return converters.numericField(this.entryDetailSequenceNumber, 7); }
}

export function newAddenda14(): Addenda14 { return new Addenda14(); }
