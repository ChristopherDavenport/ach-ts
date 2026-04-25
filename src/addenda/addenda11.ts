import { entryAddendaPos } from '../constants.js';
import { enrichErrors, enrichError, addenda11FieldPositions } from '../fieldPositions.js';
import type { ValidateOpts } from '../validateOpts.js';
import { isSkipped, applyErrorLevel, applyErrorLevels } from '../validateOpts.js';
import { Converters, converters } from '../utils/converters.js';
import { Validators, validators } from '../utils/validators.js';
import {
  fieldError,
  ErrConstructor,
  ErrAddendaTypeCode,
} from '../errors/index.js';

/**
 * Addenda11 is an IAT addenda record providing originator name and street address.
 */
export class Addenda11 {
  id = '';
  typeCode = '11';
  originatorName = '';
  originatorStreetAddress = '';
  entryDetailSequenceNumber = 0;
  lineNumber = 0;
  validateOpts?: ValidateOpts;

  parse(record: string): void {
    const runes = [...record];
    if (runes.length !== 94) return;

    this.typeCode = runes.slice(1, 3).join('');
    this.originatorName = runes.slice(3, 38).join('').trim();
    this.originatorStreetAddress = runes.slice(38, 73).join('').trim();
    // 74-87 Reserved
    this.entryDetailSequenceNumber = converters.parseNumField(runes.slice(87, 94).join(''));
  }

  setValidation(opts: ValidateOpts | undefined): void { this.validateOpts = opts; }

  string(): string {
    return (
      entryAddendaPos +
      this.typeCode +
      this.originatorNameField() +
      this.originatorStreetAddressField() +
      '              ' +
      this.entryDetailSequenceNumberField()
    );
  }

  validate(): Error | null {
    let err = this._validate();
    if (err) enrichError(err, this.lineNumber, addenda11FieldPositions);
    err = applyErrorLevel(err, this.validateOpts);
    return err;
  }

  private _validate(): Error | null {
    const inclErr = this.fieldInclusion();
    if (inclErr) return inclErr;

    if (this.typeCode !== '11') return fieldError('TypeCode', ErrAddendaTypeCode, this.typeCode);

    if (!isSkipped(this.validateOpts, 'allowSpecialCharacters')) {
      const nameErr = validators.isAlphanumeric(this.originatorName);
      if (nameErr) return fieldError('OriginatorName', nameErr, this.originatorName);
      const addrErr = validators.isAlphanumeric(this.originatorStreetAddress);
      if (addrErr) return fieldError('OriginatorStreetAddress', addrErr, this.originatorStreetAddress);
    }
    return null;
  }

  /** ValidateAll performs all NACHA format rule checks and returns all errors found */
  validateAll(): Error[] {
    const errors: Error[] = [];
    const push = (err: Error | null | undefined) => { if (err) errors.push(err); };

    // Field inclusion checks (inlined to collect all)
    if (this.typeCode === '') push(fieldError('TypeCode', ErrConstructor, this.typeCode));
    if (this.originatorName === '') push(fieldError('OriginatorName', ErrConstructor, this.originatorName));
    if (this.originatorStreetAddress === '') push(fieldError('OriginatorStreetAddress', ErrConstructor, this.originatorStreetAddress));
    if (this.entryDetailSequenceNumber < 0) push(fieldError('EntryDetailSequenceNumber', ErrConstructor, this.entryDetailSequenceNumberField()));

    if (this.typeCode !== '11') push(fieldError('TypeCode', ErrAddendaTypeCode, this.typeCode));
    if (!isSkipped(this.validateOpts, 'allowSpecialCharacters')) {
      push(fieldError('OriginatorName', validators.isAlphanumeric(this.originatorName), this.originatorName));
      push(fieldError('OriginatorStreetAddress', validators.isAlphanumeric(this.originatorStreetAddress), this.originatorStreetAddress));
    }

    return applyErrorLevels(
      enrichErrors(errors, this.lineNumber, addenda11FieldPositions),
      this.validateOpts,
    );
  }

  private fieldInclusion(): Error | null {
    if (this.typeCode === '') return fieldError('TypeCode', ErrConstructor, this.typeCode);
    if (this.originatorName === '') return fieldError('OriginatorName', ErrConstructor, this.originatorName);
    if (this.originatorStreetAddress === '') return fieldError('OriginatorStreetAddress', ErrConstructor, this.originatorStreetAddress);
    if (this.entryDetailSequenceNumber < 0) return fieldError('EntryDetailSequenceNumber', ErrConstructor, this.entryDetailSequenceNumberField());
    return null;
  }

  originatorNameField(): string { return converters.alphaField(this.originatorName, 35); }
  originatorStreetAddressField(): string { return converters.alphaField(this.originatorStreetAddress, 35); }
  entryDetailSequenceNumberField(): string { return converters.numericField(this.entryDetailSequenceNumber, 7); }
}

export function newAddenda11(): Addenda11 { return new Addenda11(); }
