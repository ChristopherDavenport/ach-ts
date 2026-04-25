import { Batch, registerBatchType } from '../batch.js';
import type { InvalidEntry } from '../batch.js';
import { CTX, CheckingPrenoteCredit, CheckingPrenoteDebit, SavingsPrenoteCredit, SavingsPrenoteDebit, GLPrenoteCredit, GLPrenoteDebit, LoanPrenoteCredit } from '../constants.js';
import { ErrBatchSECType, ErrBatchTransactionCode, ErrBatchAddendaCount, ErrBatchExpectedAddendaCount } from '../errors/index.js';

export class BatchCTX extends Batch {
  validate(): Error | null {
    if (this.validateOpts?.skipAll || this.validateOpts?.bypassBatchValidation) return null;
    const err = this.verify();
    if (err) return err;
    if (this.header.standardEntryClassCode !== CTX) {
      return this.batchError('StandardEntryClassCode', ErrBatchSECType, CTX);
    }
    const invalid = this.invalidEntries();
    if (invalid.length > 0) return invalid[0].error;
    return null;
  }

  validateAll(): Error[] {
    if (this.validateOpts?.skipAll || this.validateOpts?.bypassBatchValidation) return [];
    const errors = this.verifyAll();
    if (this.header.standardEntryClassCode !== CTX) {
      errors.push(this.batchError('StandardEntryClassCode', ErrBatchSECType, CTX));
    }
    for (const inv of this.invalidEntries()) errors.push(inv.error);
    return errors;
  }

  invalidEntries(): InvalidEntry[] {
    const out: InvalidEntry[] = [];
    for (const entry of this.entries) {
      let addendaCount = entry.addenda05.length;
      if (addendaCount > 9999) {
        out.push({ entry, error: this.batchError('AddendaCount', new ErrBatchAddendaCount(addendaCount, 9999)) });
      }
      // Add correction/return addenda to count for indicator comparison
      if (entry.addenda98) addendaCount++;
      if (entry.addenda99) addendaCount++;

      const indicator = parseInt(entry.catxAddendaRecordsField(), 10) || 0;
      if (addendaCount !== indicator) {
        if (!this.validateOpts?.unequalAddendaCounts) {
          out.push({ entry, error: this.batchError('AddendaCount', new ErrBatchExpectedAddendaCount(addendaCount, indicator)) });
        }
      }
      // Prenotes must have zero amount
      switch (entry.transactionCode) {
        case CheckingPrenoteCredit: case CheckingPrenoteDebit:
        case SavingsPrenoteCredit: case SavingsPrenoteDebit:
        case GLPrenoteCredit: case GLPrenoteDebit: case LoanPrenoteCredit:
          if (entry.amount !== 0) {
            out.push({ entry, error: this.batchError('TransactionCode', ErrBatchTransactionCode, entry.transactionCode) });
          }
          break;
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

  static from(b: Batch): BatchCTX {
    const inst = new BatchCTX();
    Batch.copyFrom(b, inst);
    return inst;
  }
}

registerBatchType(CTX, (b: Batch) => BatchCTX.from(b));
