import { isSkipped, applyErrorLevels } from '../validateOpts.js';
import { Batch, registerBatchType } from '../batch.js';
import type { InvalidEntry } from '../batch.js';
import { ATX, CheckingZeroDollarRemittanceCredit, SavingsZeroDollarRemittanceCredit, CheckingReturnNOCCredit } from '../constants.js';
import { ErrBatchSECType, ErrBatchAmountNonZero, ErrBatchTransactionCode, ErrBatchAddendaCount, ErrBatchExpectedAddendaCount } from '../errors/index.js';

export class BatchATX extends Batch {
  validate(): Error | null {
    if (isSkipped(this.validateOpts, 'skipAll') || isSkipped(this.validateOpts, 'bypassBatchValidation')) return null;
    const err = this.verify();
    if (err) return err;
    if (this.header.standardEntryClassCode !== ATX) {
      return this.batchError('StandardEntryClassCode', ErrBatchSECType, ATX);
    }
    const invalid = this.invalidEntries();
    if (invalid.length > 0) return invalid[0].error;
    return null;
  }

  validateAll(): Error[] {
    if (isSkipped(this.validateOpts, 'skipAll') || isSkipped(this.validateOpts, 'bypassBatchValidation')) return [];
    const errors = this.verifyAll();
    if (this.header.standardEntryClassCode !== ATX) {
      errors.push(this.batchError('StandardEntryClassCode', ErrBatchSECType, ATX));
    }
    for (const inv of this.invalidEntries()) errors.push(inv.error);
    return applyErrorLevels(errors, this.validateOpts);
  }

  invalidEntries(): InvalidEntry[] {
    const out: InvalidEntry[] = [];
    for (const entry of this.entries) {
      if (entry.amount > 0) {
        out.push({ entry, error: this.batchError('Amount', ErrBatchAmountNonZero, entry.amount) });
      }
      switch (entry.transactionCode) {
        case CheckingZeroDollarRemittanceCredit: case SavingsZeroDollarRemittanceCredit: case CheckingReturnNOCCredit: break;
        default:
          out.push({ entry, error: this.batchError('TransactionCode', ErrBatchTransactionCode, entry.transactionCode) });
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

  static from(b: Batch): BatchATX {
    const inst = new BatchATX();
    Batch.copyFrom(b, inst);
    return inst;
  }
}

registerBatchType(ATX, (b: Batch) => BatchATX.from(b));
