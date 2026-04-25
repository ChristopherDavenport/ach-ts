import { Batch, registerBatchType } from '../batch.js';
import type { InvalidEntry } from '../batch.js';
import { MTE, CategoryForward } from '../constants.js';
import { ErrBatchSECType, ErrBatchAmountZero, ErrIdentificationNumber, ErrValidState } from '../errors/index.js';
import { usStateValid } from '../utils/validators.js';

export class BatchMTE extends Batch {
  validate(): Error | null {
    if (this.validateOpts?.skipAll || this.validateOpts?.bypassBatchValidation) return null;
    const err = this.verify();
    if (err) return err;
    if (this.header.standardEntryClassCode !== MTE) {
      return this.batchError('StandardEntryClassCode', ErrBatchSECType, MTE);
    }
    const invalid = this.invalidEntries();
    if (invalid.length > 0) return invalid[0].error;
    return null;
  }

  validateAll(): Error[] {
    if (this.validateOpts?.skipAll || this.validateOpts?.bypassBatchValidation) return [];
    const errors = this.verifyAll();
    if (this.header.standardEntryClassCode !== MTE) {
      errors.push(this.batchError('StandardEntryClassCode', ErrBatchSECType, MTE));
    }
    for (const inv of this.invalidEntries()) errors.push(inv.error);
    return errors;
  }

  invalidEntries(): InvalidEntry[] {
    const out: InvalidEntry[] = [];
    for (const entry of this.entries) {
      if (entry.amount <= 0) {
        out.push({ entry, error: this.batchError('Amount', ErrBatchAmountZero, entry.amount) });
      }
      let err = this.validAmountForCodes(entry);
      if (err) out.push({ entry, error: err });
      err = this.validTranCodeForServiceClassCode(entry);
      if (err) out.push({ entry, error: err });
      err = this.addendaFieldInclusion(entry);
      if (err) out.push({ entry, error: err });
      if (entry.category === CategoryForward && entry.addenda02) {
        if (!usStateValid(entry.addenda02.terminalState)) {
          out.push({ entry, error: this.batchError('TerminalState', ErrValidState, entry.addenda02.terminalState) });
        }
      }
      // MTE entries cannot have identification number that is all spaces or zeros
      if (entry.identificationNumber.replace(/[ 0]/g, '') === '') {
        out.push({ entry, error: this.batchError('IdentificationNumber', ErrIdentificationNumber, entry.identificationNumber) });
      }
    }
    return out;
  }

  create(): Error | null {
    const err = this.build();
    if (err) return err;
    return this.validate();
  }

  static from(b: Batch): BatchMTE {
    const inst = new BatchMTE();
    Batch.copyFrom(b, inst);
    return inst;
  }
}

registerBatchType(MTE, (b: Batch) => BatchMTE.from(b));
