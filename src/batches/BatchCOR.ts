import { Batch, registerBatchType } from '../batch.js';
import type { InvalidEntry } from '../batch.js';
import { COR,
  CheckingCredit, CheckingDebit, CheckingPrenoteCredit, CheckingPrenoteDebit,
  CheckingZeroDollarRemittanceCredit, CheckingZeroDollarRemittanceDebit,
  SavingsCredit, SavingsDebit, SavingsPrenoteCredit, SavingsPrenoteDebit,
  SavingsZeroDollarRemittanceCredit, SavingsZeroDollarRemittanceDebit,
  GLCredit, GLDebit, GLPrenoteCredit, GLPrenoteDebit,
  GLZeroDollarRemittanceCredit, GLZeroDollarRemittanceDebit,
  LoanCredit, LoanDebit, LoanPrenoteCredit, LoanZeroDollarRemittanceCredit,
} from '../constants.js';
import { ErrBatchSECType, ErrBatchAmountNonZero, ErrBatchTransactionCode, ErrBatchCORAddenda } from '../errors/index.js';

export class BatchCOR extends Batch {
  validate(): Error | null {
    if (this.validateOpts?.skipAll || this.validateOpts?.bypassBatchValidation) return null;
    const err = this.verify();
    if (err) return err;
    const addenda98Err = this.isAddenda98();
    if (addenda98Err) return addenda98Err;
    if (this.header.standardEntryClassCode !== COR) {
      return this.batchError('StandardEntryClassCode', ErrBatchSECType, COR);
    }
    if (this.control.totalCreditEntryDollarAmount !== 0) {
      return this.batchError('TotalCreditEntryDollarAmount', ErrBatchAmountNonZero, this.control.totalCreditEntryDollarAmount);
    }
    if (this.control.totalDebitEntryDollarAmount !== 0) {
      return this.batchError('TotalDebitEntryDollarAmount', ErrBatchAmountNonZero, this.control.totalDebitEntryDollarAmount);
    }
    const invalid = this.invalidEntries();
    if (invalid.length > 0) return invalid[0].error;
    return null;
  }

  validateAll(): Error[] {
    if (this.validateOpts?.skipAll || this.validateOpts?.bypassBatchValidation) return [];
    const errors = this.verifyAll();
    const addenda98Err = this.isAddenda98();
    if (addenda98Err) errors.push(addenda98Err);
    if (this.header.standardEntryClassCode !== COR) {
      errors.push(this.batchError('StandardEntryClassCode', ErrBatchSECType, COR));
    }
    if (this.control.totalCreditEntryDollarAmount !== 0) {
      errors.push(this.batchError('TotalCreditEntryDollarAmount', ErrBatchAmountNonZero, this.control.totalCreditEntryDollarAmount));
    }
    if (this.control.totalDebitEntryDollarAmount !== 0) {
      errors.push(this.batchError('TotalDebitEntryDollarAmount', ErrBatchAmountNonZero, this.control.totalDebitEntryDollarAmount));
    }
    for (const inv of this.invalidEntries()) errors.push(inv.error);
    return errors;
  }

  invalidEntries(): InvalidEntry[] {
    const out: InvalidEntry[] = [];
    for (const entry of this.entries) {
      // COR TransactionCode must be Return or NOC codes
      const invalidCodes = [
        CheckingCredit, CheckingDebit, CheckingPrenoteCredit, CheckingPrenoteDebit,
        CheckingZeroDollarRemittanceCredit, CheckingZeroDollarRemittanceDebit,
        SavingsCredit, SavingsDebit, SavingsPrenoteCredit, SavingsPrenoteDebit,
        SavingsZeroDollarRemittanceCredit, SavingsZeroDollarRemittanceDebit,
        GLCredit, GLDebit, GLPrenoteCredit, GLPrenoteDebit,
        GLZeroDollarRemittanceCredit, GLZeroDollarRemittanceDebit,
        LoanCredit, LoanDebit, LoanPrenoteCredit, LoanZeroDollarRemittanceCredit,
      ];
      if (invalidCodes.includes(entry.transactionCode)) {
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

  private isAddenda98(): Error | null {
    for (const entry of this.entries) {
      if (!entry.addenda98 && !entry.addenda98Refused) {
        return this.batchError('Addenda98', ErrBatchCORAddenda);
      }
    }
    return null;
  }

  static from(b: Batch): BatchCOR {
    const inst = new BatchCOR();
    Batch.copyFrom(b, inst);
    return inst;
  }
}

registerBatchType(COR, (b: Batch) => BatchCOR.from(b));
