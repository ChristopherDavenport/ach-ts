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
 * Addenda15 is an IAT addenda record providing receiver ID number and street address.
 */
export class Addenda15 {
  id = '';
  typeCode = '15';
  receiverIDNumber = '';
  receiverStreetAddress = '';
  entryDetailSequenceNumber = 0;
  lineNumber = 0;

  private converters = new Converters();
  private validators = new Validators();
  validateOpts?: ValidateOpts;

  parse(record: string): void {
    const runes = [...record];
    if (runes.length !== 94) return;

    this.typeCode = runes.slice(1, 3).join('');
    this.receiverIDNumber = this.converters.parseStringField(runes.slice(3, 18).join(''));
    this.receiverStreetAddress = runes.slice(18, 53).join('').trim();
    // 54-87 Reserved
    this.entryDetailSequenceNumber = this.converters.parseNumField(runes.slice(87, 94).join(''));
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
    const inclErr = this.fieldInclusion();
    if (inclErr) return inclErr;

    if (this.typeCode !== '15') return fieldError('TypeCode', ErrAddendaTypeCode, this.typeCode);

    if (!this.validateOpts?.allowSpecialCharacters) {
      const idErr = this.validators.isAlphanumeric(this.receiverIDNumber);
      if (idErr) return fieldError('ReceiverIDNumber', idErr, this.receiverIDNumber);
      const addrErr = this.validators.isAlphanumeric(this.receiverStreetAddress);
      if (addrErr) return fieldError('ReceiverStreetAddress', addrErr, this.receiverStreetAddress);
    }
    return null;
  }

  private fieldInclusion(): Error | null {
    if (this.typeCode === '') return fieldError('TypeCode', ErrConstructor, this.typeCode);
    if (this.receiverStreetAddress === '') return fieldError('ReceiverStreetAddress', ErrConstructor, this.receiverStreetAddress);
    if (this.entryDetailSequenceNumber < 0) return fieldError('EntryDetailSequenceNumber', ErrConstructor, this.entryDetailSequenceNumberField());
    return null;
  }

  receiverIDNumberField(): string { return this.converters.alphaField(this.receiverIDNumber, 15); }
  receiverStreetAddressField(): string { return this.converters.alphaField(this.receiverStreetAddress, 35); }
  entryDetailSequenceNumberField(): string { return this.converters.numericField(this.entryDetailSequenceNumber, 7); }
}

export function newAddenda15(): Addenda15 { return new Addenda15(); }
