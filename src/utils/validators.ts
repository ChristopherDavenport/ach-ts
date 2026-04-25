// Licensed to The Moov Authors under one or more contributor
// license agreements. See the NOTICE file distributed with
// this work for additional information regarding copyright
// ownership. The Moov Authors licenses this file to you under
// the Apache License, Version 2.0 (the "License"); you may
// not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied.  See the License for the
// specific language governing permissions and limitations
// under the License.

import {
  ACK, ADV, ARC, ATX, BOC, CCD, CIE, COR, CTX, DNE, ENR,
  IAT, MTE, POP, POS, PPD, RCK, SHR, TEL, TRC, TRX, WEB, XCK,
  MixedDebitsAndCredits, CreditsOnly, DebitsOnly, AutomatedAccountingAdvices,
  CheckingCredit, CheckingReturnNOCCredit, CheckingPrenoteCredit, CheckingZeroDollarRemittanceCredit,
  CheckingDebit, CheckingReturnNOCDebit, CheckingPrenoteDebit, CheckingZeroDollarRemittanceDebit,
  SavingsCredit, SavingsReturnNOCCredit, SavingsPrenoteCredit, SavingsZeroDollarRemittanceCredit,
  SavingsDebit, SavingsReturnNOCDebit, SavingsPrenoteDebit, SavingsZeroDollarRemittanceDebit,
  GLCredit, GLReturnNOCCredit, GLPrenoteCredit, GLZeroDollarRemittanceCredit,
  GLDebit, GLReturnNOCDebit, GLPrenoteDebit, GLZeroDollarRemittanceDebit,
  LoanCredit, LoanReturnNOCCredit, LoanPrenoteCredit, LoanZeroDollarRemittanceCredit,
  LoanDebit, LoanReturnNOCDebit,
  CreditForDebitsOriginated, DebitForCreditsOriginated,
  CreditForCreditsReceived, DebitForDebitsReceived,
  CreditForCreditsRejected, DebitForDebitsRejectedBatches,
  CreditSummary, DebitSummary,
} from '../constants.js';

import {
  ACHError,
  ErrCardTransactionType,
  ErrValidYear,
  ErrValidMonth,
  ErrValidDay,
  ErrIDNumberQualifier,
  ErrOrigStatusCode,
  ErrSECCode,
  ErrServiceClass,
  ErrAddendaTypeCode,
  ErrTransactionCode,
  ErrTransactionTypeCode,
  ErrUpperAlpha,
  ErrNonAlphanumeric,
  ErrOnlyZeros,
} from '../errors/index.js';

/** HHmm regex for validating 24-hour clock timestamps */
const hhmmRegex = /^([0-2]{1}[\d]{1}[0-5]{1}\d{1})$/;

/** The slash-zero character Ø used in some ACH fields */
const slashZero = 'Ø'.codePointAt(0)!;

/**
 * Validators provides common validation functions for ACH records.
 * Used via composition in record types.
 */
export class Validators {
  /** Validate card transaction type for batchPOS */
  isCardTransactionType(code: string): Error | null {
    switch (code) {
      case '01': case '02': case '03': case '11': case '12':
      case '13': case '21': case '99':
        return null;
    }
    return ErrCardTransactionType;
  }

  /** Validate a 2-digit year for credit cards (range 18-50) */
  isCreditCardYear(s: string): Error | null {
    if (s < '18' || s > '50') {
      return ErrValidYear;
    }
    return null;
  }

  /** Validate a 2-digit month (01-12) */
  isMonth(s: string): Error | null {
    switch (s) {
      case '01': case '02': case '03': case '04': case '05': case '06':
      case '07': case '08': case '09': case '10': case '11': case '12':
        return null;
    }
    return ErrValidMonth;
  }

  /** Validate a 2-digit day based on a 2-digit month */
  isDay(m: string, d: string): Error | null {
    const day = parseInt(d, 10);
    if (isNaN(day) || day < 1) return ErrValidDay;

    switch (m) {
      case '02': // February
        if (day <= 29) return null;
        break;
      case '04': case '06': case '09': case '11': // 30-day months
        if (day <= 30) return null;
        break;
      case '01': case '03': case '05': case '07': case '08': case '10': case '12': // 31-day months
        if (day <= 31) return null;
        break;
    }
    return ErrValidDay;
  }

  /**
   * Validate a simple date in YYMMDD format.
   * Returns the input if valid, empty string if invalid.
   */
  validateSimpleDate(s: string): string {
    if (s.length !== 6) return '';

    // Use Go-compatible date validation: try to parse as YYMMDD
    const yy = parseInt(s.substring(0, 2), 10);
    const mm = parseInt(s.substring(2, 4), 10);
    const dd = parseInt(s.substring(4, 6), 10);

    if (isNaN(yy) || isNaN(mm) || isNaN(dd)) return '';
    if (mm < 1 || mm > 12) return '';
    if (dd < 1) return '';

    // Calculate the full year (2000 + yy for 00-99)
    const fullYear = 2000 + yy;

    // Get the number of days in this month (handles leap years)
    const daysInMonth = new Date(fullYear, mm, 0).getDate();
    if (dd > daysInMonth) return '';

    return s;
  }

  /**
   * Validate a simple time in HHmm format (24-hour clock).
   * Returns the input if valid, empty string if invalid.
   */
  validateSimpleTime(s: string): string {
    if (hhmmRegex.test(s)) {
      return s;
    }
    return '';
  }

  /** Validate ODFI/RDFI Identification Number Qualifier */
  isIDNumberQualifier(s: string): Error | null {
    switch (s) {
      case '01': case '02': case '03':
        return null;
    }
    return ErrIDNumberQualifier;
  }

  /** Validate originator status code */
  isOriginatorStatusCode(code: number): Error | null {
    switch (code) {
      case 0: case 1: case 2:
        return null;
    }
    return ErrOrigStatusCode;
  }

  /** Validate SEC code */
  isSECCode(code: string): Error | null {
    switch (code) {
      case ACK: case ADV: case ARC: case ATX: case BOC: case CCD: case CIE:
      case COR: case CTX: case DNE: case ENR: case IAT: case MTE: case POS:
      case PPD: case POP: case RCK: case SHR: case TEL: case TRC: case TRX:
      case WEB: case XCK:
        return null;
    }
    return ErrSECCode;
  }

  /** Validate ServiceClassCode */
  isServiceClass(code: number): Error | null {
    switch (code) {
      case MixedDebitsAndCredits:
      case CreditsOnly:
      case DebitsOnly:
      case AutomatedAccountingAdvices:
        return null;
    }
    return ErrServiceClass;
  }

  /** Validate Addenda Type Code */
  isTypeCode(code: string): Error | null {
    switch (code) {
      case '02': case '08': case '98': case '99':
      case '10': case '11': case '12': case '13': case '14': case '15': case '16': case '17': case '18':
      case '05':
        return null;
    }
    return ErrAddendaTypeCode;
  }

  /** Validate TransactionCode against standard NACHA values */
  isTransactionCode(code: number): Error | null {
    return standardTransactionCode(code);
  }

  /** Check if a transaction code is a prenote */
  isPrenote(code: number): boolean {
    switch (code) {
      case CheckingPrenoteCredit: case CheckingPrenoteDebit:
      case SavingsPrenoteCredit: case SavingsPrenoteDebit:
      case GLPrenoteCredit: case GLPrenoteDebit: case LoanPrenoteCredit:
        return true;
    }
    return false;
  }

  /** Validate Addenda10 TransactionTypeCode */
  isTransactionTypeCode(s: string): Error | null {
    switch (s.toUpperCase()) {
      case 'ANN': case 'BUS': case 'DEP': case 'LOA': case 'MIS': case 'MOR':
      case 'PEN': case 'REM': case 'RLS': case 'SAL': case 'TAX':
      case ARC: case BOC: case IAT: case MTE: case POP: case POS: case RCK:
      case SHR: case TEL: case WEB:
        return null;
    }
    return ErrTransactionTypeCode;
  }

  /** Check if string only contains ASCII alphanumeric upper case characters */
  isUpperASCII(s: string): Error | null {
    for (const ch of s) {
      const r = ch.codePointAt(0)!;
      if (r === 0x20 || (0x30 <= r && r <= 0x39) || (0x41 <= r && r <= 0x5A)) {
        continue; // Space, 0-9, A-Z
      }
      const achErr = new ACHError(`${ErrUpperAlpha.message}: ${ch}`);
      achErr.code = ErrUpperAlpha.code;
      return achErr;
    }
    return null;
  }

  /** Check if a string only contains valid ACH alphanumeric characters */
  isAlphanumeric(s: string): Error | null {
    for (const ch of s) {
      const r = ch.codePointAt(0)!;

      // Space to ~ (Typical ASCII)
      if (0x20 <= r && r <= 0x7E) continue;

      // À to ÿ (Extended Latin Alphabet)
      if (0xC0 <= r && r <= 0xFF) continue;

      // Specific accepted characters
      switch (r) {
        case 0xA0: //   - Non-breaking Space
        case 0xA2: // ¢ - Cent Sign
        case 0xAC: // ¬ - Negation
        case 0xA6: // ¦ - Pipe
        case 0xB1: // ± - Plus or Minus Sign
        case slashZero: // Ø
          continue;
      }

      const achErr = new ACHError(`${ErrNonAlphanumeric.message}: ${ch}`);
      achErr.code = ErrNonAlphanumeric.code;
      return achErr;
    }
    return null;
  }

  /** Check if a string is not blank and non-zero */
  isNonZero(s: string): Error | null {
    for (const ch of s) {
      const cp = ch.codePointAt(0)!;
      // Check if not a space and not '0'
      if (cp !== 0x20 && cp !== 0x09 && cp !== 0x0A && cp !== 0x0D && ch !== '0') {
        return null;
      }
    }
    return ErrOnlyZeros;
  }

  /**
   * Validate settlement date (Julian day format).
   * Returns the input if valid, "   " (3 spaces) if invalid.
   */
  validateSettlementDate(s: string): string {
    const emptyField = '   ';

    if (s === emptyField || s.length !== 3) {
      return emptyField;
    }

    const day = parseInt(s, 10);
    if (isNaN(day)) return emptyField;
    if (day < 1 || day > 366) return emptyField;

    return s;
  }
}

/**
 * StandardTransactionCode checks the provided TransactionCode to verify it is a valid NACHA value.
 */
export function standardTransactionCode(code: number): Error | null {
  switch (code) {
    // Checking
    case CheckingReturnNOCCredit: case CheckingCredit: case CheckingPrenoteCredit:
    case CheckingZeroDollarRemittanceCredit: case CheckingReturnNOCDebit: case CheckingDebit:
    case CheckingPrenoteDebit: case CheckingZeroDollarRemittanceDebit:
    // Savings
    case SavingsReturnNOCCredit: case SavingsCredit: case SavingsPrenoteCredit:
    case SavingsZeroDollarRemittanceCredit: case SavingsReturnNOCDebit: case SavingsDebit:
    case SavingsPrenoteDebit: case SavingsZeroDollarRemittanceDebit:
    // GL
    case GLReturnNOCCredit: case GLCredit: case GLPrenoteCredit: case GLZeroDollarRemittanceCredit:
    case GLReturnNOCDebit: case GLDebit: case GLPrenoteDebit: case GLZeroDollarRemittanceDebit:
    // Loan
    case LoanReturnNOCCredit: case LoanCredit: case LoanPrenoteCredit:
    case LoanZeroDollarRemittanceCredit: case LoanDebit: case LoanReturnNOCDebit:
    // ADV
    case CreditForDebitsOriginated: case DebitForCreditsOriginated:
    case CreditForCreditsReceived: case DebitForDebitsReceived:
    case CreditForCreditsRejected: case DebitForDebitsRejectedBatches:
    case CreditSummary: case DebitSummary:
      return null;
  }
  return ErrTransactionCode;
}

/**
 * CalculateCheckDigit returns a check digit for a routing number.
 * The routing number must be 8 or 9 characters.
 * Returns -1 on error.
 */
export function CalculateCheckDigit(routingNumber: string): number {
  const n = [...routingNumber].length;
  if (n !== 8 && n !== 9) return -1;

  let sum = 0;
  let i = 0;
  for (const ch of routingNumber) {
    if (i >= 8) break;

    const cp = ch.codePointAt(0)!;
    if (cp < 48 || cp > 57) return -1; // Only digits allowed

    const digit = cp - 48;
    switch (i) {
      case 0: case 3: case 6:
        sum += digit * 3;
        break;
      case 1: case 4: case 7:
        sum += digit * 7;
        break;
      case 2: case 5:
        sum += digit;
        break;
    }
    i++;
  }

  return roundUp10(sum) - sum;
}

/**
 * CheckRoutingNumber returns null if the routing number is valid, or an error otherwise.
 */
export function CheckRoutingNumber(routingNumber: string): Error | null {
  if (!routingNumber) {
    return new Error('no routing number provided');
  }

  const n = [...routingNumber].length;
  if (n !== 9) {
    return new Error(`invalid routing number length of ${n}`);
  }

  const check = CalculateCheckDigit(routingNumber);
  const lastChar = routingNumber[routingNumber.length - 1];
  const last = parseInt(lastChar, 10);

  if (isNaN(last) || check !== last) {
    return new Error(`routing number checksum mismatch: expected ${check} but got ${last}`);
  }
  return null;
}

/** Round number up to the next ten spot */
function roundUp10(n: number): number {
  return Math.ceil(n / 10.0) * 10;
}

/** US state and territory abbreviations */
const usStates = new Set([
  'AL','AK','AS','AZ','AR','CA','CO','CT','DE','DC','FL','GA','GU','HI','ID',
  'IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE',
  'NV','NH','NJ','NM','NY','NC','ND','MP','OH','OK','OR','PA','PR','RI','SC',
  'SD','TN','TX','UT','VT','VI','VA','WA','WV','WI','WY',
]);

/** Validates a US state or territory abbreviation. */
export function usStateValid(s: string): boolean {
  return usStates.has(s.trim().toUpperCase());
}

/**
 * Read `length` runes starting at `start` from a string.
 * Handles Unicode correctly.
 */
export function readRunes(start: number, length: number, input: string): string {
  const runes = [...input];
  return runes.slice(start, start + length).join('');
}

/** Shared singleton instance — Validators is stateless. */
export const validators = new Validators();
