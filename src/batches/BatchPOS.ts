import { Batch, registerBatchType } from '../batch.js';
import type { InvalidEntry } from '../batch.js';
import { POS, CategoryForward } from '../constants.js';
import { ErrBatchSECType, ErrBatchInvalidCardTransactionType, ErrValidState } from '../errors/index.js';
import { usStateValid } from '../utils/validators.js';

export class BatchPOS extends Batch {
  validate(): Error | null {
    if (this.validateOpts?.skipAll || this.validateOpts?.bypassBatchValidation) return null;
    const err = this.verify();
    if (err) return err;
    if (this.header.standardEntryClassCode !== POS) {
      return this.batchError('StandardEntryClassCode', ErrBatchSECType, POS);
    }
    const invalid = this.invalidEntries();
    if (invalid.length > 0) return invalid[0].error;
    return null;
  }

  invalidEntries(): InvalidEntry[] {
    const out: InvalidEntry[] = [];
    for (const entry of this.entries) {
      if (this.validators.isCardTransactionType(entry.discretionaryData)) {
        out.push({ entry, error: this.batchError('CardTransactionType', ErrBatchInvalidCardTransactionType, entry.discretionaryData) });
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
    }
    return out;
  }

  create(): Error | null {
    const err = this.build();
    if (err) return err;
    return this.validate();
  }
}

registerBatchType(POS, (b: Batch) => Object.setPrototypeOf(b, BatchPOS.prototype) as BatchPOS);
