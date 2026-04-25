import {
  CheckingCredit, CheckingReturnNOCCredit, CheckingPrenoteCredit, CheckingZeroDollarRemittanceCredit,
  CheckingDebit, CheckingReturnNOCDebit, CheckingPrenoteDebit, CheckingZeroDollarRemittanceDebit,
  SavingsCredit, SavingsReturnNOCCredit, SavingsPrenoteCredit, SavingsZeroDollarRemittanceCredit,
  SavingsDebit, SavingsReturnNOCDebit, SavingsPrenoteDebit, SavingsZeroDollarRemittanceDebit,
  GLCredit, GLReturnNOCCredit, GLPrenoteCredit, GLZeroDollarRemittanceCredit,
  GLDebit, GLReturnNOCDebit, GLPrenoteDebit, GLZeroDollarRemittanceDebit,
  LoanCredit, LoanReturnNOCCredit, LoanPrenoteCredit, LoanZeroDollarRemittanceCredit,
  LoanDebit, LoanReturnNOCDebit,
} from '../constants.js';

/** Classify a transaction code as credit or debit. */
export function classifyAmount(txCode: number, amount: number): { credit: number; debit: number } {
  switch (txCode) {
    case CheckingCredit: case CheckingReturnNOCCredit: case CheckingPrenoteCredit: case CheckingZeroDollarRemittanceCredit:
    case SavingsCredit: case SavingsReturnNOCCredit: case SavingsPrenoteCredit: case SavingsZeroDollarRemittanceCredit:
    case GLCredit: case GLReturnNOCCredit: case GLPrenoteCredit: case GLZeroDollarRemittanceCredit:
    case LoanCredit: case LoanReturnNOCCredit: case LoanPrenoteCredit: case LoanZeroDollarRemittanceCredit:
      return { credit: amount, debit: 0 };
    case CheckingDebit: case CheckingReturnNOCDebit: case CheckingPrenoteDebit: case CheckingZeroDollarRemittanceDebit:
    case SavingsDebit: case SavingsReturnNOCDebit: case SavingsPrenoteDebit: case SavingsZeroDollarRemittanceDebit:
    case GLDebit: case GLReturnNOCDebit: case GLPrenoteDebit: case GLZeroDollarRemittanceDebit:
    case LoanDebit: case LoanReturnNOCDebit:
      return { credit: 0, debit: amount };
    default:
      return { credit: 0, debit: 0 };
  }
}

/** Extract the first 8 digits of an ABA routing number. */
export function aba8(rtn: string): string {
  const n = [...rtn].length;
  if (n > 10) return '';
  if (n === 10) {
    if (rtn[0] === '0' || rtn[0] === '1') return rtn.substring(1, 9);
    return '';
  }
  if (n !== 8 && n !== 9) return '';
  return rtn.substring(0, 8);
}
