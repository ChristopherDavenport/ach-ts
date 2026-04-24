import { Batch, registerBatchType } from '../batch.js';
import type { InvalidEntry } from '../batch.js';
import { TRC, CreditsOnly } from '../constants.js';
import { ErrBatchSECType, ErrBatchServiceClassCode, ErrBatchDebitOnly, ErrFieldRequired } from '../errors/index.js';

export class BatchTRC extends Batch {
  validate(): Error | null {
    if (this.validateOpts?.skipAll || this.validateOpts?.bypassBatchValidation) return null;
    const err = this.verify();
    if (err) return err;
    if (this.header.standardEntryClassCode !== TRC) {
      return this.batchError('StandardEntryClassCode', ErrBatchSECType, TRC);
    }
    if (this.header.serviceClassCode === CreditsOnly) {
      return this.batchError('ServiceClassCode', ErrBatchServiceClassCode, this.header.serviceClassCode);
    }
    const invalid = this.invalidEntries();
    if (invalid.length > 0) return invalid[0].error;
    return null;
  }

  invalidEntries(): InvalidEntry[] {
    const out: InvalidEntry[] = [];
    for (const entry of this.entries) {
      if (entry.creditOrDebit() !== 'D') {
        out.push({ entry, error: this.batchError('TransactionCode', ErrBatchDebitOnly, entry.transactionCode) });
      }
      if (entry.processControlField() === '') {
        out.push({ entry, error: this.batchError('ProcessControlField', ErrFieldRequired) });
      }
      if (entry.itemResearchNumber() === '') {
        out.push({ entry, error: this.batchError('ItemResearchNumber', ErrFieldRequired) });
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

registerBatchType(TRC, (b: Batch) => Object.setPrototypeOf(b, BatchTRC.prototype) as BatchTRC);
