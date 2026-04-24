import { Batch, registerBatchType } from '../batch.js';
import type { InvalidEntry } from '../batch.js';
import { CIE, DebitsOnly } from '../constants.js';
import { ErrBatchSECType, ErrBatchServiceClassCode, ErrBatchDebitOnly, ErrBatchAddendaCount } from '../errors/index.js';

export class BatchCIE extends Batch {
  validate(): Error | null {
    if (this.validateOpts?.skipAll || this.validateOpts?.bypassBatchValidation) return null;
    const err = this.verify();
    if (err) return err;
    if (this.header.standardEntryClassCode !== CIE) {
      return this.batchError('StandardEntryClassCode', ErrBatchSECType, CIE);
    }
    if (this.header.serviceClassCode === DebitsOnly) {
      return this.batchError('ServiceClassCode', ErrBatchServiceClassCode, this.header.serviceClassCode);
    }
    const invalid = this.invalidEntries();
    if (invalid.length > 0) return invalid[0].error;
    return null;
  }

  invalidEntries(): InvalidEntry[] {
    const out: InvalidEntry[] = [];
    for (const entry of this.entries) {
      // CIE must be credits only
      if (entry.creditOrDebit() !== 'C') {
        out.push({ entry, error: this.batchError('TransactionCode', ErrBatchDebitOnly, entry.transactionCode) });
      }
      if (entry.addenda05.length > 1) {
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
}

registerBatchType(CIE, (b: Batch) => Object.setPrototypeOf(b, BatchCIE.prototype) as BatchCIE);
