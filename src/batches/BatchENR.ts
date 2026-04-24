import { Batch, registerBatchType } from '../batch.js';
import type { InvalidEntry } from '../batch.js';
import { ENR, CheckingPrenoteCredit, SavingsPrenoteCredit, CheckingReturnNOCCredit, SavingsReturnNOCCredit } from '../constants.js';
import { ErrBatchSECType, ErrBatchAmountNonZero, ErrBatchTransactionCode, ErrBatchCompanyEntryDescriptionAutoenroll } from '../errors/index.js';

export class BatchENR extends Batch {
  validate(): Error | null {
    if (this.validateOpts?.skipAll || this.validateOpts?.bypassBatchValidation) return null;
    const err = this.verify();
    if (err) return err;
    if (this.header.standardEntryClassCode !== ENR) {
      return this.batchError('StandardEntryClassCode', ErrBatchSECType, ENR);
    }
    if (this.header.companyEntryDescription !== 'AUTOENROLL') {
      return this.batchError('CompanyEntryDescription', ErrBatchCompanyEntryDescriptionAutoenroll, this.header.companyEntryDescription);
    }
    const invalid = this.invalidEntries();
    if (invalid.length > 0) return invalid[0].error;
    return null;
  }

  invalidEntries(): InvalidEntry[] {
    const out: InvalidEntry[] = [];
    for (const entry of this.entries) {
      if (entry.amount !== 0) {
        out.push({ entry, error: this.batchError('Amount', ErrBatchAmountNonZero, entry.amount) });
      }
      switch (entry.transactionCode) {
        case CheckingPrenoteCredit: case SavingsPrenoteCredit:
        case CheckingReturnNOCCredit: case SavingsReturnNOCCredit:
          break;
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
}

registerBatchType(ENR, (b: Batch) => Object.setPrototypeOf(b, BatchENR.prototype) as BatchENR);
