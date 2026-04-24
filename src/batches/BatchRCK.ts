import { Batch, registerBatchType } from '../batch.js';
import type { InvalidEntry } from '../batch.js';
import { RCK, CreditsOnly } from '../constants.js';
import { ErrBatchSECType, ErrBatchServiceClassCode, ErrBatchDebitOnly, ErrBatchCheckSerialNumber, ErrBatchAmount, ErrBatchCompanyEntryDescriptionREDEPCHECK } from '../errors/index.js';

export class BatchRCK extends Batch {
  validate(): Error | null {
    if (this.validateOpts?.skipAll || this.validateOpts?.bypassBatchValidation) return null;
    const err = this.verify();
    if (err) return err;
    if (this.header.standardEntryClassCode !== RCK) {
      return this.batchError('StandardEntryClassCode', ErrBatchSECType, RCK);
    }
    if (this.header.serviceClassCode === CreditsOnly) {
      return this.batchError('ServiceClassCode', ErrBatchServiceClassCode, this.header.serviceClassCode);
    }
    if (this.header.companyEntryDescription !== 'REDEPCHECK') {
      return this.batchError('CompanyEntryDescription', ErrBatchCompanyEntryDescriptionREDEPCHECK, this.header.companyEntryDescription);
    }
    const invalid = this.invalidEntries();
    if (invalid.length > 0) return invalid[0].error;
    return null;
  }

  validateAll(): Error[] {
    if (this.validateOpts?.skipAll || this.validateOpts?.bypassBatchValidation) return [];
    const errors = this.verifyAll();
    if (this.header.standardEntryClassCode !== RCK) {
      errors.push(this.batchError('StandardEntryClassCode', ErrBatchSECType, RCK));
    }
    if (this.header.serviceClassCode === CreditsOnly) {
      errors.push(this.batchError('ServiceClassCode', ErrBatchServiceClassCode, this.header.serviceClassCode));
    }
    if (this.header.companyEntryDescription !== 'REDEPCHECK') {
      errors.push(this.batchError('CompanyEntryDescription', ErrBatchCompanyEntryDescriptionREDEPCHECK, this.header.companyEntryDescription));
    }
    for (const inv of this.invalidEntries()) errors.push(inv.error);
    return errors;
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
      if (entry.identificationNumber === '') {
        out.push({ entry, error: this.batchError('CheckSerialNumber', ErrBatchCheckSerialNumber) });
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

registerBatchType(RCK, (b: Batch) => Object.setPrototypeOf(b, BatchRCK.prototype) as BatchRCK);
