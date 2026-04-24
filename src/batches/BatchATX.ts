import { Batch, registerBatchType } from '../batch.js';
import type { InvalidEntry } from '../batch.js';
import { ATX, CheckingZeroDollarRemittanceCredit, SavingsZeroDollarRemittanceCredit, CheckingReturnNOCCredit } from '../constants.js';
import { ErrBatchSECType, ErrBatchAmountNonZero, ErrBatchTransactionCode, ErrBatchAddendaCount, ErrBatchExpectedAddendaCount } from '../errors/index.js';

export class BatchATX extends Batch {
  validate(): Error | null {
    if (this.validateOpts?.skipAll || this.validateOpts?.bypassBatchValidation) return null;
    const err = this.verify();
    if (err) return err;
    if (this.header.standardEntryClassCode !== ATX) {
      return this.batchError('StandardEntryClassCode', ErrBatchSECType, ATX);
    }
    const invalid = this.invalidEntries();
    if (invalid.length > 0) return invalid[0].error;
    return null;
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
}

registerBatchType(ATX, (b: Batch) => Object.setPrototypeOf(b, BatchATX.prototype) as BatchATX);
