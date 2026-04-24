import { entryAddendaPos } from './constants.js';
import type { ValidateOpts } from './validateOpts.js';
import { Converters } from './utils/converters.js';
import { Validators } from './utils/validators.js';
import {
  fieldError,
  ErrConstructor,
  ErrAddendaTypeCode,
} from './errors/index.js';

/**
 * Addenda12 is an IAT addenda record providing originator city, state/province,
 * country, postal code, and date of birth.
 */
export class Addenda12 {
  id = '';
  typeCode = '12';
  originatorCityStateProvince = '';
  originatorCountryPostalCode = '';
  originatorDateOfBirth = '';
  entryDetailSequenceNumber = 0;
  lineNumber = 0;

  private converters = new Converters();
  private validators = new Validators();
  validateOpts?: ValidateOpts;

  parse(record: string): void {
    const runes = [...record];
    if (runes.length !== 94) return;

    this.typeCode = runes.slice(1, 3).join('');
    this.originatorCityStateProvince = runes.slice(3, 38).join('').trim();
    this.originatorCountryPostalCode = runes.slice(38, 73).join('').trim();
    this.originatorDateOfBirth = runes.slice(73, 83).join('').trim();
    // 84-87 Reserved
    this.entryDetailSequenceNumber = this.converters.parseNumField(runes.slice(87, 94).join(''));
  }

  setValidation(opts: ValidateOpts | undefined): void { this.validateOpts = opts; }

  string(): string {
    return (
      entryAddendaPos +
      this.typeCode +
      this.originatorCityStateProvinceField() +
      this.originatorCountryPostalCodeField() +
      this.originatorDateOfBirthField() +
      '    ' +
      this.entryDetailSequenceNumberField()
    );
  }

  validate(): Error | null {
    const inclErr = this.fieldInclusion();
    if (inclErr) return inclErr;

    if (this.typeCode !== '12') return fieldError('TypeCode', ErrAddendaTypeCode, this.typeCode);

    if (!this.validateOpts?.allowSpecialCharacters) {
      const cspErr = this.validators.isAlphanumeric(this.originatorCityStateProvince);
      if (cspErr) return fieldError('OriginatorCityStateProvince', cspErr, this.originatorCityStateProvince);
      const cpErr = this.validators.isAlphanumeric(this.originatorCountryPostalCode);
      if (cpErr) return fieldError('OriginatorCountryPostalCode', cpErr, this.originatorCountryPostalCode);
    }
    return null;
  }

  private fieldInclusion(): Error | null {
    if (this.typeCode === '') return fieldError('TypeCode', ErrConstructor, this.typeCode);
    if (this.originatorCityStateProvince === '') return fieldError('OriginatorCityStateProvince', ErrConstructor, this.originatorCityStateProvince);
    if (this.originatorCountryPostalCode === '') return fieldError('OriginatorCountryPostalCode', ErrConstructor, this.originatorCountryPostalCode);
    if (this.entryDetailSequenceNumber < 0) return fieldError('EntryDetailSequenceNumber', ErrConstructor, this.entryDetailSequenceNumberField());
    return null;
  }

  originatorCityStateProvinceField(): string { return this.converters.alphaField(this.originatorCityStateProvince, 35); }
  originatorCountryPostalCodeField(): string { return this.converters.alphaField(this.originatorCountryPostalCode, 35); }
  originatorDateOfBirthField(): string { return this.converters.alphaField(this.originatorDateOfBirth, 10); }
  entryDetailSequenceNumberField(): string { return this.converters.numericField(this.entryDetailSequenceNumber, 7); }
}

export function newAddenda12(): Addenda12 { return new Addenda12(); }
