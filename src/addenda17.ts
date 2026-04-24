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

  private converters = new Converters();
  private validators = new Validators();
  validateOpts?: ValidateOpts;

  parse(record: string): void {
    const runes = [...record];
    if (runes.length !== 94) return;

    this.typeCode = runes.slice(1, 3).join('');
    this.paymentRelatedInformation = runes.slice(3, 83).join('').trimEnd();
    this.sequenceNumber = this.converters.parseNumField(runes.slice(83, 87).join(''));
    this.entryDetailSequenceNumber = this.converters.parseNumField(runes.slice(87, 94).join(''));
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
    const inclErr = this.fieldInclusion();
    if (inclErr) return inclErr;

    if (this.typeCode !== '17') return fieldError('TypeCode', ErrAddendaTypeCode, this.typeCode);

    if (!this.validateOpts?.allowSpecialCharacters) {
      const err = this.validators.isAlphanumeric(this.paymentRelatedInformation);
      if (err) return fieldError('PaymentRelatedInformation', err, this.paymentRelatedInformation);
    }
    return null;
  }

  private fieldInclusion(): Error | null {
    if (this.typeCode === '') return fieldError('TypeCode', ErrConstructor, this.typeCode);
    if (this.sequenceNumber === 0) return fieldError('SequenceNumber', ErrConstructor, this.sequenceNumberField());
    if (this.entryDetailSequenceNumber < 0) return fieldError('EntryDetailSequenceNumber', ErrConstructor, this.entryDetailSequenceNumberField());
    return null;
  }

  paymentRelatedInformationField(): string { return this.converters.alphaField(this.paymentRelatedInformation, 80); }
  sequenceNumberField(): string { return this.converters.numericField(this.sequenceNumber, 4); }
  entryDetailSequenceNumberField(): string { return this.converters.numericField(this.entryDetailSequenceNumber, 7); }
}

export function newAddenda17(): Addenda17 { return new Addenda17(); }
