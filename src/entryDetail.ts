import {
  entryDetailPos,
  CategoryForward,
  CIE, MTE,
} from './constants.js';
import { enrichErrors, enrichError, entryDetailFieldPositions } from './fieldPositions.js';
import type { ValidateOpts } from './validateOpts.js';
import { isSkipped, applyErrorLevel, applyErrorLevels } from './validateOpts.js';
import { Converters, converters } from './utils/converters.js';
import { Validators, validators, CalculateCheckDigit, readRunes } from './utils/validators.js';
import {
  fieldError,
  ErrConstructor,
  ErrNegativeAmount,
  ErrValidCheckDigit,
} from './errors/index.js';

// Forward-declare addenda types to avoid circular deps.
// These will be defined in addenda/ modules.
export interface Addenda02Like { typeCode: string; traceNumber: string; terminalState: string; lineNumber: number; validate(): Error | null; string(): string; }
export interface Addenda05Like { typeCode: string; sequenceNumber: number; entryDetailSequenceNumber: number; lineNumber: number; validate(): Error | null; string(): string; }
export interface Addenda98Like { typeCode: string; traceNumber: string; lineNumber: number; validate(): Error | null; string(): string; }
export interface Addenda98RefusedLike { typeCode: string; traceNumber: string; lineNumber: number; validate(): Error | null; string(): string; }
export interface Addenda99Like { typeCode: string; traceNumber: string; lineNumber: number; validate(): Error | null; string(): string; }
export interface Addenda99ContestedLike { typeCode: string; traceNumber: string; lineNumber: number; validate(): Error | null; string(): string; }
export interface Addenda99DishonoredLike { typeCode: string; traceNumber: string; lineNumber: number; validate(): Error | null; string(): string; }

const NachaEntryAmountLimit = 99_999_999_99;

/**
 * EntryDetail contains the actual transaction data for an individual entry.
 */
export class EntryDetail {
  id = '';
  /** TransactionCode indicates if receiver account is checking, savings, GL or loan */
  transactionCode = 0;
  /** RDFIIdentification is the RDFI's routing number without the last digit */
  rdfiIdentification = '';
  /** CheckDigit the last digit of the RDFI's routing number */
  checkDigit = '';
  /** DFIAccountNumber is the receiver's bank account number */
  dfiAccountNumber = '';
  /** Amount in cents */
  amount = 0;
  /** IdentificationNumber for internal identification */
  identificationNumber = '';
  /** IndividualName the name of the receiver */
  individualName = '';
  /** DiscretionaryData for ODFI codes (also PaymentType for WEB/TEL) */
  discretionaryData = '';
  /** AddendaRecordIndicator 1=addenda exists, 0=no addenda */
  addendaRecordIndicator = 0;
  /** TraceNumber assigned by the ODFI */
  traceNumber = '';

  // Addenda records
  addenda02: Addenda02Like | null = null;
  addenda05: Addenda05Like[] = [];
  addenda98: Addenda98Like | null = null;
  addenda98Refused: Addenda98RefusedLike | null = null;
  addenda99: Addenda99Like | null = null;
  addenda99Contested: Addenda99ContestedLike | null = null;
  addenda99Dishonored: Addenda99DishonoredLike | null = null;

  /** Category defines if the entry is Forward, Return, or NOC */
  category = CategoryForward;
  /** Line number at which the record appears */
  lineNumber = 0;
  validateOpts?: ValidateOpts;
  /** SEC code set from batch context */
  secCode = '';

  /** Set the SEC code */
  setSECCode(code: string): void {
    this.secCode = code;
  }

  /** Parse takes the input record string and parses the EntryDetail values */
  parse(record: string): void {
    const runes = [...record];
    if (runes.length !== 94) return;

    // 1-1 Always "6"
    // 2-3 TransactionCode
    this.transactionCode = converters.parseNumField(runes.slice(1, 3).join(''));
    // 4-11 RDFIIdentification
    this.rdfiIdentification = runes.slice(3, 11).join('');
    // 12 CheckDigit
    this.checkDigit = runes.slice(11, 12).join('');
    // 13-29 DFIAccountNumber
    this.dfiAccountNumber = converters.parseStringFieldWithOpts(runes.slice(12, 29).join(''), this.validateOpts);
    // 30-39 Amount
    this.amount = converters.parseNumField(runes.slice(29, 39).join(''));

    // 40-54 and 55-76: field layout depends on SEC code (CIE/MTE swap order)
    const isCIEorMTE = this.secCode.toUpperCase() === CIE || this.secCode.toUpperCase() === MTE;
    if (isCIEorMTE) {
      // 40-54 IndividualName, 55-76 IdentificationNumber
      this.individualName = runes.slice(39, 54).join('');
      this.identificationNumber = runes.slice(54, 76).join('');
    } else {
      // 40-54 IdentificationNumber, 55-76 IndividualName
      this.identificationNumber = runes.slice(39, 54).join('');
      this.individualName = runes.slice(54, 76).join('');
    }

    // 77-78 DiscretionaryData
    this.discretionaryData = runes.slice(76, 78).join('');
    // 79 AddendaRecordIndicator
    this.addendaRecordIndicator = converters.parseNumField(runes.slice(78, 79).join(''));
    // 80-94 TraceNumber
    this.traceNumber = runes.slice(79, 94).join('');
  }

  /** String writes the EntryDetail struct to a 94 character string */
  string(): string {
    const isCIEorMTE = this.secCode.toUpperCase() === CIE || this.secCode.toUpperCase() === MTE;

    let fields: string;
    if (isCIEorMTE) {
      fields = this.individualNameField() + this.identificationNumberField();
    } else {
      fields = this.identificationNumberField() + this.individualNameField();
    }

    return (
      entryDetailPos +
      String(this.transactionCode) +
      this.rdfiIdentificationField() +
      this.checkDigit +
      this.dfiAccountNumberField() +
      this.amountField() +
      fields +
      this.discretionaryDataField() +
      String(this.addendaRecordIndicator) +
      this.traceNumberField()
    );
  }

  setValidation(opts: ValidateOpts | undefined): void {
    this.validateOpts = opts;
  }

  /** Validate performs NACHA format rule checks */
  validate(): Error | null {
    let err = this._validate();
    if (err) enrichError(err, this.lineNumber, entryDetailFieldPositions);
    err = applyErrorLevel(err, this.validateOpts);
    return err;
  }

  private _validate(): Error | null {
    const inclErr = this.fieldInclusion();
    if (inclErr) return inclErr;

    // Transaction code validation
    if (this.validateOpts?.checkTransactionCode) {
      const err = this.validateOpts.checkTransactionCode(this.transactionCode);
      if (err) return fieldError('TransactionCode', err, String(this.transactionCode));
    } else {
      const err = validators.isTransactionCode(this.transactionCode);
      if (err) return fieldError('TransactionCode', err, String(this.transactionCode));
    }

    if (this.amount < 0) {
      return fieldError('Amount', ErrNegativeAmount, this.amount);
    }
    if (this.amount > NachaEntryAmountLimit) {
      return fieldError('Amount', new Error(`does not match formatted value ${this.amountField()}`), this.amount);
    }

    if (!isSkipped(this.validateOpts, 'allowSpecialCharacters')) {
      const acctErr = validators.isAlphanumeric(this.dfiAccountNumber);
      if (acctErr) return fieldError('DFIAccountNumber', acctErr, this.dfiAccountNumber);

      const idErr = validators.isAlphanumeric(this.identificationNumber);
      if (idErr) return fieldError('IdentificationNumber', idErr, this.identificationNumber);

      const nameErr = validators.isAlphanumeric(this.individualName);
      if (nameErr) return fieldError('IndividualName', nameErr, this.individualName);

      const discErr = validators.isAlphanumeric(this.discretionaryData);
      if (discErr) return fieldError('DiscretionaryData', discErr, this.discretionaryData);
    }

    if (!isSkipped(this.validateOpts, 'allowInvalidCheckDigit')) {
      const calculated = CalculateCheckDigit(this.rdfiIdentificationField());
      const edCheckDigit = parseInt(this.checkDigit, 10);
      if (isNaN(edCheckDigit)) {
        return fieldError('CheckDigit', new Error('invalid check digit'), this.checkDigit);
      }
      if (calculated !== edCheckDigit) {
        return fieldError('RDFIIdentification', new ErrValidCheckDigit(calculated), this.checkDigit);
      }
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
    if (this.dfiAccountNumber === '') push(fieldError('DFIAccountNumber', ErrConstructor, this.dfiAccountNumber));
    if (this.individualName === '') push(fieldError('IndividualName', ErrConstructor, this.individualName));
    if (this.traceNumber === '') push(fieldError('TraceNumber', ErrConstructor, this.traceNumberField()));

    // Transaction code validation
    if (this.validateOpts?.checkTransactionCode) {
      push(fieldError('TransactionCode', this.validateOpts.checkTransactionCode(this.transactionCode), String(this.transactionCode)));
    } else {
      push(fieldError('TransactionCode', validators.isTransactionCode(this.transactionCode), String(this.transactionCode)));
    }

    if (this.amount < 0) push(fieldError('Amount', ErrNegativeAmount, this.amount));
    if (this.amount > NachaEntryAmountLimit) {
      push(fieldError('Amount', new Error(`does not match formatted value ${this.amountField()}`), this.amount));
    }

    if (!isSkipped(this.validateOpts, 'allowSpecialCharacters')) {
      push(fieldError('DFIAccountNumber', validators.isAlphanumeric(this.dfiAccountNumber), this.dfiAccountNumber));
      push(fieldError('IdentificationNumber', validators.isAlphanumeric(this.identificationNumber), this.identificationNumber));
      push(fieldError('IndividualName', validators.isAlphanumeric(this.individualName), this.individualName));
      push(fieldError('DiscretionaryData', validators.isAlphanumeric(this.discretionaryData), this.discretionaryData));
    }

    if (!isSkipped(this.validateOpts, 'allowInvalidCheckDigit')) {
      const calculated = CalculateCheckDigit(this.rdfiIdentificationField());
      const edCheckDigit = parseInt(this.checkDigit, 10);
      if (isNaN(edCheckDigit)) {
        push(fieldError('CheckDigit', new Error('invalid check digit'), this.checkDigit));
      } else if (calculated !== edCheckDigit) {
        push(fieldError('RDFIIdentification', new ErrValidCheckDigit(calculated), this.checkDigit));
      }
    }

    return applyErrorLevels(
      enrichErrors(errors, this.lineNumber, entryDetailFieldPositions),
      this.validateOpts,
    );
  }

  private fieldInclusion(): Error | null {
    if (this.transactionCode === 0) {
      return fieldError('TransactionCode', ErrConstructor, String(this.transactionCode));
    }
    if (this.rdfiIdentification === '') {
      return fieldError('RDFIIdentification', ErrConstructor, this.rdfiIdentificationField());
    }
    if (this.dfiAccountNumber === '') {
      return fieldError('DFIAccountNumber', ErrConstructor, this.dfiAccountNumber);
    }
    if (this.individualName === '') {
      return fieldError('IndividualName', ErrConstructor, this.individualName);
    }
    if (this.traceNumber === '') {
      return fieldError('TraceNumber', ErrConstructor, this.traceNumberField());
    }
    return null;
  }

  /** SetRDFI takes a 9-digit routing number and separates RDFIIdentification and CheckDigit */
  setRDFI(rdfi: string): EntryDetail {
    const s = converters.stringField(rdfi, 9);
    this.rdfiIdentification = converters.parseStringField(s.substring(0, 8));
    this.checkDigit = converters.parseStringField(s.substring(8, 9));
    return this;
  }

  /** SetTraceNumber takes first 8 digits of ODFI and concatenates a sequence number */
  setTraceNumber(odfiIdentification: string, seq: number): void {
    const traceNumber = converters.stringField(odfiIdentification, 8) +
      converters.numericField(seq, 7);
    this.traceNumber = traceNumber;

    // Propagate to addenda records
    if (this.addenda02) this.addenda02.traceNumber = traceNumber;
    if (this.addenda98) this.addenda98.traceNumber = traceNumber;
    if (this.addenda98Refused) this.addenda98Refused.traceNumber = traceNumber;
    if (this.addenda99) this.addenda99.traceNumber = traceNumber;
    if (this.addenda99Contested) this.addenda99Contested.traceNumber = traceNumber;
    if (this.addenda99Dishonored) this.addenda99Dishonored.traceNumber = traceNumber;
  }

  // --- Field formatters ---

  rdfiIdentificationField(): string { return converters.stringField(this.rdfiIdentification, 8); }
  dfiAccountNumberField(): string { return converters.alphaField(this.dfiAccountNumber, 17); }
  amountField(): string { return converters.numericField(this.amount, 10); }

  identificationNumberField(): string {
    const isCIEorMTE = this.secCode.toUpperCase() === CIE || this.secCode.toUpperCase() === MTE;
    const length = isCIEorMTE ? 22 : 15;
    return converters.alphaField(this.identificationNumber, length);
  }

  individualNameField(): string {
    const isCIEorMTE = this.secCode.toUpperCase() === CIE || this.secCode.toUpperCase() === MTE;
    const length = isCIEorMTE ? 15 : 22;
    return converters.alphaField(this.individualName, length);
  }

  checkSerialNumberField(): string { return converters.alphaField(this.identificationNumber, 15); }
  setCheckSerialNumber(s: string): void { this.identificationNumber = s; }

  // POP helpers
  setPOPCheckSerialNumber(s: string): void { this.identificationNumber = converters.alphaField(s, 9); }
  setPOPTerminalCity(s: string): void { this.identificationNumber += converters.alphaField(s, 4); }
  setPOPTerminalState(s: string): void { this.identificationNumber += converters.alphaField(s, 2); }
  popCheckSerialNumberField(): string { return converters.parseStringField(readRunes(0, 9, this.identificationNumber)); }
  popTerminalCityField(): string { return converters.parseStringField(readRunes(9, 4, this.identificationNumber)); }
  popTerminalStateField(): string { return converters.parseStringField(readRunes(13, 2, this.identificationNumber)); }

  // SHR helpers
  setSHRCardExpirationDate(s: string): void { this.identificationNumber = converters.alphaField(s, 4); }
  setSHRDocumentReferenceNumber(s: string): void { this.identificationNumber += converters.stringField(s, 11); }
  setSHRIndividualCardAccountNumber(s: string): void { this.individualName = converters.stringField(s, 22); }
  shrCardExpirationDateField(): string { return converters.alphaField(converters.parseStringField(readRunes(0, 4, this.identificationNumber)), 4); }
  shrDocumentReferenceNumberField(): string { return converters.stringField(readRunes(4, 11, this.identificationNumber), 11); }
  shrIndividualCardAccountNumberField(): string { return converters.stringField(this.individualName, 22); }

  // CCD helpers
  receivingCompanyField(): string { return this.individualNameField(); }
  setReceivingCompany(s: string): void { this.individualName = s; }

  // ACK/ATX helpers
  originalTraceNumberField(): string { return this.identificationNumberField(); }
  setOriginalTraceNumber(s: string): void { this.identificationNumber = s; }

  // CTX/ATX helpers
  setCATXAddendaRecords(i: number): void {
    this.addendaRecordIndicator = i;
    const count = converters.numericField(i, 4);
    const current = this.individualName;
    if ([...current].length > 4) {
      this.individualName = count + current.substring(4);
    } else {
      this.individualName = count + converters.alphaField(' ', 16) + '  ';
    }
  }

  setCATXReceivingCompany(s: string): void {
    const current = this.individualName;
    if ([...current].length > 4) {
      this.individualName = current.substring(0, 4) + converters.alphaField(s, 16) + '  ';
    } else {
      this.individualName = '0000' + converters.alphaField(s, 16) + '  ';
    }
  }

  catxAddendaRecordsField(): string {
    if ([...this.individualName].length < 5) return this.individualName;
    return converters.parseStringField(readRunes(0, 4, this.individualName));
  }

  catxReceivingCompanyField(): string {
    if ([...this.individualName].length < 4) return '';
    return readRunes(4, 18, this.individualName);
  }

  catxReservedField(): string {
    return readRunes(20, 22, this.individualName);
  }

  discretionaryDataField(): string { return converters.alphaField(this.discretionaryData, 2); }

  // WEB/TEL PaymentType helpers
  paymentTypeField(): string {
    this.setPaymentType(this.discretionaryData);
    return this.discretionaryData;
  }

  setPaymentType(t: string): void {
    t = t.trim().toUpperCase();
    this.discretionaryData = t === 'R' ? 'R' : 'S';
  }

  // TRC helpers
  setProcessControlField(s: string): void { this.individualName = converters.alphaField(s, 6); }
  setItemResearchNumber(s: string): void { this.individualName += converters.alphaField(s, 16); }
  setItemTypeIndicator(s: string): void { this.discretionaryData = converters.alphaField(s, 2); }
  processControlField(): string { return converters.parseStringField(readRunes(0, 6, this.individualName)); }
  itemResearchNumber(): string { return converters.parseStringField(readRunes(7, 16, this.individualName)); }
  itemTypeIndicator(): string { return this.discretionaryData; }

  traceNumberField(): string { return converters.stringField(this.traceNumber, 15); }

  /** Returns "C" for credit or "D" for debit based on TransactionCode */
  creditOrDebit(): string {
    if (this.transactionCode < 10 || this.transactionCode > 99) return '';
    const tc = String(this.transactionCode);
    const second = tc[1];
    switch (second) {
      case '1': case '2': case '3': case '4': return 'C';
      case '5': case '6': case '7': case '8': case '9': return 'D';
    }
    return '';
  }

  /** AddAddenda05 appends an Addenda05 to the EntryDetail */
  addAddenda05(addenda05: Addenda05Like): void {
    this.addenda05.push(addenda05);
  }

  /** Count of all addenda records attached to this entry */
  addendaCount(): number {
    let n = 0;
    if (this.addenda02) n++;
    n += this.addenda05.filter(a => a != null).length;
    if (this.addenda98) n++;
    if (this.addenda98Refused) n++;
    if (this.addenda99) n++;
    if (this.addenda99Dishonored) n++;
    if (this.addenda99Contested) n++;
    return n;
  }
}

export function newEntryDetail(): EntryDetail {
  return new EntryDetail();
}
