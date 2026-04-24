import { entryAddendaPos } from './constants.js';
import { enrichErrors, addenda18FieldPositions } from './fieldPositions.js';
import type { ValidateOpts } from './validateOpts.js';
import { Converters } from './utils/converters.js';
import { Validators } from './utils/validators.js';
import {
  fieldError,
  ErrConstructor,
  ErrAddendaTypeCode,
} from './errors/index.js';

/**
 * Addenda18 is an IAT addenda record providing foreign correspondent bank information.
 * Maximum 5 Addenda18 records per entry.
 */
export class Addenda18 {
  id = '';
  typeCode = '18';
  foreignCorrespondentBankName = '';
  foreignCorrespondentBankIDNumberQualifier = '';
  foreignCorrespondentBankIDNumber = '';
  foreignCorrespondentBankBranchCountryCode = '';
  sequenceNumber = 0;
  entryDetailSequenceNumber = 0;
  lineNumber = 0;

  private converters = new Converters();
  private validators = new Validators();
  validateOpts?: ValidateOpts;

  parse(record: string): void {
    const runes = [...record];
    if (runes.length !== 94) return;

    this.typeCode = runes.slice(1, 3).join('');
    this.foreignCorrespondentBankName = runes.slice(3, 38).join('').trim();
    this.foreignCorrespondentBankIDNumberQualifier = runes.slice(38, 40).join('').trim();
    this.foreignCorrespondentBankIDNumber = runes.slice(40, 74).join('').trim();
    this.foreignCorrespondentBankBranchCountryCode = runes.slice(74, 77).join('').trim();
    // 78-83 Reserved
    this.sequenceNumber = this.converters.parseNumField(runes.slice(83, 87).join(''));
    this.entryDetailSequenceNumber = this.converters.parseNumField(runes.slice(87, 94).join(''));
  }

  setValidation(opts: ValidateOpts | undefined): void { this.validateOpts = opts; }

  string(): string {
    return (
      entryAddendaPos +
      this.typeCode +
      this.foreignCorrespondentBankNameField() +
      this.foreignCorrespondentBankIDNumberQualifierField() +
      this.foreignCorrespondentBankIDNumberField() +
      this.foreignCorrespondentBankBranchCountryCodeField() +
      '      ' +
      this.sequenceNumberField() +
      this.entryDetailSequenceNumberField()
    );
  }

  validate(): Error | null {
    const inclErr = this.fieldInclusion();
    if (inclErr) return inclErr;

    if (this.typeCode !== '18') return fieldError('TypeCode', ErrAddendaTypeCode, this.typeCode);

    if (!this.validateOpts?.allowSpecialCharacters) {
      for (const [name, val] of [
        ['ForeignCorrespondentBankName', this.foreignCorrespondentBankName],
        ['ForeignCorrespondentBankIDNumberQualifier', this.foreignCorrespondentBankIDNumberQualifier],
        ['ForeignCorrespondentBankIDNumber', this.foreignCorrespondentBankIDNumber],
        ['ForeignCorrespondentBankBranchCountryCode', this.foreignCorrespondentBankBranchCountryCode],
      ] as const) {
        const err = this.validators.isAlphanumeric(val);
        if (err) return fieldError(name, err, val);
      }
    }
    return null;
  }

  /** ValidateAll performs all NACHA format rule checks and returns all errors found */
  validateAll(): Error[] {
    const errors: Error[] = [];
    const push = (err: Error | null | undefined) => { if (err) errors.push(err); };

    if (this.typeCode === '') push(fieldError('TypeCode', ErrConstructor, this.typeCode));
    if (this.foreignCorrespondentBankName === '') push(fieldError('ForeignCorrespondentBankName', ErrConstructor, this.foreignCorrespondentBankName));
    if (this.foreignCorrespondentBankIDNumberQualifier === '') push(fieldError('ForeignCorrespondentBankIDNumberQualifier', ErrConstructor, this.foreignCorrespondentBankIDNumberQualifier));
    if (this.foreignCorrespondentBankIDNumber === '') push(fieldError('ForeignCorrespondentBankIDNumber', ErrConstructor, this.foreignCorrespondentBankIDNumber));
    if (this.foreignCorrespondentBankBranchCountryCode === '') push(fieldError('ForeignCorrespondentBankBranchCountryCode', ErrConstructor, this.foreignCorrespondentBankBranchCountryCode));
    if (this.sequenceNumber === 0) push(fieldError('SequenceNumber', ErrConstructor, this.sequenceNumberField()));
    if (this.entryDetailSequenceNumber < 0) push(fieldError('EntryDetailSequenceNumber', ErrConstructor, this.entryDetailSequenceNumberField()));

    if (this.typeCode !== '18') push(fieldError('TypeCode', ErrAddendaTypeCode, this.typeCode));
    if (!this.validateOpts?.allowSpecialCharacters) {
      for (const [name, val] of [
        ['ForeignCorrespondentBankName', this.foreignCorrespondentBankName],
        ['ForeignCorrespondentBankIDNumberQualifier', this.foreignCorrespondentBankIDNumberQualifier],
        ['ForeignCorrespondentBankIDNumber', this.foreignCorrespondentBankIDNumber],
        ['ForeignCorrespondentBankBranchCountryCode', this.foreignCorrespondentBankBranchCountryCode],
      ] as const) {
        push(fieldError(name, this.validators.isAlphanumeric(val), val));
      }
    }

    return enrichErrors(errors, this.lineNumber, addenda18FieldPositions);
  }

  private fieldInclusion(): Error | null {
    if (this.typeCode === '') return fieldError('TypeCode', ErrConstructor, this.typeCode);
    if (this.foreignCorrespondentBankName === '') return fieldError('ForeignCorrespondentBankName', ErrConstructor, this.foreignCorrespondentBankName);
    if (this.foreignCorrespondentBankIDNumberQualifier === '') return fieldError('ForeignCorrespondentBankIDNumberQualifier', ErrConstructor, this.foreignCorrespondentBankIDNumberQualifier);
    if (this.foreignCorrespondentBankIDNumber === '') return fieldError('ForeignCorrespondentBankIDNumber', ErrConstructor, this.foreignCorrespondentBankIDNumber);
    if (this.foreignCorrespondentBankBranchCountryCode === '') return fieldError('ForeignCorrespondentBankBranchCountryCode', ErrConstructor, this.foreignCorrespondentBankBranchCountryCode);
    if (this.sequenceNumber === 0) return fieldError('SequenceNumber', ErrConstructor, this.sequenceNumberField());
    if (this.entryDetailSequenceNumber < 0) return fieldError('EntryDetailSequenceNumber', ErrConstructor, this.entryDetailSequenceNumberField());
    return null;
  }

  foreignCorrespondentBankNameField(): string { return this.converters.alphaField(this.foreignCorrespondentBankName, 35); }
  foreignCorrespondentBankIDNumberQualifierField(): string { return this.converters.alphaField(this.foreignCorrespondentBankIDNumberQualifier, 2); }
  foreignCorrespondentBankIDNumberField(): string { return this.converters.alphaField(this.foreignCorrespondentBankIDNumber, 34); }
  foreignCorrespondentBankBranchCountryCodeField(): string { return this.converters.alphaField(this.foreignCorrespondentBankBranchCountryCode, 3); }
  sequenceNumberField(): string { return this.converters.numericField(this.sequenceNumber, 4); }
  entryDetailSequenceNumberField(): string { return this.converters.numericField(this.entryDetailSequenceNumber, 7); }
}

export function newAddenda18(): Addenda18 { return new Addenda18(); }
