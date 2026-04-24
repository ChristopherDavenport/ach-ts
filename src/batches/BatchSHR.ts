import { Batch, registerBatchType } from '../batch.js';
import type { InvalidEntry } from '../batch.js';
import { SHR, MixedDebitsAndCredits, CreditsOnly, DebitsOnly, CategoryForward } from '../constants.js';
import { ErrBatchSECType, ErrBatchServiceClassCode, ErrBatchTransactionCode, ErrBatchInvalidCardTransactionType, ErrValidMonth, ErrValidYear, ErrValidState, fieldError } from '../errors/index.js';
import { usStateValid } from '../utils/validators.js';

export class BatchSHR extends Batch {
  validate(): Error | null {
    if (this.validateOpts?.skipAll || this.validateOpts?.bypassBatchValidation) return null;
    const err = this.verify();
    if (err) return err;
    if (this.header.standardEntryClassCode !== SHR) {
      return this.batchError('StandardEntryClassCode', ErrBatchSECType, SHR);
    }
    switch (this.header.serviceClassCode) {
      case MixedDebitsAndCredits: case CreditsOnly: case DebitsOnly: break;
      default:
        return this.batchError('ServiceClassCode', ErrBatchServiceClassCode, this.header.serviceClassCode);
    }
    const invalid = this.invalidEntries();
    if (invalid.length > 0) return invalid[0].error;
    return null;
  }

  validateAll(): Error[] {
    if (this.validateOpts?.skipAll || this.validateOpts?.bypassBatchValidation) return [];
    const errors = this.verifyAll();
    if (this.header.standardEntryClassCode !== SHR) {
      errors.push(this.batchError('StandardEntryClassCode', ErrBatchSECType, SHR));
    }
    switch (this.header.serviceClassCode) {
      case MixedDebitsAndCredits: case CreditsOnly: case DebitsOnly: break;
      default:
        errors.push(this.batchError('ServiceClassCode', ErrBatchServiceClassCode, this.header.serviceClassCode));
    }
    for (const inv of this.invalidEntries()) errors.push(inv.error);
    return errors;
  }

  invalidEntries(): InvalidEntry[] {
    const out: InvalidEntry[] = [];
    for (const entry of this.entries) {
      const cd = entry.creditOrDebit();
      if (cd !== 'C' && cd !== 'D') {
        out.push({ entry, error: this.batchError('TransactionCode', ErrBatchTransactionCode, entry.transactionCode) });
      }
      if (this.validators.isCardTransactionType(entry.discretionaryData)) {
        out.push({ entry, error: this.batchError('CardTransactionType', ErrBatchInvalidCardTransactionType, entry.discretionaryData) });
      }
      // CardExpirationDate MMYY
      const expDate = entry.shrCardExpirationDateField();
      const month = this.converters.parseStringField(expDate.substring(0, 2));
      const year = this.converters.parseStringField(expDate.substring(2, 4));
      if (this.validators.isMonth(month)) {
        out.push({ entry, error: fieldError('CardExpirationDate', ErrValidMonth, month)! });
      }
      if (this.validators.isCreditCardYear(year)) {
        out.push({ entry, error: fieldError('CardExpirationDate', ErrValidYear, year)! });
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

registerBatchType(SHR, (b: Batch) => Object.setPrototypeOf(b, BatchSHR.prototype) as BatchSHR);
