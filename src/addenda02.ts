import { entryAddendaPos } from './constants.js';
import { enrichErrors, addenda02FieldPositions } from './fieldPositions.js';
import type { ValidateOpts } from './validateOpts.js';
import { Converters } from './utils/converters.js';
import { Validators } from './utils/validators.js';
import {
  fieldError,
  ErrConstructor,
  ErrFieldRequired,
  ErrAddendaTypeCode,
  ErrValidMonth,
  ErrValidDay,
} from './errors/index.js';

/**
 * Addenda02 provides business transaction information for POS, SHR, and MTE entries.
 */
export class Addenda02 {
  id = '';
  typeCode = '02';
  referenceInformationOne = '';
  referenceInformationTwo = '';
  terminalIdentificationCode = '';
  transactionSerialNumber = '';
  transactionDate = '';
  authorizationCodeOrExpireDate = '';
  terminalLocation = '';
  terminalCity = '';
  terminalState = '';
  traceNumber = '';
  lineNumber = 0;

  private converters = new Converters();
  private validators = new Validators();
  validateOpts?: ValidateOpts;

  parse(record: string): void {
    const runes = [...record];
    if (runes.length !== 94) return;

    // 1 Always "7"
    // 2-3 TypeCode "02"
    this.typeCode = runes.slice(1, 3).join('');
    // 4-10 ReferenceInformationOne
    this.referenceInformationOne = runes.slice(3, 10).join('').trim();
    // 11-13 ReferenceInformationTwo
    this.referenceInformationTwo = runes.slice(10, 13).join('').trim();
    // 14-19 TerminalIdentificationCode
    this.terminalIdentificationCode = runes.slice(13, 19).join('').trim();
    // 20-25 TransactionSerialNumber
    this.transactionSerialNumber = runes.slice(19, 25).join('').trim();
    // 26-29 TransactionDate
    this.transactionDate = runes.slice(25, 29).join('').trim();
    // 30-35 AuthorizationCodeOrExpireDate
    this.authorizationCodeOrExpireDate = runes.slice(29, 35).join('').trim();
    // 36-62 TerminalLocation
    this.terminalLocation = runes.slice(35, 62).join('').trim();
    // 63-77 TerminalCity
    this.terminalCity = runes.slice(62, 77).join('').trim();
    // 78-79 TerminalState
    this.terminalState = runes.slice(77, 79).join('').trim();
    // 80-94 TraceNumber
    this.traceNumber = runes.slice(79, 94).join('').trim();
  }

  setValidation(opts: ValidateOpts | undefined): void {
    this.validateOpts = opts;
  }

  string(): string {
    return (
      entryAddendaPos +
      this.typeCode +
      this.referenceInformationOneField() +
      this.referenceInformationTwoField() +
      this.terminalIdentificationCodeField() +
      this.transactionSerialNumberField() +
      this.transactionDateField() +
      this.authorizationCodeOrExpireDateField() +
      this.terminalLocationField() +
      this.terminalCityField() +
      this.terminalStateField() +
      this.traceNumberField()
    );
  }

  validate(): Error | null {
    const inclErr = this.fieldInclusion();
    if (inclErr) return inclErr;

    if (this.validators.isTypeCode(this.typeCode)) {
      return fieldError('TypeCode', ErrAddendaTypeCode, this.typeCode);
    }
    if (this.typeCode !== '02') {
      return fieldError('TypeCode', ErrAddendaTypeCode, this.typeCode);
    }

    if (!this.validateOpts?.allowSpecialCharacters) {
      for (const [name, val] of [
        ['ReferenceInformationOne', this.referenceInformationOne],
        ['ReferenceInformationTwo', this.referenceInformationTwo],
        ['TerminalIdentificationCode', this.terminalIdentificationCode],
        ['TransactionSerialNumber', this.transactionSerialNumber],
        ['AuthorizationCodeOrExpireDate', this.authorizationCodeOrExpireDate],
        ['TerminalLocation', this.terminalLocation],
        ['TerminalCity', this.terminalCity],
        ['TerminalState', this.terminalState],
      ] as const) {
        const err = this.validators.isAlphanumeric(val);
        if (err) return fieldError(name, err, val);
      }
    }

    // TransactionDate MMDD validation
    const dateField = this.transactionDateField();
    const mm = this.converters.parseStringField(dateField.substring(0, 2));
    const dd = this.converters.parseStringField(dateField.substring(2, 4));
    if (this.validators.isMonth(mm)) {
      return fieldError('TransactionDate', ErrValidMonth, mm);
    }
    if (this.validators.isDay(mm, dd)) {
      return fieldError('TransactionDate', ErrValidDay, mm);
    }

    return null;
  }

  /** ValidateAll performs all NACHA format rule checks and returns all errors found */
  validateAll(): Error[] {
    const errors: Error[] = [];
    const push = (err: Error | null | undefined) => { if (err) errors.push(err); };

    // Field inclusion checks (inlined to collect all)
    if (this.typeCode === '') push(fieldError('TypeCode', ErrConstructor, this.typeCode));
    if (this.transactionSerialNumber === '') push(fieldError('TransactionSerialNumber', ErrFieldRequired, this.transactionSerialNumber));
    if (this.transactionDate === '') push(fieldError('TransactionDate', ErrFieldRequired, this.transactionDate));
    if (this.terminalLocation === '') push(fieldError('TerminalLocation', ErrFieldRequired, this.terminalLocation));
    if (this.terminalCity === '') push(fieldError('TerminalCity', ErrFieldRequired, this.terminalCity));
    if (this.terminalState === '') push(fieldError('TerminalState', ErrFieldRequired, this.terminalState));

    if (this.validators.isTypeCode(this.typeCode)) push(fieldError('TypeCode', ErrAddendaTypeCode, this.typeCode));
    if (this.typeCode !== '02') push(fieldError('TypeCode', ErrAddendaTypeCode, this.typeCode));

    if (!this.validateOpts?.allowSpecialCharacters) {
      for (const [name, val] of [
        ['ReferenceInformationOne', this.referenceInformationOne],
        ['ReferenceInformationTwo', this.referenceInformationTwo],
        ['TerminalIdentificationCode', this.terminalIdentificationCode],
        ['TransactionSerialNumber', this.transactionSerialNumber],
        ['AuthorizationCodeOrExpireDate', this.authorizationCodeOrExpireDate],
        ['TerminalLocation', this.terminalLocation],
        ['TerminalCity', this.terminalCity],
        ['TerminalState', this.terminalState],
      ] as const) {
        push(fieldError(name, this.validators.isAlphanumeric(val), val));
      }
    }

    // TransactionDate MMDD validation
    const dateField = this.transactionDateField();
    const mm = this.converters.parseStringField(dateField.substring(0, 2));
    const dd = this.converters.parseStringField(dateField.substring(2, 4));
    if (this.validators.isMonth(mm)) push(fieldError('TransactionDate', ErrValidMonth, mm));
    if (this.validators.isDay(mm, dd)) push(fieldError('TransactionDate', ErrValidDay, mm));

    return enrichErrors(errors, this.lineNumber, addenda02FieldPositions);
  }

  private fieldInclusion(): Error | null {
    if (this.typeCode === '') return fieldError('TypeCode', ErrConstructor, this.typeCode);
    if (this.transactionSerialNumber === '') return fieldError('TransactionSerialNumber', ErrFieldRequired, this.transactionSerialNumber);
    if (this.transactionDate === '') return fieldError('TransactionDate', ErrFieldRequired, this.transactionDate);
    if (this.terminalLocation === '') return fieldError('TerminalLocation', ErrFieldRequired, this.terminalLocation);
    if (this.terminalCity === '') return fieldError('TerminalCity', ErrFieldRequired, this.terminalCity);
    if (this.terminalState === '') return fieldError('TerminalState', ErrFieldRequired, this.terminalState);
    return null;
  }

  referenceInformationOneField(): string { return this.converters.alphaField(this.referenceInformationOne, 7); }
  referenceInformationTwoField(): string { return this.converters.alphaField(this.referenceInformationTwo, 3); }
  terminalIdentificationCodeField(): string { return this.converters.alphaField(this.terminalIdentificationCode, 6); }
  transactionSerialNumberField(): string { return this.converters.alphaField(this.transactionSerialNumber, 6); }
  transactionDateField(): string { return this.converters.alphaField(this.transactionDate, 4); }
  authorizationCodeOrExpireDateField(): string { return this.converters.alphaField(this.authorizationCodeOrExpireDate, 6); }
  terminalLocationField(): string { return this.converters.alphaField(this.terminalLocation, 27); }
  terminalCityField(): string { return this.converters.alphaField(this.terminalCity, 15); }
  terminalStateField(): string { return this.converters.alphaField(this.terminalState, 2); }
  traceNumberField(): string { return this.converters.stringField(this.traceNumber, 15); }
}

export function newAddenda02(): Addenda02 {
  return new Addenda02();
}
