import { entryAddendaPos } from '../constants.js';
import { enrichErrors, enrichError, addenda17FieldPositions } from '../fieldPositions.js';
import type { ValidateOpts } from '../validateOpts.js';
import { Converters, converters } from '../utils/converters.js';
import { Validators, validators } from '../utils/validators.js';
import {
  fieldError,
  ErrConstructor,
  ErrAddendaTypeCode,
} from '../errors/index.js';

/**
 * Addenda17 is an IAT addenda record providing payment-related information.
 * Maximum 2 Addenda17 records per entry.
 */
export class Addenda17 {
  id = '';
  typeCode = '17';
  paymentRelatedInformation = '';
  sequenceNumber = 0;
  entryDetailSequenceNumber = 0;
  lineNumber = 0;
  validateOpts?: ValidateOpts;

  parse(record: string): void {
    const runes = [...record];
    if (runes.length !== 94) return;

    this.typeCode = runes.slice(1, 3).join('');
    this.paymentRelatedInformation = runes.slice(3, 83).join('').trimEnd();
    this.sequenceNumber = converters.parseNumField(runes.slice(83, 87).join(''));
    this.entryDetailSequenceNumber = converters.parseNumField(runes.slice(87, 94).join(''));
  }

  setValidation(opts: ValidateOpts | undefined): void { this.validateOpts = opts; }

  string(): string {
    return (
      entryAddendaPos +
      this.typeCode +
      this.paymentRelatedInformationField() +
      this.sequenceNumberField() +
      this.entryDetailSequenceNumberField()
    );
  }

  validate(): Error | null {
    const err = this._validate();
    if (err) enrichError(err, this.lineNumber, addenda17FieldPositions);
    return err;
  }

  private _validate(): Error | null {
    const inclErr = this.fieldInclusion();
    if (inclErr) return inclErr;

    if (this.typeCode !== '17') return fieldError('TypeCode', ErrAddendaTypeCode, this.typeCode);

    if (!this.validateOpts?.allowSpecialCharacters) {
      const err = validators.isAlphanumeric(this.paymentRelatedInformation);
      if (err) return fieldError('PaymentRelatedInformation', err, this.paymentRelatedInformation);
    }
    return null;
  }

  /** ValidateAll performs all NACHA format rule checks and returns all errors found */
  validateAll(): Error[] {
    const errors: Error[] = [];
    const push = (err: Error | null | undefined) => { if (err) errors.push(err); };

    if (this.typeCode === '') push(fieldError('TypeCode', ErrConstructor, this.typeCode));
    if (this.sequenceNumber === 0) push(fieldError('SequenceNumber', ErrConstructor, this.sequenceNumberField()));
    if (this.entryDetailSequenceNumber < 0) push(fieldError('EntryDetailSequenceNumber', ErrConstructor, this.entryDetailSequenceNumberField()));

    if (this.typeCode !== '17') push(fieldError('TypeCode', ErrAddendaTypeCode, this.typeCode));
    if (!this.validateOpts?.allowSpecialCharacters) {
      push(fieldError('PaymentRelatedInformation', validators.isAlphanumeric(this.paymentRelatedInformation), this.paymentRelatedInformation));
    }

    return enrichErrors(errors, this.lineNumber, addenda17FieldPositions);
  }

  private fieldInclusion(): Error | null {
    if (this.typeCode === '') return fieldError('TypeCode', ErrConstructor, this.typeCode);
    if (this.sequenceNumber === 0) return fieldError('SequenceNumber', ErrConstructor, this.sequenceNumberField());
    if (this.entryDetailSequenceNumber < 0) return fieldError('EntryDetailSequenceNumber', ErrConstructor, this.entryDetailSequenceNumberField());
    return null;
  }

  paymentRelatedInformationField(): string { return converters.alphaField(this.paymentRelatedInformation, 80); }
  sequenceNumberField(): string { return converters.numericField(this.sequenceNumber, 4); }
  entryDetailSequenceNumberField(): string { return converters.numericField(this.entryDetailSequenceNumber, 7); }
}

export function newAddenda17(): Addenda17 { return new Addenda17(); }
