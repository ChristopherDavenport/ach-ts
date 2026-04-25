import { Batch, registerBatchType } from '../batch.js';
import type { InvalidEntry } from '../batch.js';
import { TRX, CreditsOnly } from '../constants.js';
import { ErrBatchSECType, ErrBatchServiceClassCode, ErrBatchDebitOnly, ErrBatchAddendaCount, ErrBatchExpectedAddendaCount } from '../errors/index.js';

export class BatchTRX extends Batch {
  validate(): Error | null {
    if (this.validateOpts?.skipAll || this.validateOpts?.bypassBatchValidation) return null;
    const err = this.verify();
    if (err) return err;
    if (this.header.standardEntryClassCode !== TRX) {
      return this.batchError('StandardEntryClassCode', ErrBatchSECType, TRX);
    }
    if (this.header.serviceClassCode === CreditsOnly) {
      return this.batchError('ServiceClassCode', ErrBatchServiceClassCode, this.header.serviceClassCode);
    }
    const invalid = this.invalidEntries();
    if (invalid.length > 0) return invalid[0].error;
    return null;
  }

  validateAll(): Error[] {
    if (this.validateOpts?.skipAll || this.validateOpts?.bypassBatchValidation) return [];
    const errors = this.verifyAll();
    if (this.header.standardEntryClassCode !== TRX) {
      errors.push(this.batchError('StandardEntryClassCode', ErrBatchSECType, TRX));
    }
    if (this.header.serviceClassCode === CreditsOnly) {
      errors.push(this.batchError('ServiceClassCode', ErrBatchServiceClassCode, this.header.serviceClassCode));
    }
    for (const inv of this.invalidEntries()) errors.push(inv.error);
    return errors;
  }

  invalidEntries(): InvalidEntry[] {
    const out: InvalidEntry[] = [];
    for (const entry of this.entries) {
      if (entry.creditOrDebit() !== 'D') {
        out.push({ entry, error: this.batchError('TransactionCode', ErrBatchDebitOnly, entry.transactionCode) });
      }
      if (entry.addenda05.length > 9999) {
        out.push({ entry, error: this.batchError('AddendaCount', new ErrBatchAddendaCount(entry.addenda05.length, 9999)) });
      }
      const addendaRecords = parseInt(entry.catxAddendaRecordsField(), 10) || 0;
      if (entry.addenda05.length !== addendaRecords) {
        out.push({ entry, error: this.batchError('AddendaCount', new ErrBatchExpectedAddendaCount(entry.addenda05.length, addendaRecords)) });
      }
      let err = this.validAmountForCodes(entry);
      if (err) out.push({ entry, error: err });
      err = this.validTranCodeForServiceClassCode(entry);
      if (err) out.push({ entry, error: err });
      err = this.addendaFieldInclusion(entry);
      if (err) out.push({ entry, error: err });
    }
    return out;
  }

  create(): Error | null {
    const err = this.build();
    if (err) return err;
    return this.validate();
  }

  static from(b: Batch): BatchTRX {
    const inst = new BatchTRX();
    Batch.copyFrom(b, inst);
    return inst;
  }
}

registerBatchType(TRX, (b: Batch) => BatchTRX.from(b));
