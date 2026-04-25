import { isSkipped, applyErrorLevels } from '../validateOpts.js';
import { Batch, registerBatchType } from '../batch.js';
import type { Batcher, InvalidEntry } from '../batch.js';
import { ACK, CheckingZeroDollarRemittanceCredit, SavingsZeroDollarRemittanceCredit } from '../constants.js';
import { ErrBatchSECType, ErrBatchAmountNonZero, ErrBatchTransactionCode, ErrBatchAddendaCount } from '../errors/index.js';

export class BatchACK extends Batch {
  validate(): Error | null {
    if (isSkipped(this.validateOpts, 'skipAll') || isSkipped(this.validateOpts, 'bypassBatchValidation')) return null;
    const err = this.verify();
    if (err) return err;
    if (this.header.standardEntryClassCode !== ACK) {
      return this.batchError('StandardEntryClassCode', ErrBatchSECType, ACK);
    }
    const invalid = this.invalidEntries();
    if (invalid.length > 0) return invalid[0].error;
    return null;
  }

  validateAll(): Error[] {
    if (isSkipped(this.validateOpts, 'skipAll') || isSkipped(this.validateOpts, 'bypassBatchValidation')) return [];
    const errors = this.verifyAll();
    if (this.header.standardEntryClassCode !== ACK) {
      errors.push(this.batchError('StandardEntryClassCode', ErrBatchSECType, ACK));
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
      if (entry.addenda05.length > 1) {
        out.push({ entry, error: this.batchError('AddendaCount', new ErrBatchAddendaCount(entry.addenda05.length, 1)) });
      }
      switch (entry.transactionCode) {
        case CheckingZeroDollarRemittanceCredit: case SavingsZeroDollarRemittanceCredit: break;
        default:
          out.push({ entry, error: this.batchError('TransactionCode', ErrBatchTransactionCode, entry.transactionCode) });
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

  static from(b: Batch): BatchACK {
    const inst = new BatchACK();
    Batch.copyFrom(b, inst);
    return inst;
  }
}

export function newBatchACK(bh: import('../batchHeader.js').BatchHeader): BatchACK {
  const batch = new BatchACK(bh);
  batch.setControl(new (Object.getPrototypeOf(batch.getControl()).constructor)());
  batch.setID(bh.id);
  return batch;
}

registerBatchType(ACK, (b: Batch) => BatchACK.from(b));
