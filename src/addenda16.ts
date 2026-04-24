import { entryAddendaPos } from './constants.js';
import { enrichErrors, addenda16FieldPositions } from './fieldPositions.js';
import type { ValidateOpts } from './validateOpts.js';
import { Converters } from './utils/converters.js';
import { Validators } from './utils/validators.js';
import {
  fieldError,
  ErrConstructor,
  ErrAddendaTypeCode,
} from './errors/index.js';

/**
 * Addenda16 is an IAT addenda record providing receiver city, state/province,
 * country, postal code, and date of birth.
 */
export class Addenda16 {
  id = '';
  typeCode = '16';
  receiverCityStateProvince = '';
  receiverCountryPostalCode = '';
  receiverDateOfBirth = '';
  entryDetailSequenceNumber = 0;
  lineNumber = 0;

  private converters = new Converters();
  private validators = new Validators();
  validateOpts?: ValidateOpts;

  parse(record: string): void {
    const runes = [...record];
    if (runes.length !== 94) return;

    this.typeCode = runes.slice(1, 3).join('');
    this.receiverCityStateProvince = runes.slice(3, 38).join('').trim();
    this.receiverCountryPostalCode = runes.slice(38, 73).join('').trim();
    this.receiverDateOfBirth = runes.slice(73, 83).join('').trim();
    // 84-87 Reserved
    this.entryDetailSequenceNumber = this.converters.parseNumField(runes.slice(87, 94).join(''));
  }

  setValidation(opts: ValidateOpts | undefined): void { this.validateOpts = opts; }

  string(): string {
    return (
      entryAddendaPos +
      this.typeCode +
      this.receiverCityStateProvinceField() +
      this.receiverCountryPostalCodeField() +
      this.receiverDateOfBirthField() +
      '    ' +
      this.entryDetailSequenceNumberField()
    );
  }

  validate(): Error | null {
    const inclErr = this.fieldInclusion();
    if (inclErr) return inclErr;

    if (this.typeCode !== '16') return fieldError('TypeCode', ErrAddendaTypeCode, this.typeCode);

    if (!this.validateOpts?.allowSpecialCharacters) {
      const cspErr = this.validators.isAlphanumeric(this.receiverCityStateProvince);
      if (cspErr) return fieldError('ReceiverCityStateProvince', cspErr, this.receiverCityStateProvince);
      const cpErr = this.validators.isAlphanumeric(this.receiverCountryPostalCode);
      if (cpErr) return fieldError('ReceiverCountryPostalCode', cpErr, this.receiverCountryPostalCode);
    }
    return null;
  }

  /** ValidateAll performs all NACHA format rule checks and returns all errors found */
  validateAll(): Error[] {
    const errors: Error[] = [];
    const push = (err: Error | null | undefined) => { if (err) errors.push(err); };

    if (this.typeCode === '') push(fieldError('TypeCode', ErrConstructor, this.typeCode));
    if (this.receiverCityStateProvince === '') push(fieldError('ReceiverCityStateProvince', ErrConstructor, this.receiverCityStateProvince));
    if (this.receiverCountryPostalCode === '') push(fieldError('ReceiverCountryPostalCode', ErrConstructor, this.receiverCountryPostalCode));
    if (this.entryDetailSequenceNumber < 0) push(fieldError('EntryDetailSequenceNumber', ErrConstructor, this.entryDetailSequenceNumberField()));

    if (this.typeCode !== '16') push(fieldError('TypeCode', ErrAddendaTypeCode, this.typeCode));
    if (!this.validateOpts?.allowSpecialCharacters) {
      push(fieldError('ReceiverCityStateProvince', this.validators.isAlphanumeric(this.receiverCityStateProvince), this.receiverCityStateProvince));
      push(fieldError('ReceiverCountryPostalCode', this.validators.isAlphanumeric(this.receiverCountryPostalCode), this.receiverCountryPostalCode));
    }

    return enrichErrors(errors, this.lineNumber, addenda16FieldPositions);
  }

  private fieldInclusion(): Error | null {
    if (this.typeCode === '') return fieldError('TypeCode', ErrConstructor, this.typeCode);
    if (this.receiverCityStateProvince === '') return fieldError('ReceiverCityStateProvince', ErrConstructor, this.receiverCityStateProvince);
    if (this.receiverCountryPostalCode === '') return fieldError('ReceiverCountryPostalCode', ErrConstructor, this.receiverCountryPostalCode);
    if (this.entryDetailSequenceNumber < 0) return fieldError('EntryDetailSequenceNumber', ErrConstructor, this.entryDetailSequenceNumberField());
    return null;
  }

  receiverCityStateProvinceField(): string { return this.converters.alphaField(this.receiverCityStateProvince, 35); }
  receiverCountryPostalCodeField(): string { return this.converters.alphaField(this.receiverCountryPostalCode, 35); }
  receiverDateOfBirthField(): string { return this.converters.alphaField(this.receiverDateOfBirth, 10); }
  entryDetailSequenceNumberField(): string { return this.converters.numericField(this.entryDetailSequenceNumber, 7); }
}

export function newAddenda16(): Addenda16 { return new Addenda16(); }
