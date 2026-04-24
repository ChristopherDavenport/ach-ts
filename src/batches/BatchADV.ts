import { Batch, registerBatchType } from '../batch.js';
import type { InvalidEntry } from '../batch.js';
import { ADV, AutomatedAccountingAdvices, CategoryForward,
  CreditForDebitsOriginated, DebitForCreditsOriginated,
  CreditForCreditsReceived, DebitForDebitsReceived,
  CreditForCreditsRejected, DebitForDebitsRejectedBatches,
  CreditSummary, DebitSummary,
} from '../constants.js';
import { ErrBatchSECType, ErrBatchServiceClassCode, ErrBatchTransactionCode, ErrBatchAddendaCategory, ErrOrigStatusCode } from '../errors/index.js';
import { newADVBatchControl } from '../advBatchControl.js';

export class BatchADV extends Batch {
  validate(): Error | null {
    if (this.validateOpts?.skipAll || this.validateOpts?.bypassBatchValidation) return null;
    if (this.header.standardEntryClassCode !== ADV) {
      return this.batchError('StandardEntryClassCode', ErrBatchSECType, ADV);
    }
    if (this.header.serviceClassCode !== AutomatedAccountingAdvices) {
      return this.batchError('ServiceClassCode', ErrBatchServiceClassCode, this.header.serviceClassCode);
    }
    if (this.header.originatorStatusCode !== 0) {
      return this.batchError('OriginatorStatusCode', ErrOrigStatusCode, this.header.originatorStatusCode);
    }
    const err = this.verify();
    if (err) return err;
    const invalid = this.invalidEntries();
    if (invalid.length > 0) return invalid[0].error;
    return null;
  }

  invalidEntries(): InvalidEntry[] {
    const out: InvalidEntry[] = [];
    for (const entry of this.advEntries) {
      if (entry.category === CategoryForward) {
        switch (entry.transactionCode) {
          case CreditForDebitsOriginated: case CreditForCreditsReceived:
          case CreditForCreditsRejected: case CreditSummary:
          case DebitForCreditsOriginated: case DebitForDebitsReceived:
          case DebitForDebitsRejectedBatches: case DebitSummary:
            break;
          default:
            out.push({ advEntry: entry, error: this.batchError('TransactionCode', ErrBatchTransactionCode, entry.transactionCode) });
        }
        // Forward entries cannot have Addenda99
        // ADV TS doesn't track addenda99 on ADVEntryDetail yet
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

export function newBatchADV(bh: import('../batchHeader.js').BatchHeader): BatchADV {
  const batch = new BatchADV(bh);
  batch.setADVControl(newADVBatchControl());
  batch.setID(bh.id);
  return batch;
}

registerBatchType(ADV, (b: Batch) => Object.setPrototypeOf(b, BatchADV.prototype) as BatchADV);
