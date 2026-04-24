import { entryAddendaPos } from './constants.js';
import type { ValidateOpts } from './validateOpts.js';
import { Converters } from './utils/converters.js';
import { Validators } from './utils/validators.js';
import {
  fieldError,
  ErrConstructor,
  ErrAddendaTypeCode,
  ErrExceedsFieldLength,
} from './errors/index.js';

/**
 * Addenda05 provides business transaction information in a machine readable format.
 * Used for SEC codes: ACK, ATX, CCD, CIE, CTX, DNE, ENR, WEB, PPD, TRX.
 */
export class Addenda05 {
  id = '';
  typeCode = '05';
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

    // 1-1 Always "7"
    // 2-3 TypeCode "05"
    this.typeCode = runes.slice(1, 3).join('');
    // 4-83 PaymentRelatedInformation
    this.paymentRelatedInformation = runes.slice(3, 83).join('').trimEnd();
    // 84-87 SequenceNumber
    this.sequenceNumber = this.converters.parseNumField(runes.slice(83, 87).join(''));
    // 88-94 EntryDetailSequenceNumber
    this.entryDetailSequenceNumber = this.converters.parseNumField(runes.slice(87, 94).join(''));
  }

  setValidation(opts: ValidateOpts | undefined): void {
    this.validateOpts = opts;
  }

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

    if (this.validators.isTypeCode(this.typeCode)) {
      return fieldError('TypeCode', ErrAddendaTypeCode, this.typeCode);
    }
    if (this.typeCode !== '05') {
      return fieldError('TypeCode', ErrAddendaTypeCode, this.typeCode);
    }
    if (!this.validateOpts?.allowSpecialCharacters) {
      const err = this.validators.isAlphanumeric(this.paymentRelatedInformation);
      if (err) return fieldError('PaymentRelatedInformation', err, this.paymentRelatedInformation);
    }
    if ([...this.paymentRelatedInformation].length > 80) {
      return fieldError('PaymentRelatedInformation', ErrExceedsFieldLength, this.paymentRelatedInformation);
    }
    return null;
  }

  private fieldInclusion(): Error | null {
    if (this.typeCode === '') {
      return fieldError('TypeCode', ErrConstructor, this.typeCode);
    }
    if (this.sequenceNumber === 0) {
      return fieldError('SequenceNumber', ErrConstructor, this.sequenceNumberField());
    }
    if (this.entryDetailSequenceNumber < 0) {
      return fieldError('EntryDetailSequenceNumber', ErrConstructor, this.entryDetailSequenceNumberField());
    }
    return null;
  }

  paymentRelatedInformationField(): string { return this.converters.alphaField(this.paymentRelatedInformation, 80); }
  sequenceNumberField(): string { return this.converters.numericField(this.sequenceNumber, 4); }
  entryDetailSequenceNumberField(): string { return this.converters.numericField(this.entryDetailSequenceNumber, 7); }
}

export function newAddenda05(): Addenda05 {
  return new Addenda05();
}
