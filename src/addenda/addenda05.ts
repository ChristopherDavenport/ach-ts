import { entryAddendaPos } from '../constants.js';
import { enrichErrors, enrichError, addenda05FieldPositions } from '../fieldPositions.js';
import type { ValidateOpts } from '../validateOpts.js';
import { isSkipped, applyErrorLevel, applyErrorLevels } from '../validateOpts.js';
import { Converters, converters } from '../utils/converters.js';
import { Validators, validators } from '../utils/validators.js';
import {
  fieldError,
  ErrConstructor,
  ErrAddendaTypeCode,
  ErrExceedsFieldLength,
} from '../errors/index.js';

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
    this.sequenceNumber = converters.parseNumField(runes.slice(83, 87).join(''));
    // 88-94 EntryDetailSequenceNumber
    this.entryDetailSequenceNumber = converters.parseNumField(runes.slice(87, 94).join(''));
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
    let err = this._validate();
    if (err) enrichError(err, this.lineNumber, addenda05FieldPositions);
    err = applyErrorLevel(err, this.validateOpts);
    return err;
  }

  private _validate(): Error | null {
    const inclErr = this.fieldInclusion();
    if (inclErr) return inclErr;

    if (validators.isTypeCode(this.typeCode)) {
      return fieldError('TypeCode', ErrAddendaTypeCode, this.typeCode);
    }
    if (this.typeCode !== '05') {
      return fieldError('TypeCode', ErrAddendaTypeCode, this.typeCode);
    }
    if (!isSkipped(this.validateOpts, 'allowSpecialCharacters')) {
      const err = validators.isAlphanumeric(this.paymentRelatedInformation);
      if (err) return fieldError('PaymentRelatedInformation', err, this.paymentRelatedInformation);
    }
    if ([...this.paymentRelatedInformation].length > 80) {
      return fieldError('PaymentRelatedInformation', ErrExceedsFieldLength, this.paymentRelatedInformation);
    }
    return null;
  }

  /** ValidateAll performs all NACHA format rule checks and returns all errors found */
  validateAll(): Error[] {
    const errors: Error[] = [];
    const push = (err: Error | null | undefined) => { if (err) errors.push(err); };

    // Field inclusion checks (inlined to collect all)
    if (this.typeCode === '') push(fieldError('TypeCode', ErrConstructor, this.typeCode));
    if (this.sequenceNumber === 0) push(fieldError('SequenceNumber', ErrConstructor, this.sequenceNumberField()));
    if (this.entryDetailSequenceNumber < 0) push(fieldError('EntryDetailSequenceNumber', ErrConstructor, this.entryDetailSequenceNumberField()));

    if (validators.isTypeCode(this.typeCode)) push(fieldError('TypeCode', ErrAddendaTypeCode, this.typeCode));
    if (this.typeCode !== '05') push(fieldError('TypeCode', ErrAddendaTypeCode, this.typeCode));
    if (!isSkipped(this.validateOpts, 'allowSpecialCharacters')) {
      push(fieldError('PaymentRelatedInformation', validators.isAlphanumeric(this.paymentRelatedInformation), this.paymentRelatedInformation));
    }
    if ([...this.paymentRelatedInformation].length > 80) {
      push(fieldError('PaymentRelatedInformation', ErrExceedsFieldLength, this.paymentRelatedInformation));
    }

    return applyErrorLevels(
      enrichErrors(errors, this.lineNumber, addenda05FieldPositions),
      this.validateOpts,
    );
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

  paymentRelatedInformationField(): string { return converters.alphaField(this.paymentRelatedInformation, 80); }
  sequenceNumberField(): string { return converters.numericField(this.sequenceNumber, 4); }
  entryDetailSequenceNumberField(): string { return converters.numericField(this.entryDetailSequenceNumber, 7); }
}

export function newAddenda05(): Addenda05 {
  return new Addenda05();
}
