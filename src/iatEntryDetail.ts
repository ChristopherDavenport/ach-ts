import { entryDetailPos, CategoryForward } from './constants.js';
import { enrichErrors, iatEntryDetailFieldPositions } from './fieldPositions.js';
import type { ValidateOpts } from './validateOpts.js';
import { Converters } from './utils/converters.js';
import { Validators } from './utils/validators.js';
import { CalculateCheckDigit } from './utils/validators.js';
import {
  fieldError,
  ErrConstructor,
  ErrValidCheckDigit,
} from './errors/index.js';
import type { Addenda10 } from './addenda10.js';
import type { Addenda11 } from './addenda11.js';
import type { Addenda12 } from './addenda12.js';
import type { Addenda13 } from './addenda13.js';
import type { Addenda14 } from './addenda14.js';
import type { Addenda15 } from './addenda15.js';
import type { Addenda16 } from './addenda16.js';
import type { Addenda17 } from './addenda17.js';
import type { Addenda18 } from './addenda18.js';
import type { Addenda98 } from './addenda98.js';
import type { Addenda99 } from './addenda99.js';

/**
 * IATEntryDetail contains the actual transaction data for an individual IAT entry.
 */
export class IATEntryDetail {
  id = '';
  transactionCode = 0;
  rdfiIdentification = '';
  checkDigit = '';
  addendaRecords = 0;
  amount = 0;
  dfiAccountNumber = '';
  ofacScreeningIndicator = '';
  secondaryOFACScreeningIndicator = '';
  addendaRecordIndicator = 1;
  traceNumber = '';

  addenda10: Addenda10 | null = null;
  addenda11: Addenda11 | null = null;
  addenda12: Addenda12 | null = null;
  addenda13: Addenda13 | null = null;
  addenda14: Addenda14 | null = null;
  addenda15: Addenda15 | null = null;
  addenda16: Addenda16 | null = null;
  addenda17: Addenda17[] = [];
  addenda18: Addenda18[] = [];
  addenda98: Addenda98 | null = null;
  addenda99: Addenda99 | null = null;

  category = CategoryForward;
  lineNumber = 0;

  protected converters = new Converters();
  protected validators = new Validators();
  validateOpts?: ValidateOpts;

  parse(record: string): void {
    if (record.length !== 94) return;
    this.transactionCode = this.converters.parseNumField(record.substring(1, 3));
    this.rdfiIdentification = this.converters.parseStringField(record.substring(3, 11));
    this.checkDigit = this.converters.parseStringField(record.substring(11, 12));
    this.addendaRecords = this.converters.parseNumField(record.substring(12, 16));
    // 17-29 reserved
    this.amount = this.converters.parseNumField(record.substring(29, 39));
    this.dfiAccountNumber = record.substring(39, 74).trimEnd();
    // 75-76 reserved
    // 77 OFAC
    this.ofacScreeningIndicator = ' ';
    // 78 SecondaryOFAC
    this.secondaryOFACScreeningIndicator = ' ';
    this.addendaRecordIndicator = this.converters.parseNumField(record.substring(78, 79));
    this.traceNumber = record.substring(79, 94).trim();
  }

  string(): string {
    let out = entryDetailPos;
    out += String(this.transactionCode);
    out += this.rdfiIdentificationField();
    out += this.checkDigit;
    out += this.addendaRecordsField();
    out += '             '; // 13 spaces reserved
    out += this.amountField();
    out += this.dfiAccountNumberField();
    out += '  '; // 2 spaces reserved
    out += this.ofacScreeningIndicatorField();
    out += this.secondaryOFACScreeningIndicatorField();
    out += String(this.addendaRecordIndicator);
    out += this.traceNumberField();
    return out;
  }

  setValidation(opts: ValidateOpts): void {
    this.validateOpts = opts;
  }

  validate(): Error | null {
    const fiErr = this.fieldInclusion();
    if (fiErr) return fiErr;

    if (this.validateOpts?.checkTransactionCode) {
      const err = this.validateOpts.checkTransactionCode(this.transactionCode);
      if (err) return fieldError('TransactionCode', err, String(this.transactionCode));
    } else {
      const err = this.validators.isTransactionCode(this.transactionCode);
      if (err) return fieldError('TransactionCode', err, String(this.transactionCode));
    }
    if (!this.validateOpts?.allowSpecialCharacters) {
      const err = this.validators.isAlphanumeric(this.dfiAccountNumber);
      if (err) return fieldError('DFIAccountNumber', err, this.dfiAccountNumber);
    }
    const calculated = CalculateCheckDigit(this.rdfiIdentificationField());
    const edCheckDigit = parseInt(this.checkDigit, 10);
    if (isNaN(edCheckDigit) || calculated !== edCheckDigit) {
      return fieldError('RDFIIdentification', new ErrValidCheckDigit(calculated), this.checkDigit);
    }
    return null;
  }

  /** ValidateAll performs all NACHA format rule checks and returns all errors found */
  validateAll(): Error[] {
    const errors: Error[] = [];
    const push = (err: Error | null | undefined) => { if (err) errors.push(err); };

    // Field inclusion checks (inlined to collect all)
    if (this.transactionCode === 0) push(fieldError('TransactionCode', ErrConstructor, String(this.transactionCode)));
    if (this.rdfiIdentification === '') push(fieldError('RDFIIdentification', ErrConstructor, this.rdfiIdentificationField()));
    if (this.addendaRecords === 0) push(fieldError('AddendaRecords', ErrConstructor, String(this.addendaRecords)));
    if (this.dfiAccountNumber === '') push(fieldError('DFIAccountNumber', ErrConstructor, this.dfiAccountNumber));
    if (this.addendaRecordIndicator === 0) push(fieldError('AddendaRecordIndicator', ErrConstructor, String(this.addendaRecordIndicator)));
    if (this.traceNumber === '') push(fieldError('TraceNumber', ErrConstructor, this.traceNumberField()));

    if (this.validateOpts?.checkTransactionCode) {
      push(fieldError('TransactionCode', this.validateOpts.checkTransactionCode(this.transactionCode), String(this.transactionCode)));
    } else {
      push(fieldError('TransactionCode', this.validators.isTransactionCode(this.transactionCode), String(this.transactionCode)));
    }
    if (!this.validateOpts?.allowSpecialCharacters) {
      push(fieldError('DFIAccountNumber', this.validators.isAlphanumeric(this.dfiAccountNumber), this.dfiAccountNumber));
    }
    const calculated = CalculateCheckDigit(this.rdfiIdentificationField());
    const edCheckDigit = parseInt(this.checkDigit, 10);
    if (isNaN(edCheckDigit) || calculated !== edCheckDigit) {
      push(fieldError('RDFIIdentification', new ErrValidCheckDigit(calculated), this.checkDigit));
    }

    return enrichErrors(errors, this.lineNumber, iatEntryDetailFieldPositions);
  }

  private fieldInclusion(): Error | null {
    if (this.transactionCode === 0) return fieldError('TransactionCode', ErrConstructor, String(this.transactionCode));
    if (this.rdfiIdentification === '') return fieldError('RDFIIdentification', ErrConstructor, this.rdfiIdentificationField());
    if (this.addendaRecords === 0) return fieldError('AddendaRecords', ErrConstructor, String(this.addendaRecords));
    if (this.dfiAccountNumber === '') return fieldError('DFIAccountNumber', ErrConstructor, this.dfiAccountNumber);
    if (this.addendaRecordIndicator === 0) return fieldError('AddendaRecordIndicator', ErrConstructor, String(this.addendaRecordIndicator));
    if (this.traceNumber === '') return fieldError('TraceNumber', ErrConstructor, this.traceNumberField());
    return null;
  }

  isCorrection(): boolean {
    return this.addenda98 !== null;
  }

  setRDFI(rdfi: string): IATEntryDetail {
    const s = this.converters.stringField(rdfi, 9);
    this.rdfiIdentification = this.converters.parseStringField(s.substring(0, 8));
    this.checkDigit = this.converters.parseStringField(s.substring(8, 9));
    return this;
  }

  setTraceNumber(odfiIdentification: string, seq: number): void {
    this.traceNumber = this.converters.stringField(odfiIdentification, 8) + this.converters.numericField(seq, 7);
  }

  addendaCount(): number {
    let n = 0;
    if (this.addenda10) n++;
    if (this.addenda11) n++;
    if (this.addenda12) n++;
    if (this.addenda13) n++;
    if (this.addenda14) n++;
    if (this.addenda15) n++;
    if (this.addenda16) n++;
    n += this.addenda17.length;
    n += this.addenda18.length;
    if (this.addenda98) n++;
    if (this.addenda99) n++;
    return n;
  }

  // Field formatting
  rdfiIdentificationField(): string { return this.converters.stringField(this.rdfiIdentification, 8); }
  addendaRecordsField(): string { return this.converters.numericField(this.addendaRecords, 4); }
  amountField(): string { return this.converters.numericField(this.amount, 10); }
  dfiAccountNumberField(): string { return this.converters.alphaField(this.dfiAccountNumber, 35); }
  ofacScreeningIndicatorField(): string { return this.converters.alphaField(this.ofacScreeningIndicator, 1); }
  secondaryOFACScreeningIndicatorField(): string { return this.converters.alphaField(this.secondaryOFACScreeningIndicator, 1); }
  traceNumberField(): string { return this.converters.stringField(this.traceNumber, 15); }
}
