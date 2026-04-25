import { entryAddendaPos } from '../constants.js';
import { enrichErrors, enrichError, addenda15FieldPositions } from '../fieldPositions.js';
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
 * Addenda15 is an IAT addenda record providing receiver ID number and street address.
 */
export class Addenda15 {
  id = '';
  typeCode = '15';
  receiverIDNumber = '';
  receiverStreetAddress = '';
  entryDetailSequenceNumber = 0;
  lineNumber = 0;
  validateOpts?: ValidateOpts;

  parse(record: string): void {
    const runes = [...record];
    if (runes.length !== 94) return;

    this.typeCode = runes.slice(1, 3).join('');
    this.receiverIDNumber = converters.parseStringField(runes.slice(3, 18).join(''));
    this.receiverStreetAddress = runes.slice(18, 53).join('').trim();
    // 54-87 Reserved
    this.entryDetailSequenceNumber = converters.parseNumField(runes.slice(87, 94).join(''));
  }

  setValidation(opts: ValidateOpts | undefined): void { this.validateOpts = opts; }

  string(): string {
    return (
      entryAddendaPos +
      this.typeCode +
      this.receiverIDNumberField() +
      this.receiverStreetAddressField() +
      '                                  ' +
      this.entryDetailSequenceNumberField()
    );
  }

  validate(): Error | null {
    let err = this._validate();
    if (err) enrichError(err, this.lineNumber, addenda15FieldPositions);
    err = applyErrorLevel(err, this.validateOpts);
    return err;
  }

  private _validate(): Error | null {
    const inclErr = this.fieldInclusion();
    if (inclErr) return inclErr;

    if (this.typeCode !== '15') return fieldError('TypeCode', ErrAddendaTypeCode, this.typeCode);

    if (!isSkipped(this.validateOpts, 'allowSpecialCharacters')) {
      const idErr = validators.isAlphanumeric(this.receiverIDNumber);
      if (idErr) return fieldError('ReceiverIDNumber', idErr, this.receiverIDNumber);
      const addrErr = validators.isAlphanumeric(this.receiverStreetAddress);
      if (addrErr) return fieldError('ReceiverStreetAddress', addrErr, this.receiverStreetAddress);
    }
    return null;
  }

  /** ValidateAll performs all NACHA format rule checks and returns all errors found */
  validateAll(): Error[] {
    const errors: Error[] = [];
    const push = (err: Error | null | undefined) => { if (err) errors.push(err); };

    if (this.typeCode === '') push(fieldError('TypeCode', ErrConstructor, this.typeCode));
    if (this.receiverStreetAddress === '') push(fieldError('ReceiverStreetAddress', ErrConstructor, this.receiverStreetAddress));
    if (this.entryDetailSequenceNumber < 0) push(fieldError('EntryDetailSequenceNumber', ErrConstructor, this.entryDetailSequenceNumberField()));

    if (this.typeCode !== '15') push(fieldError('TypeCode', ErrAddendaTypeCode, this.typeCode));
    if (!isSkipped(this.validateOpts, 'allowSpecialCharacters')) {
      push(fieldError('ReceiverIDNumber', validators.isAlphanumeric(this.receiverIDNumber), this.receiverIDNumber));
      push(fieldError('ReceiverStreetAddress', validators.isAlphanumeric(this.receiverStreetAddress), this.receiverStreetAddress));
    }

    return applyErrorLevels(
      enrichErrors(errors, this.lineNumber, addenda15FieldPositions),
      this.validateOpts,
    );
  }

  private fieldInclusion(): Error | null {
    if (this.typeCode === '') return fieldError('TypeCode', ErrConstructor, this.typeCode);
    if (this.receiverStreetAddress === '') return fieldError('ReceiverStreetAddress', ErrConstructor, this.receiverStreetAddress);
    if (this.entryDetailSequenceNumber < 0) return fieldError('EntryDetailSequenceNumber', ErrConstructor, this.entryDetailSequenceNumberField());
    return null;
  }

  receiverIDNumberField(): string { return converters.alphaField(this.receiverIDNumber, 15); }
  receiverStreetAddressField(): string { return converters.alphaField(this.receiverStreetAddress, 35); }
  entryDetailSequenceNumberField(): string { return converters.numericField(this.entryDetailSequenceNumber, 7); }
}

export function newAddenda15(): Addenda15 { return new Addenda15(); }
