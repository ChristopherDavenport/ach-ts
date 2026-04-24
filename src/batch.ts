import {
  ACK, ADV, ARC, ATX, BOC, CCD, CIE, COR, CTX, DNE, ENR, IAT,
  MTE, POP, POS, PPD, RCK, SHR, TEL, TRC, TRX, WEB, XCK,
  MixedDebitsAndCredits, CreditsOnly, DebitsOnly, AutomatedAccountingAdvices,
  CheckingCredit, CheckingReturnNOCCredit, CheckingPrenoteCredit, CheckingZeroDollarRemittanceCredit,
  CheckingDebit, CheckingReturnNOCDebit, CheckingPrenoteDebit, CheckingZeroDollarRemittanceDebit,
  SavingsCredit, SavingsReturnNOCCredit, SavingsPrenoteCredit, SavingsZeroDollarRemittanceCredit,
  SavingsDebit, SavingsReturnNOCDebit, SavingsPrenoteDebit, SavingsZeroDollarRemittanceDebit,
  GLCredit, GLReturnNOCCredit, GLPrenoteCredit, GLZeroDollarRemittanceCredit,
  GLDebit, GLReturnNOCDebit, GLPrenoteDebit, GLZeroDollarRemittanceDebit,
  LoanCredit, LoanReturnNOCCredit, LoanPrenoteCredit, LoanZeroDollarRemittanceCredit,
  LoanDebit, LoanReturnNOCDebit,
  CreditForDebitsOriginated, DebitForCreditsOriginated,
  CreditForCreditsReceived, DebitForDebitsReceived,
  CreditForCreditsRejected, DebitForDebitsRejectedBatches,
  CreditSummary, DebitSummary,
  CategoryForward, CategoryReturn, CategoryNOC,
  CategoryDishonoredReturn, CategoryDishonoredReturnContested,
  OffsetChecking, OffsetSavings,
} from './constants.js';
import type { OffsetAccountType } from './constants.js';
import type { ValidateOpts } from './validateOpts.js';
import { BatchHeader, newBatchHeader } from './batchHeader.js';
import { BatchControl, newBatchControl } from './batchControl.js';
import { EntryDetail } from './entryDetail.js';
import { ADVEntryDetail } from './advEntryDetail.js';
import { ADVBatchControl, newADVBatchControl } from './advBatchControl.js';
import { Converters } from './utils/converters.js';
import { Validators, CheckRoutingNumber, CalculateCheckDigit } from './utils/validators.js';
import {
  fieldError,
  FieldError,
  ErrBatchNoEntries, ErrBatchADVCount, ErrBatchAddendaIndicator,
  ErrBatchOriginatorDNE, ErrBatchSECType, ErrBatchServiceClassCode,
  ErrBatchTransactionCode, ErrBatchAmountNonZero, ErrBatchAmountZero,
  ErrBatchDebitOnly, ErrBatchCheckSerialNumber, ErrBatchAddendaCategory,
  ErrBatchInvalidCardTransactionType,
  ErrBatchCompanyEntryDescriptionAutoenroll, ErrBatchCompanyEntryDescriptionREDEPCHECK,
  ErrBatchCORAddenda,
  ErrFieldInclusion, ErrFieldRequired,
  ErrIdentificationNumber, ErrValidMonth, ErrValidYear, ErrValidState,
  ErrOrigStatusCode,
  ErrFileIATSEC, ErrFileUnknownSEC,
  BatchError,
  ErrBatchHeaderControlEquality,
  ErrBatchCalculatedControlEquality,
  ErrBatchAscending,
  ErrBatchCategory,
  ErrBatchTraceNumberNotODFI,
  ErrBatchAddendaCount,
  ErrBatchRequiredAddendaCount,
  ErrBatchExpectedAddendaCount,
  ErrBatchServiceClassTranCode,
  ErrBatchAmount,
  ErrBatchIATNOC,
} from './errors/index.js';
import {
  batchControlFieldPositions, advBatchControlFieldPositions, batchHeaderFieldPositions,
  entryDetailFieldPositions, getAddendaFieldPositions, enrichErrors,
} from './fieldPositions.js';

// Offset contains the associated information to append an 'Offset Record' on an ACH batch during Create.
export interface Offset {
  routingNumber: string;
  accountNumber: string;
  accountType: OffsetAccountType;
  description: string;
}

// InvalidEntry describes an invalid entry found during validation
export interface InvalidEntry {
  entry?: EntryDetail;
  advEntry?: ADVEntryDetail;
  error: Error;
}

// Batcher abstracts the different ACH batch types that can exist in a file.
export interface Batcher {
  getHeader(): BatchHeader;
  setHeader(bh: BatchHeader): void;
  getControl(): BatchControl;
  setControl(bc: BatchControl): void;
  getADVControl(): ADVBatchControl;
  setADVControl(bc: ADVBatchControl): void;
  getEntries(): EntryDetail[];
  addEntry(entry: EntryDetail): void;
  deleteEntries(del: (e: EntryDetail) => boolean): void;
  getADVEntries(): ADVEntryDetail[];
  addADVEntry(entry: ADVEntryDetail): void;
  deleteADVEntries(del: (e: ADVEntryDetail) => boolean): void;
  create(): Error | null;
  validate(): Error | null;
  validateAll(): Error[];
  validateTotals(): Error | null;
  validateAllTotals(): Error[];
  setID(id: string): void;
  id(): string;
  category(): string;
  batchError(field: string, err: Error, ...values: unknown[]): Error;
  equal(other: Batcher): boolean;
  withOffset(off: Offset | undefined): void;
  setValidation(opts: ValidateOpts | undefined): void;
}

const offsetIndividualName = 'OFFSET';

/**
 * Batch holds the Batch Header and Batch Control and all Entry Records.
 */
export class Batch implements Batcher {
  private _id = '';
  header: BatchHeader;
  entries: EntryDetail[] = [];
  control: BatchControl;
  advEntries: ADVEntryDetail[] = [];
  advControl: ADVBatchControl;
  private offset?: Offset;
  private _category = '';

  protected converters = new Converters();
  protected validators = new Validators();
  validateOpts?: ValidateOpts;

  constructor(bh?: BatchHeader) {
    this.header = bh ?? newBatchHeader();
    this.control = newBatchControl();
    this.advControl = newADVBatchControl();
  }

  // --- Batcher interface ---

  getHeader(): BatchHeader { return this.header; }
  setHeader(bh: BatchHeader): void { this.header = bh; }
  getControl(): BatchControl { return this.control; }
  setControl(bc: BatchControl): void { this.control = bc; }
  getADVControl(): ADVBatchControl { return this.advControl; }
  setADVControl(bc: ADVBatchControl): void { this.advControl = bc; }
  getEntries(): EntryDetail[] { return this.entries; }

  addEntry(entry: EntryDetail): void {
    if (!entry) return;
    if (!entry.secCode) {
      entry.setSECCode(this.header.standardEntryClassCode.toUpperCase());
    }
    this._category = entry.category;
    this.entries.push(entry);
  }

  deleteEntries(del: (e: EntryDetail) => boolean): void {
    this.entries = this.entries.filter(e => !del(e));
  }

  getADVEntries(): ADVEntryDetail[] { return this.advEntries; }

  addADVEntry(entry: ADVEntryDetail): void {
    this._category = entry.category;
    this.advEntries.push(entry);
  }

  deleteADVEntries(del: (e: ADVEntryDetail) => boolean): void {
    this.advEntries = this.advEntries.filter(e => !del(e));
  }

  create(): Error | null {
    return new Error('use an implementation of batch or NewBatch');
  }

  validate(): Error | null {
    return new Error('use an implementation of batch or NewBatch');
  }

  validateAll(): Error[] {
    return [new Error('use an implementation of batch or NewBatch')];
  }

  validateTotals(): Error | null {
    let err = this.isBatchEntryCount();
    if (err) return err;
    err = this.isBatchAmount();
    if (err) return err;
    err = this.isEntryHash();
    if (err) return err;
    return null;
  }

  validateAllTotals(): Error[] {
    const errors: Error[] = [];
    const push = (err: Error | null) => { if (err) errors.push(err); };
    push(this.isBatchEntryCount());
    push(this.isBatchAmount());
    push(this.isEntryHash());
    return errors;
  }

  setValidation(opts: ValidateOpts | undefined): void {
    this.validateOpts = opts;
    if (this.header) this.header.setValidation(opts);
    if (this.control) this.control.setValidation(opts);
  }

  id(): string { return this._id; }
  setID(id: string): void { this._id = id; }

  category(): string {
    if (this.entries.length === 0 && this._category !== '') {
      return this._category;
    }
    for (const entry of this.entries) {
      if (entry.category === CategoryReturn || entry.category === CategoryNOC) {
        return entry.category;
      }
    }
    for (const entry of this.advEntries) {
      if (entry.category === CategoryReturn || entry.category === CategoryNOC) {
        return entry.category;
      }
    }
    return CategoryForward;
  }

  equal(other: Batcher): boolean {
    if (!other || !this.header || !other.getHeader()) return false;
    if (!this.header.equal(other.getHeader())) return false;

    const oentries = other.getEntries();
    if (this.entries.length !== oentries.length) return false;

    let equalEntries = 0;
    for (const a of this.entries) {
      for (const b of oentries) {
        if (a.transactionCode !== b.transactionCode) continue;
        if (a.rdfiIdentification !== b.rdfiIdentification) continue;
        if (a.checkDigit !== b.checkDigit) continue;
        if (a.dfiAccountNumber !== b.dfiAccountNumber) continue;
        if (a.amount !== b.amount) continue;
        if (a.identificationNumber !== b.identificationNumber) continue;
        if (a.individualName !== b.individualName) continue;
        if (a.discretionaryData !== b.discretionaryData) continue;
        equalEntries++;
      }
    }
    return this.entries.length === equalEntries && equalEntries !== 0;
  }

  withOffset(off: Offset | undefined): void {
    this.offset = off;
  }

  batchError(field: string, err: Error, ...values: unknown[]): Error {
    if (!err) return err;
    if (err instanceof BatchError) return err;
    const be = new BatchError(
      this.header?.batchNumber ?? 0,
      this.header?.standardEntryClassCode ?? '',
      field,
      err,
      values.length > 0 ? values[0] : undefined,
    );
    return be;
  }

  // --- Core batch building & validation ---

  isADV(): boolean {
    return this.header.standardEntryClassCode === ADV;
  }

  /** Build creates valid batch by building sequence numbers and batch control. */
  protected build(): Error | null {
    // Requires a valid BatchHeader
    const headerErr = this.header.validate();
    if (headerErr) return headerErr;

    if (this.entries.length === 0 && this.advEntries.length === 0) {
      return this.batchError('entries', ErrBatchNoEntries);
    }

    let entryCount = 0;
    let seq = 1;

    if (!this.isADV()) {
      for (let i = 0; i < this.entries.length; i++) {
        const entry = this.entries[i];
        entryCount += 1 + entry.addendaCount();

        const currentTraceODFI = parseInt(entry.traceNumberField().substring(0, 8), 10) || 0;
        const batchHeaderODFI = parseInt(this.header.odfiIdentificationField().substring(0, 8), 10) || 0;

        // Add a sequenced TraceNumber if one is not already set
        if (currentTraceODFI !== batchHeaderODFI) {
          if (!this.validateOpts) {
            entry.setTraceNumber(this.header.odfiIdentification, seq);
          } else {
            if (!this.validateOpts.bypassOriginValidation && !this.validateOpts.customTraceNumbers) {
              entry.setTraceNumber(this.header.odfiIdentification, seq);
            }
          }
        }
        seq++;

        let addendaSeq = 1;
        for (const a of entry.addenda05) {
          a.sequenceNumber = addendaSeq;
          a.entryDetailSequenceNumber = this.converters.parseNumField(
            this.entries[i].traceNumberField().substring(8),
          );
          addendaSeq++;
        }
      }

      // build a BatchControl record
      const bc = newBatchControl();
      bc.serviceClassCode = this.header.serviceClassCode;
      bc.companyIdentification = this.header.companyIdentification;
      bc.odfiIdentification = this.header.odfiIdentification;
      bc.batchNumber = this.header.batchNumber;
      bc.entryAddendaCount = entryCount;
      bc.entryHash = this.calculateEntryHash();
      const [credit, debit] = this.calculateBatchAmounts();
      bc.totalCreditEntryDollarAmount = credit;
      bc.totalDebitEntryDollarAmount = debit;
      this.control = bc;
    } else {
      // ADV batch
      for (let i = 0; i < this.advEntries.length; i++) {
        entryCount++;
        // Set Sequence Number
        this.advEntries[i].sequenceNumber = seq;
        seq++;
        if (seq > 9999) {
          return this.batchError('SequenceNumber', ErrBatchADVCount);
        }
      }
      // build an ADV BatchControl record
      const bcADV = newADVBatchControl();
      bcADV.validateOpts = this.validateOpts;
      bcADV.serviceClassCode = this.header.serviceClassCode;
      bcADV.achOperatorData = this.header.companyName;
      bcADV.odfiIdentification = this.header.odfiIdentification;
      bcADV.batchNumber = this.header.batchNumber;
      bcADV.entryAddendaCount = entryCount;
      bcADV.entryHash = this.calculateEntryHash();
      const [advCredit, advDebit] = this.calculateADVBatchAmounts();
      bcADV.totalCreditEntryDollarAmount = advCredit;
      bcADV.totalDebitEntryDollarAmount = advDebit;
      this.advControl = bcADV;
    }

    return this.upsertOffsets();
  }

  /** verify checks basic valid NACHA batch rules. */
  protected verify(): Error | null {
    // No entries in batch
    if (this.entries.length === 0 && this.advEntries.length === 0) {
      return this.batchError('entries', ErrBatchNoEntries);
    }

    // verify field inclusion
    const fieldErr = this.isFieldInclusion();
    if (fieldErr) return this.batchError('FieldError', fieldErr);

    if (!this.isADV()) {
      // Validate header/control match
      if (!(this.validateOpts?.unequalServiceClassCode) &&
        this.header.serviceClassCode !== this.control.serviceClassCode) {
        return this.batchError('ServiceClassCode',
          new ErrBatchHeaderControlEquality(this.header.serviceClassCode, this.control.serviceClassCode));
      }
      if (this.header.companyIdentification !== this.control.companyIdentification &&
        !(this.validateOpts?.bypassCompanyIdentificationMatch)) {
        return this.batchError('CompanyIdentification',
          new ErrBatchHeaderControlEquality(this.header.companyIdentification, this.control.companyIdentification));
      }
      if (this.header.odfiIdentification !== this.control.odfiIdentification) {
        return this.batchError('ODFIIdentification',
          new ErrBatchHeaderControlEquality(this.header.odfiIdentification, this.control.odfiIdentification));
      }
      if (this.header.batchNumber !== this.control.batchNumber) {
        return this.batchError('BatchNumber',
          new ErrBatchHeaderControlEquality(this.header.batchNumber, this.control.batchNumber));
      }
    } else {
      // ADV control checks
      if (!(this.validateOpts?.unequalServiceClassCode) &&
        this.header.serviceClassCode !== this.advControl.serviceClassCode) {
        return this.batchError('ServiceClassCode',
          new ErrBatchHeaderControlEquality(this.header.serviceClassCode, this.advControl.serviceClassCode));
      }
      if (this.header.odfiIdentification !== this.advControl.odfiIdentification) {
        return this.batchError('ODFIIdentification',
          new ErrBatchHeaderControlEquality(this.header.odfiIdentification, this.advControl.odfiIdentification));
      }
      if (this.header.batchNumber !== this.advControl.batchNumber) {
        return this.batchError('BatchNumber',
          new ErrBatchHeaderControlEquality(this.header.batchNumber, this.advControl.batchNumber));
      }
    }

    let err = this.validateTotals();
    if (err) return err;

    if (!this.validateOpts?.customTraceNumbers) {
      err = this.isSequenceAscending();
      if (err) return err;
    }

    err = this.isOriginatorDNE();
    if (err) return err;

    if (!this.validateOpts?.customTraceNumbers) {
      err = this.isTraceNumberODFI();
      if (err) return err;
      err = this.isAddendaSequence();
      if (err) return err;
    }

    err = this.isCategory();
    if (err) return err;

    return null;
  }

  /** verifyAll checks basic valid NACHA batch rules, collecting all errors. */
  protected verifyAll(): Error[] {
    const errors: Error[] = [];
    const push = (err: Error | null) => { if (err) errors.push(err); };

    // No entries in batch
    if (this.entries.length === 0 && this.advEntries.length === 0) {
      push(this.batchError('entries', ErrBatchNoEntries));
    }

    // verify field inclusion
    errors.push(...this.isFieldInclusionAll());

    if (!this.isADV()) {
      if (!(this.validateOpts?.unequalServiceClassCode) &&
        this.header.serviceClassCode !== this.control.serviceClassCode) {
        push(this.batchError('ServiceClassCode',
          new ErrBatchHeaderControlEquality(this.header.serviceClassCode, this.control.serviceClassCode)));
      }
      if (this.header.companyIdentification !== this.control.companyIdentification &&
        !(this.validateOpts?.bypassCompanyIdentificationMatch)) {
        push(this.batchError('CompanyIdentification',
          new ErrBatchHeaderControlEquality(this.header.companyIdentification, this.control.companyIdentification)));
      }
      if (this.header.odfiIdentification !== this.control.odfiIdentification) {
        push(this.batchError('ODFIIdentification',
          new ErrBatchHeaderControlEquality(this.header.odfiIdentification, this.control.odfiIdentification)));
      }
      if (this.header.batchNumber !== this.control.batchNumber) {
        push(this.batchError('BatchNumber',
          new ErrBatchHeaderControlEquality(this.header.batchNumber, this.control.batchNumber)));
      }
    } else {
      if (!(this.validateOpts?.unequalServiceClassCode) &&
        this.header.serviceClassCode !== this.advControl.serviceClassCode) {
        push(this.batchError('ServiceClassCode',
          new ErrBatchHeaderControlEquality(this.header.serviceClassCode, this.advControl.serviceClassCode)));
      }
      if (this.header.odfiIdentification !== this.advControl.odfiIdentification) {
        push(this.batchError('ODFIIdentification',
          new ErrBatchHeaderControlEquality(this.header.odfiIdentification, this.advControl.odfiIdentification)));
      }
      if (this.header.batchNumber !== this.advControl.batchNumber) {
        push(this.batchError('BatchNumber',
          new ErrBatchHeaderControlEquality(this.header.batchNumber, this.advControl.batchNumber)));
      }
    }

    errors.push(...this.validateAllTotals());

    if (!this.validateOpts?.customTraceNumbers) {
      push(this.isSequenceAscending());
    }

    push(this.isOriginatorDNE());

    if (!this.validateOpts?.customTraceNumbers) {
      push(this.isTraceNumberODFI());
      push(this.isAddendaSequence());
    }

    push(this.isCategory());

    // Enrich BatchError instances with positional data
    for (const err of errors) {
      if (err instanceof BatchError && err.line === undefined) {
        const controlLine = this.isADV() ? this.advControl.lineNumber : this.control.lineNumber;
        err.line = controlLine;
        const positions = this.isADV() ? advBatchControlFieldPositions : batchControlFieldPositions;
        const pos = positions[err.fieldName];
        if (pos) {
          err.startColumn = pos.start;
          err.endColumn = pos.end;
        } else {
          // Full-line fallback for structural errors without a specific field
          err.startColumn = 0;
          err.endColumn = 94;
        }

        // Add relatedLocation pointing to the header for header/control equality errors
        if (err.cause instanceof ErrBatchHeaderControlEquality) {
          const headerPos = batchHeaderFieldPositions[err.fieldName];
          if (headerPos && this.header.lineNumber) {
            err.relatedLocations = [{
              line: this.header.lineNumber,
              startColumn: headerPos.start,
              endColumn: headerPos.end,
              message: `header value: ${err.cause.headerValue}`,
            }];
          }
        }
      }
    }

    return errors;
  }

  // --- Validation helpers ---

  protected calculateEntryHash(): number {
    let hash = 0;
    if (!this.isADV()) {
      for (const entry of this.entries) {
        hash += parseInt(aba8(entry.rdfiIdentification), 10) || 0;
      }
    } else {
      for (const entry of this.advEntries) {
        hash += parseInt(aba8(entry.rdfiIdentification), 10) || 0;
      }
    }
    return this.converters.leastSignificantDigits(hash, 10);
  }

  protected calculateBatchAmounts(): [number, number] {
    let credit = 0;
    let debit = 0;
    for (const entry of this.entries) {
      switch (entry.transactionCode) {
        case CheckingCredit: case CheckingReturnNOCCredit: case CheckingPrenoteCredit: case CheckingZeroDollarRemittanceCredit:
        case SavingsCredit: case SavingsReturnNOCCredit: case SavingsPrenoteCredit: case SavingsZeroDollarRemittanceCredit:
        case GLCredit: case GLReturnNOCCredit: case GLPrenoteCredit: case GLZeroDollarRemittanceCredit:
        case LoanCredit: case LoanReturnNOCCredit: case LoanPrenoteCredit: case LoanZeroDollarRemittanceCredit:
          credit += entry.amount;
          break;
        case CheckingDebit: case CheckingReturnNOCDebit: case CheckingPrenoteDebit: case CheckingZeroDollarRemittanceDebit:
        case SavingsDebit: case SavingsReturnNOCDebit: case SavingsPrenoteDebit: case SavingsZeroDollarRemittanceDebit:
        case GLDebit: case GLReturnNOCDebit: case GLPrenoteDebit: case GLZeroDollarRemittanceDebit:
        case LoanDebit: case LoanReturnNOCDebit:
          debit += entry.amount;
          break;
      }
    }
    return [credit, debit];
  }

  private calculateADVBatchAmounts(): [number, number] {
    let credit = 0;
    let debit = 0;
    for (const entry of this.advEntries) {
      switch (entry.transactionCode) {
        case CreditForDebitsOriginated: case CreditForCreditsReceived:
        case CreditForCreditsRejected: case CreditSummary:
          credit += entry.amount;
          break;
        case DebitForCreditsOriginated: case DebitForDebitsReceived:
        case DebitForDebitsRejectedBatches: case DebitSummary:
          debit += entry.amount;
          break;
      }
    }
    return [credit, debit];
  }

  private isSequenceAscending(): Error | null {
    if (!this.isADV()) {
      let lastSeq = '0';
      for (const entry of this.entries) {
        if (!this.validateOpts?.customTraceNumbers) {
          if (entry.traceNumber <= lastSeq) {
            return this.batchError('TraceNumber', new ErrBatchAscending(lastSeq, entry.traceNumber));
          }
        }
        lastSeq = entry.traceNumber;
      }
    }
    return null;
  }

  private isEntryHash(): Error | null {
    const hashField = this.calculateEntryHash();
    if (!this.isADV()) {
      if (hashField !== this.control.entryHash) {
        return this.batchError('EntryHash',
          new ErrBatchCalculatedControlEquality(hashField, this.control.entryHash));
      }
    } else {
      if (hashField !== this.advControl.entryHash) {
        return this.batchError('EntryHash',
          new ErrBatchCalculatedControlEquality(hashField, this.advControl.entryHash));
      }
    }
    return null;
  }

  private isBatchEntryCount(): Error | null {
    let entryCount = 0;
    if (!this.isADV()) {
      for (const entry of this.entries) {
        entryCount += 1 + entry.addendaCount();
      }
      if (entryCount !== this.control.entryAddendaCount) {
        if (this.validateOpts?.unequalAddendaCounts) return null;
        return this.batchError('EntryAddendaCount',
          new ErrBatchCalculatedControlEquality(entryCount, this.control.entryAddendaCount));
      }
    } else {
      for (const entry of this.advEntries) {
        entryCount++;
      }
      if (entryCount !== this.advControl.entryAddendaCount) {
        if (this.validateOpts?.unequalAddendaCounts) return null;
        return this.batchError('EntryAddendaCount',
          new ErrBatchCalculatedControlEquality(entryCount, this.advControl.entryAddendaCount));
      }
    }
    return null;
  }

  private isBatchAmount(): Error | null {
    if (!this.isADV()) {
      const [credit, debit] = this.calculateBatchAmounts();
      if (debit !== this.control.totalDebitEntryDollarAmount) {
        return this.batchError('TotalDebitEntryDollarAmount',
          new ErrBatchCalculatedControlEquality(debit, this.control.totalDebitEntryDollarAmount));
      }
      if (credit !== this.control.totalCreditEntryDollarAmount) {
        return this.batchError('TotalCreditEntryDollarAmount',
          new ErrBatchCalculatedControlEquality(credit, this.control.totalCreditEntryDollarAmount));
      }
    } else {
      const [credit, debit] = this.calculateADVBatchAmounts();
      if (debit !== this.advControl.totalDebitEntryDollarAmount) {
        return this.batchError('TotalDebitEntryDollarAmount',
          new ErrBatchCalculatedControlEquality(debit, this.advControl.totalDebitEntryDollarAmount));
      }
      if (credit !== this.advControl.totalCreditEntryDollarAmount) {
        return this.batchError('TotalCreditEntryDollarAmount',
          new ErrBatchCalculatedControlEquality(credit, this.advControl.totalCreditEntryDollarAmount));
      }
    }
    return null;
  }

  private isOriginatorDNE(): Error | null {
    if (this.header.originatorStatusCode !== 2 && this.header.standardEntryClassCode === DNE) {
      for (const entry of this.entries) {
        if (entry.transactionCode === CheckingPrenoteCredit || entry.transactionCode === SavingsPrenoteCredit) {
          return this.batchError('OriginatorStatusCode', ErrBatchOriginatorDNE, this.header.originatorStatusCode);
        }
      }
    }
    return null;
  }

  private isTraceNumberODFI(): Error | null {
    if (this.validateOpts?.bypassOriginValidation) return null;
    const bhODFI = this.header.odfiIdentificationField();
    for (const entry of this.entries) {
      const entryODFI = entry.traceNumber.length >= 8 ? entry.traceNumber.substring(0, 8) : '';
      if (bhODFI !== entryODFI) {
        return this.batchError('ODFIIdentificationField', new ErrBatchTraceNumberNotODFI(bhODFI, entryODFI));
      }
    }
    return null;
  }

  private isAddendaSequence(): Error | null {
    for (const entry of this.entries) {
      if (entry.addenda02) {
        if (entry.addendaRecordIndicator !== 1) {
          return this.batchError('AddendaRecordIndicator', ErrBatchAddendaIndicator);
        }
      }
      if (entry.addenda05.length > 0) {
        if (entry.addendaRecordIndicator !== 1) {
          return this.batchError('AddendaRecordIndicator', ErrBatchAddendaIndicator);
        }
        let lastSeq = -1;
        for (const a of entry.addenda05) {
          if (a.sequenceNumber < lastSeq) {
            return this.batchError('SequenceNumber', new ErrBatchAscending(lastSeq, a.sequenceNumber));
          }
          lastSeq = a.sequenceNumber;
          // check we are in the correct Entry Detail
          const edSeq = this.converters.numericField(a.entryDetailSequenceNumber, 7);
          const traceSeq = entry.traceNumberField().substring(8);
          if (edSeq !== traceSeq) {
            return this.batchError('TraceNumber', new ErrBatchAscending(lastSeq, a.sequenceNumber));
          }
        }
      }
      if (entry.addenda98 && entry.addendaRecordIndicator !== 1) {
        return this.batchError('AddendaRecordIndicator', ErrBatchAddendaIndicator);
      }
      if (entry.addenda98Refused && entry.addendaRecordIndicator !== 1) {
        return this.batchError('AddendaRecordIndicator', ErrBatchAddendaIndicator);
      }
      if (entry.addenda99 && entry.addendaRecordIndicator !== 1) {
        return this.batchError('AddendaRecordIndicator', ErrBatchAddendaIndicator);
      }
      if (entry.addenda99Dishonored && entry.addendaRecordIndicator !== 1) {
        return this.batchError('AddendaRecordIndicator', ErrBatchAddendaIndicator);
      }
      if (entry.addenda99Contested && entry.addendaRecordIndicator !== 1) {
        return this.batchError('AddendaRecordIndicator', ErrBatchAddendaIndicator);
      }
    }
    return null;
  }

  private isCategory(): Error | null {
    if (!this.isADV()) {
      if (this.entries.length === 0) return null;
      const cat = this.entries[0].category;
      for (const entry of this.entries) {
        if (entry.category === CategoryNOC) continue;
        if (entry.category !== cat) {
          return this.batchError('Category', new ErrBatchCategory(entry.category, cat));
        }
      }
    } else {
      if (this.advEntries.length === 0) return null;
      const cat = this.advEntries[0].category;
      for (const entry of this.advEntries) {
        if (entry.category !== cat) {
          return this.batchError('Category', new ErrBatchCategory(entry.category, cat));
        }
      }
    }
    return null;
  }

  protected isFieldInclusion(): Error | null {
    const headerErr = this.header.validate();
    if (headerErr) return headerErr;

    if (!this.isADV()) {
      for (const entry of this.entries) {
        const entryErr = entry.validate();
        if (entryErr) return entryErr;

        // Some SEC codes require IndividualName is non-blank
        switch (this.header.standardEntryClassCode) {
          case ARC: case BOC: case CIE: case DNE: case ENR: case MTE:
          case POP: case POS: case PPD: case RCK: case SHR: case TEL: case WEB:
            if (!this.validateOpts?.allowEmptyIndividualName) {
              const nameErr = this.validators.isNonZero(entry.individualName);
              if (nameErr) return fieldError('IndividualName', nameErr, entry.individualName);
            }
            break;
        }

        if (entry.addenda02) {
          const a02Err = entry.addenda02.validate();
          if (a02Err) return a02Err;
        }
        for (const a05 of entry.addenda05) {
          const a05Err = a05.validate();
          if (a05Err) return a05Err;
        }
        if (entry.addenda98) {
          const a98Err = entry.addenda98.validate();
          if (a98Err) return a98Err;
        }
        if (entry.addenda98Refused) {
          const a98rErr = entry.addenda98Refused.validate();
          if (a98rErr) return a98rErr;
        }
        if (entry.addenda99) {
          const a99Err = entry.addenda99.validate();
          if (a99Err) return a99Err;
        }
        if (entry.addenda99Dishonored) {
          const a99dErr = entry.addenda99Dishonored.validate();
          if (a99dErr) return a99dErr;
        }
        if (entry.addenda99Contested) {
          const a99cErr = entry.addenda99Contested.validate();
          if (a99cErr) return a99cErr;
        }
      }
      return this.control.validate();
    }

    // ADV
    for (const entry of this.advEntries) {
      const entryErr = entry.validate();
      if (entryErr) return entryErr;
    }
    return this.advControl.validate();
  }

  /** isFieldInclusionAll validates field inclusion across all records, collecting all errors. */
  protected isFieldInclusionAll(): Error[] {
    const errors: Error[] = [];
    const push = (err: Error | null | undefined) => { if (err) errors.push(err); };

    errors.push(...this.header.validateAll());

    if (!this.isADV()) {
      for (const entry of this.entries) {
        errors.push(...entry.validateAll());

        switch (this.header.standardEntryClassCode) {
          case ARC: case BOC: case CIE: case DNE: case ENR: case MTE:
          case POP: case POS: case PPD: case RCK: case SHR: case TEL: case WEB:
            if (!this.validateOpts?.allowEmptyIndividualName) {
              const nameErr = fieldError('IndividualName', this.validators.isNonZero(entry.individualName), entry.individualName);
              if (nameErr) {
                nameErr.line = entry.lineNumber;
                const pos = entryDetailFieldPositions['IndividualName'];
                if (pos) {
                  nameErr.startColumn = pos.start;
                  nameErr.endColumn = pos.end;
                }
                errors.push(nameErr);
              }
            }
            break;
        }

        // Enrich addenda validate() errors with position data
        const enrichAddenda = (addenda: { typeCode: string; lineNumber: number; validate(): Error | null }, expectedTypeCode: string, opts?: { isRefused?: boolean; isDishonored?: boolean; isContested?: boolean }) => {
          const err = addenda.validate();
          if (err) {
            if (err instanceof FieldError) {
              err.line = addenda.lineNumber;
              const positions = getAddendaFieldPositions(expectedTypeCode, opts);
              if (positions) {
                const pos = positions[err.fieldName];
                if (pos) {
                  err.startColumn = pos.start;
                  err.endColumn = pos.end;
                }
              }
            }
            errors.push(err);
          }
        };

        if (entry.addenda02) enrichAddenda(entry.addenda02, '02');
        for (const a05 of entry.addenda05) enrichAddenda(a05, '05');
        if (entry.addenda98) enrichAddenda(entry.addenda98, '98');
        if (entry.addenda98Refused) enrichAddenda(entry.addenda98Refused, '98', { isRefused: true });
        if (entry.addenda99) enrichAddenda(entry.addenda99, '99');
        if (entry.addenda99Dishonored) enrichAddenda(entry.addenda99Dishonored, '99', { isDishonored: true });
        if (entry.addenda99Contested) enrichAddenda(entry.addenda99Contested, '99', { isContested: true });
      }
      errors.push(...this.control.validateAll());
    } else {
      for (const entry of this.advEntries) {
        push(entry.validate());
      }
      errors.push(...this.advControl.validateAll());
    }
    return errors;
  }

  // --- Addenda field inclusion checks ---

  protected addendaFieldInclusion(entry: EntryDetail): Error | null {
    switch (entry.category) {
      case CategoryForward:
        return this.addendaFieldInclusionForward(entry);
      case CategoryNOC:
        return this.addendaFieldInclusionNOC(entry);
      case CategoryReturn:
      case CategoryDishonoredReturn:
      case CategoryDishonoredReturnContested:
        return this.addendaFieldInclusionReturn(entry);
    }
    return null;
  }

  private addendaFieldInclusionForward(entry: EntryDetail): Error | null {
    const sec = this.header.standardEntryClassCode;
    switch (sec) {
      case MTE: case POS: case SHR:
        if (!entry.addenda02) return this.batchError('Addenda02', ErrFieldInclusion);
        if (entry.addenda05.length > 0) return this.batchError('Addenda05', ErrBatchAddendaCategory, entry.category);
        break;
      case ACK: case ATX: case CCD: case CIE: case CTX: case DNE: case ENR: case WEB: case PPD: case TRX:
        if (entry.addenda02) return this.batchError('Addenda02', ErrBatchAddendaCategory, entry.category);
        break;
      case ARC: case BOC: case COR: case POP: case RCK: case TEL: case TRC: case XCK:
        if (entry.addenda02) return this.batchError('Addenda02', ErrBatchAddendaCategory, entry.category);
        if (entry.addenda05.length > 0) return this.batchError('Addenda05', ErrBatchAddendaCategory, entry.category);
        break;
    }
    if (sec !== COR) {
      if (entry.addenda98 || entry.addenda98Refused) {
        return this.batchError('Addenda98', ErrBatchAddendaCategory, entry.category);
      }
    }
    if (entry.addenda99) {
      return this.batchError('Addenda99', ErrBatchAddendaCategory, entry.category);
    }
    return null;
  }

  private addendaFieldInclusionNOC(entry: EntryDetail): Error | null {
    if (entry.addenda02) return this.batchError('Addenda02', ErrBatchAddendaCategory, entry.category);
    if (entry.addenda05.length > 0) return this.batchError('Addenda05', ErrBatchAddendaCategory, entry.category);
    if (this.header.standardEntryClassCode !== COR) {
      if (entry.addenda98 || entry.addenda98Refused) {
        return this.batchError('Addenda98', ErrFieldInclusion);
      }
    }
    if (entry.addenda99) return this.batchError('Addenda99', ErrBatchAddendaCategory, entry.category);
    return null;
  }

  private addendaFieldInclusionReturn(entry: EntryDetail): Error | null {
    if (entry.addenda02) return this.batchError('Addenda02', ErrBatchAddendaCategory, entry.category);
    if (entry.addenda05.length > 0) {
      const sec = this.header.standardEntryClassCode;
      if (entry.category === CategoryDishonoredReturn || entry.category === CategoryDishonoredReturnContested) {
        if (![ATX, CTX, PPD, TRX, WEB].includes(sec)) {
          return this.batchError('Addenda05', ErrBatchAddendaCategory, entry.category);
        }
      } else {
        if (sec !== CTX) {
          return this.batchError('Addenda05', ErrBatchAddendaCategory, entry.category);
        }
      }
    }
    if (entry.addenda98 || entry.addenda98Refused) {
      return this.batchError('Addenda98', ErrBatchAddendaCategory, entry.category);
    }
    if (!entry.addenda99 && !entry.addenda99Dishonored && !entry.addenda99Contested) {
      // Offset entries within a Return batch will not have Addenda99
      if (entry.individualName === offsetIndividualName) return null;
      return this.batchError('Addenda99', ErrFieldInclusion);
    }
    return null;
  }

  // --- Entry validation helpers ---

  validAmountForCodes(entry: EntryDetail): Error | null {
    if (this.validateOpts?.allowInvalidAmounts) return null;

    if (entry.addenda98 || entry.addenda98Refused) {
      // NOC entries will have a zero'd amount value
      if (entry.amount !== 0) return ErrBatchAmountNonZero;
      return null;
    }
    if (entry.addenda99 || entry.addenda99Contested || entry.addenda99Dishonored) {
      // Returned prenotes can have a zero amount
      return null;
    }

    const isPrenoteTxCode = this.validators.isPrenote(entry.transactionCode);
    if (isPrenoteTxCode) {
      if (entry.amount === 0) return null;
      return fieldError('Amount', ErrBatchAmountNonZero, entry.amount);
    } else {
      if (entry.amount === 0) {
        if (this.validateOpts?.allowZeroEntryAmount) return null;
        switch (this.header.standardEntryClassCode) {
          case ACK: case ATX:
            if (entry.transactionCode === CheckingZeroDollarRemittanceCredit ||
                entry.transactionCode === SavingsZeroDollarRemittanceCredit) {
              return null;
            }
            break;
        }
        return fieldError('Amount', ErrBatchAmountZero, entry.amount);
      }
    }
    return null;
  }

  validTranCodeForServiceClassCode(entry: EntryDetail): Error | null {
    // ADV should use ADVEntryDetail
    switch (entry.transactionCode) {
      case CreditForDebitsOriginated: case CreditForCreditsReceived:
      case CreditForCreditsRejected: case CreditSummary:
      case DebitForCreditsOriginated: case DebitForDebitsReceived:
      case DebitForDebitsRejectedBatches: case DebitSummary:
        return this.batchError('TransactionCode', ErrBatchTransactionCode, entry.transactionCode);
    }

    if (entry.validateOpts?.checkTransactionCode) return null;

    switch (this.header.serviceClassCode) {
      case AutomatedAccountingAdvices:
        return this.batchError('ServiceClassCode', ErrBatchServiceClassCode, this.header.serviceClassCode);
      case MixedDebitsAndCredits:
        return null;
      case CreditsOnly:
        if (entry.creditOrDebit() !== 'C') {
          return this.batchError('TransactionCode',
            new ErrBatchServiceClassTranCode(this.header.serviceClassCode, entry.transactionCode));
        }
        break;
      case DebitsOnly:
        if (entry.creditOrDebit() !== 'D') {
          return this.batchError('TransactionCode',
            new ErrBatchServiceClassTranCode(this.header.serviceClassCode, entry.transactionCode));
        }
        break;
    }
    return null;
  }

  // --- Offset handling ---

  private upsertOffsets(): Error | null {
    if (!this.offset) return null;

    const routingErr = CheckRoutingNumber(this.offset.routingNumber);
    if (routingErr) {
      return new Error(`offset: invalid routing number ${this.offset.routingNumber}: ${routingErr.message}`);
    }

    // remove any existing Offset records
    for (let i = 0; i < this.entries.length; i++) {
      if (this.entries[i].individualName.toUpperCase() === offsetIndividualName) {
        if (this.entries[i].transactionCode === CheckingCredit || this.entries[i].transactionCode === SavingsCredit) {
          this.control.totalCreditEntryDollarAmount -= this.entries[i].amount;
        } else {
          this.control.totalDebitEntryDollarAmount -= this.entries[i].amount;
        }
        this.control.entryAddendaCount -= 1;
        this.entries.splice(i, 1);
        i--;
      }
    }

    // Validate account type
    if (this.offset.accountType !== OffsetChecking && this.offset.accountType !== OffsetSavings) {
      return new Error(`unknown offset account type: ${this.offset.accountType}`);
    }

    let offsetCount = 1;

    // Create debit offset EntryDetail
    const debitED = this.createOffsetEntryDetail();
    debitED.traceNumber = String(lastTraceNumber(this.entries) + offsetCount).padStart(15, '0');
    debitED.amount = this.control.totalCreditEntryDollarAmount;
    debitED.transactionCode = this.offset.accountType === OffsetChecking ? CheckingDebit : SavingsDebit;
    const hasDebit = debitED.amount !== 0;
    if (hasDebit) offsetCount++;

    // Create credit offset EntryDetail
    const creditED = this.createOffsetEntryDetail();
    creditED.traceNumber = String(lastTraceNumber(this.entries) + offsetCount).padStart(15, '0');
    creditED.amount = this.control.totalDebitEntryDollarAmount;
    creditED.transactionCode = this.offset.accountType === OffsetChecking ? CheckingCredit : SavingsCredit;
    const hasCredit = creditED.amount !== 0;

    // Add EntryDetails and recalculate
    if (hasDebit) {
      this.addEntry(debitED);
      this.control.entryAddendaCount += 1;
      this.control.totalDebitEntryDollarAmount += debitED.amount;
    }
    if (hasCredit) {
      this.addEntry(creditED);
      this.control.entryAddendaCount += 1;
      this.control.totalCreditEntryDollarAmount += creditED.amount;
    }
    this.header.serviceClassCode = MixedDebitsAndCredits;
    this.control.serviceClassCode = MixedDebitsAndCredits;
    this.control.entryHash = this.calculateEntryHash();

    return null;
  }

  private createOffsetEntryDetail(): EntryDetail {
    const ed = new EntryDetail();
    ed.rdfiIdentification = this.offset!.routingNumber.substring(0, 8);
    ed.checkDigit = this.offset!.routingNumber.substring(8, 9);
    ed.dfiAccountNumber = this.offset!.accountNumber;
    ed.identificationNumber = '';
    ed.individualName = offsetIndividualName;
    ed.discretionaryData = this.offset!.description;
    if (this.entries.length > 0) {
      ed.category = this.entries[0].category;
    }
    return ed;
  }
}

// --- Utility functions ---

/** aba8 returns the first 8 digits of an ABA routing number. */
function aba8(rtn: string): string {
  const n = [...rtn].length;
  if (n > 10) return '';
  if (n === 10) {
    if (rtn[0] === '0' || rtn[0] === '1') return rtn.substring(1, 9);
    return '';
  }
  if (n !== 8 && n !== 9) return '';
  return rtn.substring(0, 8);
}

function lastTraceNumber(entries: EntryDetail[]): number {
  if (entries.length === 0) return 0;
  return parseInt(entries[entries.length - 1].traceNumber, 10) || 0;
}

// --- NewBatch factory ---

/** NewBatch takes a BatchHeader and returns a matching SEC code batch type. */
export function newBatch(bh: BatchHeader): [Batcher | null, Error | null] {
  if (!bh) return [null, new Error('nil BatchHeader provided')];

  // Defer imports to avoid circular references - use dynamic dispatch via ConvertBatchType
  switch (bh.standardEntryClassCode) {
    case IAT:
      return [null, ErrFileIATSEC];
    case ACK: case ADV: case ARC: case ATX: case BOC: case CCD: case CIE: case COR:
    case CTX: case DNE: case ENR: case MTE: case POP: case POS: case PPD: case RCK:
    case SHR: case TEL: case TRC: case TRX: case WEB: case XCK: {
      // Create a base batch and wrap it in the correct type
      const batch = new Batch(bh);
      batch.setID(bh.id);
      // The actual SEC-specific subclass is created by the batches/ modules
      // This will be wired up after the batches are created
      return [convertBatchType(batch), null];
    }
    default:
      return [null, new ErrFileUnknownSEC(bh.standardEntryClassCode)];
  }
}

// Registry for batch type constructors - populated by batches/index.ts
const batchTypeRegistry = new Map<string, (batch: Batch) => Batcher>();

export function registerBatchType(secCode: string, factory: (batch: Batch) => Batcher): void {
  batchTypeRegistry.set(secCode, factory);
}

/** ConvertBatchType will take a batch object and convert it into one of the correct batch type. */
export function convertBatchType(batch: Batch): Batcher {
  const factory = batchTypeRegistry.get(batch.header.standardEntryClassCode);
  if (factory) return factory(batch);
  return batch; // return as-is if no specific type registered
}
