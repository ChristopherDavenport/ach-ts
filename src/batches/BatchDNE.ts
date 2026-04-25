import { Batch, registerBatchType } from '../batch.js';
import type { InvalidEntry } from '../batch.js';
import { DNE, CheckingPrenoteCredit, SavingsPrenoteCredit } from '../constants.js';
import { ErrBatchSECType, ErrBatchAmountNonZero, ErrBatchTransactionCode, ErrBatchAddendaCount } from '../errors/index.js';

export class BatchDNE extends Batch {
  validate(): Error | null {
    if (this.validateOpts?.skipAll || this.validateOpts?.bypassBatchValidation) return null;
    const err = this.verify();
    if (err) return err;
    if (this.header.standardEntryClassCode !== DNE) {
      return this.batchError('StandardEntryClassCode', ErrBatchSECType, DNE);
    }
    const invalid = this.invalidEntries();
    if (invalid.length > 0) return invalid[0].error;
    return null;
  }

  validateAll(): Error[] {
    if (this.validateOpts?.skipAll || this.validateOpts?.bypassBatchValidation) return [];
    const errors = this.verifyAll();
    if (this.header.standardEntryClassCode !== DNE) {
      errors.push(this.batchError('StandardEntryClassCode', ErrBatchSECType, DNE));
    }
    for (const inv of this.invalidEntries()) errors.push(inv.error);
    return errors;
  }

  invalidEntries(): InvalidEntry[] {
    const out: InvalidEntry[] = [];
    for (const entry of this.entries) {
      if (entry.amount !== 0) {
        out.push({ entry, error: this.batchError('Amount', ErrBatchAmountNonZero, entry.amount) });
      }
      switch (entry.transactionCode) {
        case CheckingPrenoteCredit: case SavingsPrenoteCredit: break;
        default:
          out.push({ entry, error: this.batchError('TransactionCode', ErrBatchTransactionCode, entry.transactionCode) });
      }
      if (entry.addenda05.length !== 1) {
        out.push({ entry, error: this.batchError('AddendaCount', new ErrBatchAddendaCount(entry.addenda05.length, 1)) });
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

  static from(b: Batch): BatchDNE {
    const inst = new BatchDNE();
    Batch.copyFrom(b, inst);
    return inst;
  }
}

registerBatchType(DNE, (b: Batch) => BatchDNE.from(b));
