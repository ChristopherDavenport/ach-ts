import { entryAddendaPos } from './constants.js';
import { enrichErrors, addenda10FieldPositions } from './fieldPositions.js';
import type { ValidateOpts } from './validateOpts.js';
import { Converters } from './utils/converters.js';
import { Validators } from './utils/validators.js';
import {
  fieldError,
  ErrConstructor,
  ErrAddendaTypeCode,
} from './errors/index.js';

/**
 * Addenda10 is an IAT addenda record providing transaction type and foreign payment information.
 */
export class Addenda10 {
  id = '';
  typeCode = '10';
  transactionTypeCode = '';
  foreignPaymentAmount = 0;
  foreignTraceNumber = '';
  name = '';
  entryDetailSequenceNumber = 0;
  lineNumber = 0;

  private converters = new Converters();
  private validators = new Validators();
  validateOpts?: ValidateOpts;

  parse(record: string): void {
    const runes = [...record];
    if (runes.length !== 94) return;

    this.typeCode = runes.slice(1, 3).join('');
    this.transactionTypeCode = runes.slice(3, 6).join('').trim();
    this.foreignPaymentAmount = this.converters.parseNumField(runes.slice(6, 24).join(''));
    this.foreignTraceNumber = runes.slice(24, 46).join('').trim();
    this.name = runes.slice(46, 81).join('').trim();
    // 82-87 Reserved
    this.entryDetailSequenceNumber = this.converters.parseNumField(runes.slice(87, 94).join(''));
  }

  setValidation(opts: ValidateOpts | undefined): void { this.validateOpts = opts; }

  string(): string {
    return (
      entryAddendaPos +
      this.typeCode +
      this.transactionTypeCodeField() +
      this.foreignPaymentAmountField() +
      this.foreignTraceNumberField() +
      this.nameField() +
      '      ' +
      this.entryDetailSequenceNumberField()
    );
  }

  validate(): Error | null {
    const inclErr = this.fieldInclusion();
    if (inclErr) return inclErr;

    if (this.typeCode !== '10') return fieldError('TypeCode', ErrAddendaTypeCode, this.typeCode);

    if (this.validators.isTransactionTypeCode(this.transactionTypeCode)) {
      return fieldError('TransactionTypeCode', new Error('invalid transaction type code'), this.transactionTypeCode);
    }

    if (!this.validateOpts?.allowSpecialCharacters) {
      const ftnErr = this.validators.isAlphanumeric(this.foreignTraceNumber);
      if (ftnErr) return fieldError('ForeignTraceNumber', ftnErr, this.foreignTraceNumber);
      const nameErr = this.validators.isAlphanumeric(this.name);
      if (nameErr) return fieldError('Name', nameErr, this.name);
    }
    return null;
  }

  /** ValidateAll performs all NACHA format rule checks and returns all errors found */
  validateAll(): Error[] {
    const errors: Error[] = [];
    const push = (err: Error | null | undefined) => { if (err) errors.push(err); };

    // Field inclusion checks (inlined to collect all)
    if (this.typeCode === '') push(fieldError('TypeCode', ErrConstructor, this.typeCode));
    if (this.transactionTypeCode === '') push(fieldError('TransactionTypeCode', ErrConstructor, this.transactionTypeCode));
    if (this.name === '') push(fieldError('Name', ErrConstructor, this.name));
    if (this.entryDetailSequenceNumber < 0) push(fieldError('EntryDetailSequenceNumber', ErrConstructor, this.entryDetailSequenceNumberField()));

    if (this.typeCode !== '10') push(fieldError('TypeCode', ErrAddendaTypeCode, this.typeCode));
    if (this.validators.isTransactionTypeCode(this.transactionTypeCode)) {
      push(fieldError('TransactionTypeCode', new Error('invalid transaction type code'), this.transactionTypeCode));
    }
    if (!this.validateOpts?.allowSpecialCharacters) {
      push(fieldError('ForeignTraceNumber', this.validators.isAlphanumeric(this.foreignTraceNumber), this.foreignTraceNumber));
      push(fieldError('Name', this.validators.isAlphanumeric(this.name), this.name));
    }

    return enrichErrors(errors, this.lineNumber, addenda10FieldPositions);
  }

  private fieldInclusion(): Error | null {
    if (this.typeCode === '') return fieldError('TypeCode', ErrConstructor, this.typeCode);
    if (this.transactionTypeCode === '') return fieldError('TransactionTypeCode', ErrConstructor, this.transactionTypeCode);
    if (this.name === '') return fieldError('Name', ErrConstructor, this.name);
    if (this.entryDetailSequenceNumber < 0) return fieldError('EntryDetailSequenceNumber', ErrConstructor, this.entryDetailSequenceNumberField());
    return null;
  }

  transactionTypeCodeField(): string { return this.converters.alphaField(this.transactionTypeCode, 3); }
  foreignPaymentAmountField(): string { return this.converters.numericField(this.foreignPaymentAmount, 18); }
  foreignTraceNumberField(): string { return this.converters.alphaField(this.foreignTraceNumber, 22); }
  nameField(): string { return this.converters.alphaField(this.name, 35); }
  entryDetailSequenceNumberField(): string { return this.converters.numericField(this.entryDetailSequenceNumber, 7); }
}

export function newAddenda10(): Addenda10 { return new Addenda10(); }
