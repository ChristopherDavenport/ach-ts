import { IATBatchHeader } from './iatBatchHeader.js';
import { IATEntryDetail } from './iatEntryDetail.js';
import { BatchControl, newBatchControl } from './batchControl.js';
import type { ValidateOpts } from './validateOpts.js';
import { Converters, converters } from './utils/converters.js';
import { Validators, validators } from './utils/validators.js';
import {
  AutomatedAccountingAdvices,
  CategoryForward, CategoryReturn, CategoryNOC,
  COR, IATCOR,
  CheckingCredit, CheckingReturnNOCCredit, CheckingPrenoteCredit, CheckingZeroDollarRemittanceCredit,
  SavingsCredit, SavingsReturnNOCCredit, SavingsPrenoteCredit, SavingsZeroDollarRemittanceCredit,
  GLCredit, GLReturnNOCCredit, GLPrenoteCredit, GLZeroDollarRemittanceCredit,
  LoanCredit, LoanReturnNOCCredit, LoanPrenoteCredit, LoanZeroDollarRemittanceCredit,
  CheckingDebit, CheckingReturnNOCDebit, CheckingPrenoteDebit, CheckingZeroDollarRemittanceDebit,
  SavingsDebit, SavingsReturnNOCDebit, SavingsPrenoteDebit, SavingsZeroDollarRemittanceDebit,
  GLDebit, GLReturnNOCDebit, GLPrenoteDebit, GLZeroDollarRemittanceDebit,
  LoanDebit, LoanReturnNOCDebit,
} from './constants.js';
import {
  BatchError,
  FieldError,
  fieldError,
  ErrFieldInclusion,
  ErrBatchNoEntries,
  ErrBatchServiceClassCode,
  ErrBatchTransactionCode,
  ErrIATBatchAddendaIndicator,
  ErrBatchHeaderControlEquality,
  ErrBatchCalculatedControlEquality,
  ErrBatchAscending,
  ErrBatchTraceNumberNotODFI,
  ErrBatchAddendaTraceNumber,
  ErrBatchAddendaCount,
  ErrBatchCategory,
  ErrBatchIATNOC,
} from './errors/index.js';
import {
  batchControlFieldPositions,
  iatBatchHeaderFieldPositions,
  getAddendaFieldPositions,
} from './fieldPositions.js';

const creditCodes = new Set([
  CheckingCredit, CheckingReturnNOCCredit, CheckingPrenoteCredit, CheckingZeroDollarRemittanceCredit,
  SavingsCredit, SavingsReturnNOCCredit, SavingsPrenoteCredit, SavingsZeroDollarRemittanceCredit,
  GLCredit, GLReturnNOCCredit, GLPrenoteCredit, GLZeroDollarRemittanceCredit,
  LoanCredit, LoanReturnNOCCredit, LoanPrenoteCredit, LoanZeroDollarRemittanceCredit,
]);

const debitCodes = new Set([
  CheckingDebit, CheckingReturnNOCDebit, CheckingPrenoteDebit, CheckingZeroDollarRemittanceDebit,
  SavingsDebit, SavingsReturnNOCDebit, SavingsPrenoteDebit, SavingsZeroDollarRemittanceDebit,
  GLDebit, GLReturnNOCDebit, GLPrenoteDebit, GLZeroDollarRemittanceDebit,
  LoanDebit, LoanReturnNOCDebit,
]);

// NOC-invalid transaction codes (standard non-return/non-NOC codes)
const nocInvalidCodes = new Set([
  CheckingCredit, CheckingDebit, CheckingPrenoteCredit, CheckingPrenoteDebit,
  CheckingZeroDollarRemittanceCredit, CheckingZeroDollarRemittanceDebit,
  SavingsCredit, SavingsDebit, SavingsPrenoteCredit, SavingsPrenoteDebit,
  SavingsZeroDollarRemittanceCredit, SavingsZeroDollarRemittanceDebit,
  GLCredit, GLDebit, GLPrenoteCredit, GLPrenoteDebit,
  GLZeroDollarRemittanceCredit, GLZeroDollarRemittanceDebit,
  LoanCredit, LoanDebit, LoanPrenoteCredit, LoanZeroDollarRemittanceCredit,
]);

function aba8(rtn: string): string {
  if (rtn.length > 8) return rtn.substring(0, 8);
  return rtn.padStart(8, '0');
}

/**
 * IATBatch holds the Batch Header and Batch Control and all Entry Records for an IAT batch.
 */
export class IATBatch {
  id = '';
  header: IATBatchHeader;
  entries: IATEntryDetail[] = [];
  control: BatchControl;
  category = '';
  validateOpts?: ValidateOpts;

  constructor(header?: IATBatchHeader) {
    this.header = header ?? IATBatchHeader.newIATBatchHeader();
    this.control = newBatchControl();
    this.id = this.header.id;
  }

  private error(field: string, err: Error, ...values: unknown[]): Error {
    if (err instanceof BatchError) return err;
    const be = new BatchError(
      this.header.batchNumber,
      'IAT',
      field,
      err,
      values.length > 0 ? values : undefined,
    );
    return be;
  }

  setValidation(opts: ValidateOpts): void {
    this.validateOpts = opts;
    this.header?.setValidation(opts);
    this.control?.setValidation(opts);
  }

  addEntry(entry: IATEntryDetail): void {
    this.category = entry.category;
    this.entries.push(entry);
  }

  deleteEntries(del: (e: IATEntryDetail) => boolean): void {
    this.entries = this.entries.filter(e => !del(e));
  }

  // verify checks basic valid NACHA batch rules
  private verify(): Error | null {
    if (this.entries.length === 0) {
      return this.error('entries', ErrBatchNoEntries);
    }
    const fiErr = this.isFieldInclusion();
    if (fiErr) return this.error('FieldError', fiErr);

    if (!this.validateOpts?.unequalServiceClassCode) {
      if (this.header.serviceClassCode !== this.control.serviceClassCode) {
        return this.error('ServiceClassCode',
          new ErrBatchHeaderControlEquality(this.header.serviceClassCode, this.control.serviceClassCode));
      }
    }
    if (this.header.odfiIdentification !== this.control.odfiIdentification) {
      return this.error('ODFIIdentification',
        new ErrBatchHeaderControlEquality(this.header.odfiIdentification, this.control.odfiIdentification));
    }
    if (this.header.batchNumber !== this.control.batchNumber) {
      return this.error('BatchNumber',
        new ErrBatchHeaderControlEquality(this.header.batchNumber, this.control.batchNumber));
    }
    if (!this.validateOpts?.allowSpecialCharacters) {
      const err = validators.isAlphanumeric(this.control.companyIdentification);
      if (err) return fieldError('CompanyIdentification', err, this.control.companyIdentification);
    }
    if (!this.validateOpts?.customTraceNumbers) {
      const err = this.isSequenceAscending();
      if (err) return err;
    }
    const totErr = this.validateTotals();
    if (totErr) return totErr;
    if (!this.validateOpts?.customTraceNumbers) {
      let err = this.isTraceNumberODFI();
      if (err) return err;
      err = this.isAddendaSequence();
      if (err) return err;
    }
    const catErr = this.isCategory();
    if (catErr) return catErr;
    return null;
  }

  private verifyAll(): Error[] {
    const errors: Error[] = [];
    const push = (err: Error | null | undefined) => { if (err) errors.push(err); };

    if (this.entries.length === 0) {
      push(this.error('entries', ErrBatchNoEntries));
    }
    errors.push(...this.isFieldInclusionAll());

    if (!this.validateOpts?.unequalServiceClassCode) {
      if (this.header.serviceClassCode !== this.control.serviceClassCode) {
        push(this.error('ServiceClassCode',
          new ErrBatchHeaderControlEquality(this.header.serviceClassCode, this.control.serviceClassCode)));
      }
    }
    if (this.header.odfiIdentification !== this.control.odfiIdentification) {
      push(this.error('ODFIIdentification',
        new ErrBatchHeaderControlEquality(this.header.odfiIdentification, this.control.odfiIdentification)));
    }
    if (this.header.batchNumber !== this.control.batchNumber) {
      push(this.error('BatchNumber',
        new ErrBatchHeaderControlEquality(this.header.batchNumber, this.control.batchNumber)));
    }
    if (!this.validateOpts?.allowSpecialCharacters) {
      push(fieldError('CompanyIdentification', validators.isAlphanumeric(this.control.companyIdentification), this.control.companyIdentification));
    }
    if (!this.validateOpts?.customTraceNumbers) {
      push(this.isSequenceAscending());
    }
    errors.push(...this.validateAllTotals());
    if (!this.validateOpts?.customTraceNumbers) {
      push(this.isTraceNumberODFI());
      push(this.isAddendaSequence());
    }
    push(this.isCategory());

    // Enrich BatchError instances with positional data
    for (const err of errors) {
      if (err instanceof BatchError && err.line === undefined) {
        err.line = this.control.lineNumber;
        const pos = batchControlFieldPositions[err.fieldName];
        if (pos) {
          err.startColumn = pos.start;
          err.endColumn = pos.end;
        } else {
          err.startColumn = 0;
          err.endColumn = 94;
        }

        // Add relatedLocation pointing to the header for header/control equality errors
        if (err.cause instanceof ErrBatchHeaderControlEquality) {
          const headerPos = iatBatchHeaderFieldPositions[err.fieldName];
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

  build(): Error | null {
    const hdrErr = this.header.validate();
    if (hdrErr) return hdrErr;
    if (this.entries.length === 0) return this.error('entries', ErrBatchNoEntries);

    let seq = 1;
    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];
      const afiErr = this.addendaFieldInclusion(entry);
      if (afiErr) return afiErr;

      const currentTraceODFI = parseInt(entry.traceNumberField().substring(0, 8), 10) || 0;
      const batchHeaderODFI = parseInt(this.header.odfiIdentificationField().substring(0, 8), 10) || 0;

      if (currentTraceODFI !== batchHeaderODFI) {
        if (!this.validateOpts) {
          this.entries[i].setTraceNumber(this.header.odfiIdentification, seq);
        } else if (!this.validateOpts.bypassOriginValidation && !this.validateOpts.customTraceNumbers) {
          this.entries[i].setTraceNumber(this.header.odfiIdentification, seq);
        }
      }

      const edSeqNum = converters.parseNumField(this.entries[i].traceNumberField().substring(8));
      if (entry.addenda10) entry.addenda10.entryDetailSequenceNumber = edSeqNum;
      if (entry.addenda11) entry.addenda11.entryDetailSequenceNumber = edSeqNum;
      if (entry.addenda12) entry.addenda12.entryDetailSequenceNumber = edSeqNum;
      if (entry.addenda13) entry.addenda13.entryDetailSequenceNumber = edSeqNum;
      if (entry.addenda14) entry.addenda14.entryDetailSequenceNumber = edSeqNum;
      if (entry.addenda15) entry.addenda15.entryDetailSequenceNumber = edSeqNum;
      if (entry.addenda16) entry.addenda16.entryDetailSequenceNumber = edSeqNum;

      seq++;
      let addenda17Seq = 1;
      let addenda18Seq = 1;
      for (const a17 of entry.addenda17) {
        a17.sequenceNumber = addenda17Seq++;
        a17.entryDetailSequenceNumber = edSeqNum;
      }
      for (const a18 of entry.addenda18) {
        a18.sequenceNumber = addenda18Seq++;
        a18.entryDetailSequenceNumber = edSeqNum;
      }
    }

    const originalControl = this.control;
    const bc = newBatchControl();
    this.control = bc;

    if (originalControl) {
      bc.companyIdentification = originalControl.companyIdentification;
    }
    bc.serviceClassCode = this.header.serviceClassCode;
    bc.odfiIdentification = this.header.odfiIdentification;
    bc.batchNumber = this.header.batchNumber;
    bc.entryHash = this.calculateEntryHash();
    const [credit, debit] = this.calculateBatchAmounts();
    bc.totalCreditEntryDollarAmount = credit;
    bc.totalDebitEntryDollarAmount = debit;
    bc.entryAddendaCount = this.countEntryAddenda();
    return null;
  }

  validate(): Error | null {
    if (this.validateOpts?.skipAll || this.validateOpts?.bypassBatchValidation) return null;
    const err = this.verify();
    if (err) return err;

    for (const entry of this.entries) {
      if (entry.addenda17.length > 2) {
        return this.error('Addenda17', new ErrBatchAddendaCount(entry.addenda17.length, 2));
      }
      if (entry.addenda18.length > 5) {
        return this.error('Addenda18', new ErrBatchAddendaCount(entry.addenda18.length, 5));
      }
      if (this.header.serviceClassCode === AutomatedAccountingAdvices) {
        return this.error('ServiceClassCode', ErrBatchServiceClassCode, this.header.serviceClassCode);
      }
      if (entry.isCorrection() || entry.category === CategoryNOC) {
        if (this.header.iatIndicator !== IATCOR) {
          return this.error('IATIndicator', new ErrBatchIATNOC(this.header.iatIndicator, IATCOR));
        }
        if (this.header.standardEntryClassCode !== COR) {
          return this.error('StandardEntryClassCode', new ErrBatchIATNOC(this.header.standardEntryClassCode, COR));
        }
        if (nocInvalidCodes.has(entry.transactionCode)) {
          return this.error('TransactionCode', ErrBatchTransactionCode, entry.transactionCode);
        }
      }
    }
    return null;
  }

  validateAll(): Error[] {
    if (this.validateOpts?.skipAll || this.validateOpts?.bypassBatchValidation) return [];
    const errors = this.verifyAll();

    for (const entry of this.entries) {
      if (entry.addenda17.length > 2) {
        errors.push(this.error('Addenda17', new ErrBatchAddendaCount(entry.addenda17.length, 2)));
      }
      if (entry.addenda18.length > 5) {
        errors.push(this.error('Addenda18', new ErrBatchAddendaCount(entry.addenda18.length, 5)));
      }
      if (this.header.serviceClassCode === AutomatedAccountingAdvices) {
        errors.push(this.error('ServiceClassCode', ErrBatchServiceClassCode, this.header.serviceClassCode));
      }
      if (entry.isCorrection() || entry.category === CategoryNOC) {
        if (this.header.iatIndicator !== IATCOR) {
          errors.push(this.error('IATIndicator', new ErrBatchIATNOC(this.header.iatIndicator, IATCOR)));
        }
        if (this.header.standardEntryClassCode !== COR) {
          errors.push(this.error('StandardEntryClassCode', new ErrBatchIATNOC(this.header.standardEntryClassCode, COR)));
        }
        if (nocInvalidCodes.has(entry.transactionCode)) {
          errors.push(this.error('TransactionCode', ErrBatchTransactionCode, entry.transactionCode));
        }
      }
    }
    return errors;
  }

  create(): Error | null {
    const err = this.build();
    if (err) return err;
    return this.validate();
  }

  validateTotals(): Error | null {
    const [count, countErr] = this.isBatchEntryCount();
    if (countErr) return countErr;
    const amtErr = this.isBatchAmount();
    if (amtErr) return amtErr;
    const hashErr = this.isEntryHash();
    if (hashErr) return hashErr;
    return null;
  }

  validateAllTotals(): Error[] {
    const errors: Error[] = [];
    const push = (err: Error | null | undefined) => { if (err) errors.push(err); };
    const [, countErr] = this.isBatchEntryCount();
    push(countErr);
    push(this.isBatchAmount());
    push(this.isEntryHash());
    return errors;
  }

  /** Per-entry SEC-specific validation checks for IAT entries. */
  invalidEntries(): { entry: IATEntryDetail; error: Error }[] {
    const out: { entry: IATEntryDetail; error: Error }[] = [];
    for (const entry of this.entries) {
      if (entry.addenda17.length > 2) {
        out.push({ entry, error: this.error('Addenda17', new ErrBatchAddendaCount(entry.addenda17.length, 2)) });
      }
      if (entry.addenda18.length > 5) {
        out.push({ entry, error: this.error('Addenda18', new ErrBatchAddendaCount(entry.addenda18.length, 5)) });
      }
      if (this.header.serviceClassCode === AutomatedAccountingAdvices) {
        out.push({ entry, error: this.error('ServiceClassCode', ErrBatchServiceClassCode, this.header.serviceClassCode) });
      }
      if (entry.isCorrection() || entry.category === CategoryNOC) {
        if (this.header.iatIndicator !== IATCOR) {
          out.push({ entry, error: this.error('IATIndicator', new ErrBatchIATNOC(this.header.iatIndicator, IATCOR)) });
        }
        if (this.header.standardEntryClassCode !== COR) {
          out.push({ entry, error: this.error('StandardEntryClassCode', new ErrBatchIATNOC(this.header.standardEntryClassCode, COR)) });
        }
        if (nocInvalidCodes.has(entry.transactionCode)) {
          out.push({ entry, error: this.error('TransactionCode', ErrBatchTransactionCode, entry.transactionCode) });
        }
      }
    }
    return out;
  }

  private isFieldInclusion(): Error | null {
    const hErr = this.header.validate();
    if (hErr) return hErr;
    for (const entry of this.entries) {
      const eErr = entry.validate();
      if (eErr) return eErr;
      const afiErr = this.addendaFieldInclusion(entry);
      if (afiErr) return afiErr;

      // Validate each addenda record
      if (entry.addenda10) { const e = entry.addenda10.validate(); if (e) return e; }
      if (entry.addenda11) { const e = entry.addenda11.validate(); if (e) return e; }
      if (entry.addenda12) { const e = entry.addenda12.validate(); if (e) return e; }
      if (entry.addenda13) { const e = entry.addenda13.validate(); if (e) return e; }
      if (entry.addenda14) { const e = entry.addenda14.validate(); if (e) return e; }
      if (entry.addenda15) { const e = entry.addenda15.validate(); if (e) return e; }
      if (entry.addenda16) { const e = entry.addenda16.validate(); if (e) return e; }
      for (const a17 of entry.addenda17) { const e = a17.validate(); if (e) return e; }
      for (const a18 of entry.addenda18) { const e = a18.validate(); if (e) return e; }

      if (entry.category === CategoryNOC) {
        if (!entry.addenda98) return fieldError('Addenda98', ErrFieldInclusion);
        const e = entry.addenda98.validate();
        if (e) return e;
      }
      if (entry.category === CategoryReturn) {
        if (!entry.addenda99) return fieldError('Addenda99', ErrFieldInclusion);
        const e = entry.addenda99.validate();
        if (e) return e;
        if (entry.addenda17.length > 0) return fieldError('Addenda17', ErrFieldInclusion);
        if (entry.addenda18.length > 0) return fieldError('Addenda18', ErrFieldInclusion);
      }
    }
    const cErr = this.control.validate();
    if (cErr) return cErr;
    return null;
  }

  private isFieldInclusionAll(): Error[] {
    const errors: Error[] = [];
    const push = (err: Error | null | undefined) => { if (err) errors.push(err); };

    // Enrich addenda validate() errors with position data
    const enrichAddenda = (addenda: { typeCode: string; lineNumber: number; validate(): Error | null }, expectedTypeCode: string) => {
      const err = addenda.validate();
      if (err) {
        if (err instanceof FieldError) {
          err.line = addenda.lineNumber;
          const positions = getAddendaFieldPositions(expectedTypeCode);
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

    errors.push(...this.header.validateAll());
    for (const entry of this.entries) {
      errors.push(...entry.validateAll());
      push(this.addendaFieldInclusion(entry));

      if (entry.addenda10) enrichAddenda(entry.addenda10, '10');
      if (entry.addenda11) enrichAddenda(entry.addenda11, '11');
      if (entry.addenda12) enrichAddenda(entry.addenda12, '12');
      if (entry.addenda13) enrichAddenda(entry.addenda13, '13');
      if (entry.addenda14) enrichAddenda(entry.addenda14, '14');
      if (entry.addenda15) enrichAddenda(entry.addenda15, '15');
      if (entry.addenda16) enrichAddenda(entry.addenda16, '16');
      for (const a17 of entry.addenda17) enrichAddenda(a17, '17');
      for (const a18 of entry.addenda18) enrichAddenda(a18, '18');

      if (entry.category === CategoryNOC) {
        if (!entry.addenda98) push(fieldError('Addenda98', ErrFieldInclusion));
        else enrichAddenda(entry.addenda98, '98');
      }
      if (entry.category === CategoryReturn) {
        if (!entry.addenda99) push(fieldError('Addenda99', ErrFieldInclusion));
        else enrichAddenda(entry.addenda99, '99');
        if (entry.addenda17.length > 0) push(fieldError('Addenda17', ErrFieldInclusion));
        if (entry.addenda18.length > 0) push(fieldError('Addenda18', ErrFieldInclusion));
      }
    }
    errors.push(...this.control.validateAll());
    return errors;
  }

  private countEntryAddenda(): number {
    let count = 0;
    for (const entry of this.entries) {
      count++; // entry itself
      if (entry.addenda10) count++;
      if (entry.addenda11) count++;
      if (entry.addenda12) count++;
      if (entry.addenda13) count++;
      if (entry.addenda14) count++;
      if (entry.addenda15) count++;
      if (entry.addenda16) count++;
      count += entry.addenda17.length + entry.addenda18.length;
      if (entry.addenda98) count++;
      if (entry.addenda99) count++;
    }
    return count;
  }

  private isBatchEntryCount(): [number, Error | null] {
    const count = this.countEntryAddenda();
    if (count !== this.control.entryAddendaCount) {
      if (this.validateOpts?.unequalAddendaCounts) return [count, null];
      return [count, this.error('EntryAddendaCount',
        new ErrBatchCalculatedControlEquality(count, this.control.entryAddendaCount))];
    }
    return [count, null];
  }

  private isBatchAmount(): Error | null {
    const [credit, debit] = this.calculateBatchAmounts();
    if (debit !== this.control.totalDebitEntryDollarAmount) {
      return this.error('TotalDebitEntryDollarAmount',
        new ErrBatchCalculatedControlEquality(debit, this.control.totalDebitEntryDollarAmount));
    }
    if (credit !== this.control.totalCreditEntryDollarAmount) {
      return this.error('TotalCreditEntryDollarAmount',
        new ErrBatchCalculatedControlEquality(credit, this.control.totalCreditEntryDollarAmount));
    }
    return null;
  }

  private calculateBatchAmounts(): [number, number] {
    let credit = 0, debit = 0;
    for (const entry of this.entries) {
      if (creditCodes.has(entry.transactionCode)) credit += entry.amount;
      else if (debitCodes.has(entry.transactionCode)) debit += entry.amount;
    }
    return [credit, debit];
  }

  private isSequenceAscending(): Error | null {
    let lastSeq = '-1';
    for (const entry of this.entries) {
      if (entry.traceNumber <= lastSeq) {
        return this.error('TraceNumber', new ErrBatchAscending(lastSeq, entry.traceNumber));
      }
      lastSeq = entry.traceNumber;
    }
    return null;
  }

  private isEntryHash(): Error | null {
    const hashField = this.calculateEntryHash();
    if (hashField !== this.control.entryHash) {
      return this.error('EntryHash',
        new ErrBatchCalculatedControlEquality(hashField, this.control.entryHash));
    }
    return null;
  }

  private calculateEntryHash(): number {
    let hash = 0;
    for (const entry of this.entries) {
      hash += parseInt(aba8(entry.rdfiIdentification), 10) || 0;
    }
    return converters.leastSignificantDigits(hash, 10);
  }

  private isTraceNumberODFI(): Error | null {
    if (this.validateOpts?.bypassOriginValidation) return null;
    for (const entry of this.entries) {
      if (this.header.odfiIdentificationField() !== entry.traceNumberField().substring(0, 8)) {
        return this.error('ODFIIdentificationField',
          new ErrBatchTraceNumberNotODFI(this.header.odfiIdentificationField(), entry.traceNumberField().substring(0, 8)));
      }
    }
    return null;
  }

  private isAddendaSequence(): Error | null {
    for (const entry of this.entries) {
      if (entry.addendaRecordIndicator !== 1) {
        return this.error('AddendaRecordIndicator', ErrIATBatchAddendaIndicator);
      }
      if (entry.isCorrection()) return null;

      const entryTN = entry.traceNumberField().substring(8);
      if (entry.addenda10 && entry.addenda10.entryDetailSequenceNumberField() !== entryTN) {
        return this.error('TraceNumber', new ErrBatchAddendaTraceNumber(entry.addenda10.entryDetailSequenceNumberField(), entryTN));
      }
      if (entry.addenda11 && entry.addenda11.entryDetailSequenceNumberField() !== entryTN) {
        return this.error('TraceNumber', new ErrBatchAddendaTraceNumber(entry.addenda11.entryDetailSequenceNumberField(), entryTN));
      }
      if (entry.addenda12 && entry.addenda12.entryDetailSequenceNumberField() !== entryTN) {
        return this.error('TraceNumber', new ErrBatchAddendaTraceNumber(entry.addenda12.entryDetailSequenceNumberField(), entryTN));
      }
      if (entry.addenda13 && entry.addenda13.entryDetailSequenceNumberField() !== entryTN) {
        return this.error('TraceNumber', new ErrBatchAddendaTraceNumber(entry.addenda13.entryDetailSequenceNumberField(), entryTN));
      }
      if (entry.addenda14 && entry.addenda14.entryDetailSequenceNumberField() !== entryTN) {
        return this.error('TraceNumber', new ErrBatchAddendaTraceNumber(entry.addenda14.entryDetailSequenceNumberField(), entryTN));
      }
      if (entry.addenda15 && entry.addenda15.entryDetailSequenceNumberField() !== entryTN) {
        return this.error('TraceNumber', new ErrBatchAddendaTraceNumber(entry.addenda15.entryDetailSequenceNumberField(), entryTN));
      }
      if (entry.addenda16 && entry.addenda16.entryDetailSequenceNumberField() !== entryTN) {
        return this.error('TraceNumber', new ErrBatchAddendaTraceNumber(entry.addenda16.entryDetailSequenceNumberField(), entryTN));
      }

      let lastA17Seq = -1;
      for (const a17 of entry.addenda17) {
        if (a17.sequenceNumber < lastA17Seq) {
          return this.error('SequenceNumber', new ErrBatchAscending(lastA17Seq, a17.sequenceNumber));
        }
        lastA17Seq = a17.sequenceNumber;
        if (a17.entryDetailSequenceNumberField() !== entryTN) {
          return this.error('TraceNumber', new ErrBatchAddendaTraceNumber(a17.entryDetailSequenceNumberField(), entryTN));
        }
      }

      let lastA18Seq = -1;
      for (const a18 of entry.addenda18) {
        if (a18.sequenceNumber < lastA18Seq) {
          return this.error('SequenceNumber', new ErrBatchAscending(lastA18Seq, a18.sequenceNumber));
        }
        lastA18Seq = a18.sequenceNumber;
        if (a18.entryDetailSequenceNumberField() !== entryTN) {
          return this.error('TraceNumber', new ErrBatchAddendaTraceNumber(a18.entryDetailSequenceNumberField(), entryTN));
        }
      }
    }
    return null;
  }

  private isCategory(): Error | null {
    if (this.entries.length === 0) return null;
    const category = this.entries[0].category;
    for (let i = 1; i < this.entries.length; i++) {
      if (this.entries[i].category === CategoryNOC) continue;
      if (this.entries[i].category !== category) {
        return this.error('Category', new ErrBatchCategory(this.entries[i].category, category));
      }
    }
    return null;
  }

  private addendaFieldInclusion(entry: IATEntryDetail): Error | null {
    if (entry.isCorrection()) return null;
    if (!entry.addenda10) return fieldError('Addenda10', ErrFieldInclusion);
    if (!entry.addenda11) return fieldError('Addenda11', ErrFieldInclusion);
    if (!entry.addenda12) return fieldError('Addenda12', ErrFieldInclusion);
    if (!entry.addenda13) return fieldError('Addenda13', ErrFieldInclusion);
    if (!entry.addenda14) return fieldError('Addenda14', ErrFieldInclusion);
    if (!entry.addenda15) return fieldError('Addenda15', ErrFieldInclusion);
    if (!entry.addenda16) return fieldError('Addenda16', ErrFieldInclusion);
    return null;
  }
}
