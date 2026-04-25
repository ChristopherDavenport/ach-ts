import { isSkipped, applyErrorLevels } from '../validateOpts.js';
import { Batch, registerBatchType } from '../batch.js';
import type { InvalidEntry } from '../batch.js';
import { XCK, CreditsOnly } from '../constants.js';
import { ErrBatchSECType, ErrBatchServiceClassCode, ErrBatchDebitOnly, ErrBatchAmount, ErrFieldRequired } from '../errors/index.js';

export class BatchXCK extends Batch {
  validate(): Error | null {
    if (isSkipped(this.validateOpts, 'skipAll') || isSkipped(this.validateOpts, 'bypassBatchValidation')) return null;
    const err = this.verify();
    if (err) return err;
    if (this.header.standardEntryClassCode !== XCK) {
      return this.batchError('StandardEntryClassCode', ErrBatchSECType, XCK);
    }
    if (this.header.serviceClassCode === CreditsOnly) {
      return this.batchError('ServiceClassCode', ErrBatchServiceClassCode, this.header.serviceClassCode);
    }
    const invalid = this.invalidEntries();
    if (invalid.length > 0) return invalid[0].error;
    return null;
  }

  validateAll(): Error[] {
    if (isSkipped(this.validateOpts, 'skipAll') || isSkipped(this.validateOpts, 'bypassBatchValidation')) return [];
    const errors = this.verifyAll();
    if (this.header.standardEntryClassCode !== XCK) {
      errors.push(this.batchError('StandardEntryClassCode', ErrBatchSECType, XCK));
    }
    if (this.header.serviceClassCode === CreditsOnly) {
      errors.push(this.batchError('ServiceClassCode', ErrBatchServiceClassCode, this.header.serviceClassCode));
    }
    for (const inv of this.invalidEntries()) errors.push(inv.error);
    return applyErrorLevels(errors, this.validateOpts);
  }

  invalidEntries(): InvalidEntry[] {
    const out: InvalidEntry[] = [];
    for (const entry of this.entries) {
      if (entry.creditOrDebit() !== 'D') {
        out.push({ entry, error: this.batchError('TransactionCode', ErrBatchDebitOnly, entry.transactionCode) });
      }
      if (entry.amount > 250000) {
        out.push({ entry, error: this.batchError('Amount', new ErrBatchAmount(entry.amount, 250000)) });
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

  static from(b: Batch): BatchXCK {
    const inst = new BatchXCK();
    Batch.copyFrom(b, inst);
    return inst;
  }
}

registerBatchType(XCK, (b: Batch) => BatchXCK.from(b));
