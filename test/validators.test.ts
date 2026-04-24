// Ported from moov-io/ach validators_test.go
import { describe, it, expect } from 'vitest';
import { Validators, CalculateCheckDigit, CheckRoutingNumber } from '../src/utils/validators';
import { ErrNonAlphanumeric, ErrOnlyZeros } from '../src/errors/index';

describe('Validators', () => {
  const v = new Validators();

  describe('CalculateCheckDigit / CheckRoutingNumber', () => {
    const cases: Record<string, number> = {
      // invalid
      '': -1,
      '123456': -1,
      '1a8ab': -1,
      '0730002a': -1,
      '0730A002': -1,
      'YYYYYYYYY': -1, // users often mask ABA numbers
      // valid
      '07300022': 8, // Wells Fargo - Iowa
      '10200007': 6, // Wells Fargo - Colorado
      '02601367': 3, // TD BANK NA - LEWISTON, ME
    };

    for (const [rtn, check] of Object.entries(cases)) {
      it(`checkDigit(${rtn}) = ${check}`, () => {
        const answer = CalculateCheckDigit(rtn);
        expect(answer).toBe(check);

        if (check >= 0) {
          const err = CheckRoutingNumber(`${rtn}${check}`);
          expect(err).toBeNull();
        }
      });
    }
  });

  describe('isCreditCardYear', () => {
    const cases: Record<string, boolean> = {
      // invalid (or out of range)
      '10': false,
      '00': false,
      '51': false,
      '17': false,
      // valid
      '20': true,
      '19': true,
    };

    for (const [yy, valid] of Object.entries(cases)) {
      it(`isCreditCardYear(${yy}) valid=${valid}`, () => {
        const err = v.isCreditCardYear(yy);
        if (valid) {
          expect(err).toBeNull();
        } else {
          expect(err).not.toBeNull();
        }
      });
    }
  });

  describe('validateSimpleDate', () => {
    const cases: Record<string, string> = {
      // invalid
      '': '',
      '01': '',
      '001520': '', // no 15th month
      '001240': '', // no 40th Day
      '190001': '', // no 0th month
      '190100': '', // no 0th day
      '230229': '', // Feb 29th 2023 is not a leap year
      // valid
      '190101': '190101', // Jan 1st
      '201231': '201231', // Dec 31st
      '220731': '220731', // July 31st
      '350430': '350430', // April 30th
      '240229': '240229', // Feb 29th 2024 (Leap Year)
    };

    for (const [input, expected] of Object.entries(cases)) {
      it(`validateSimpleDate(${JSON.stringify(input)}) = ${JSON.stringify(expected)}`, () => {
        expect(v.validateSimpleDate(input)).toBe(expected);
      });
    }
  });

  describe('validateSimpleTime', () => {
    const cases: Record<string, string> = {
      // invalid
      '': '',
      '01': '',
      '012': '',
      '123142': '',
      // valid
      '0000': '0000',
      '0100': '0100',
      '2359': '2359',
      '1201': '1201',
      '1238': '1238',
    };

    for (const [input, expected] of Object.entries(cases)) {
      it(`validateSimpleTime(${JSON.stringify(input)}) = ${JSON.stringify(expected)}`, () => {
        expect(v.validateSimpleTime(input)).toBe(expected);
      });
    }
  });

  describe('isTransactionTypeCode', () => {
    it('accepts valid codes', () => {
      expect(v.isTransactionTypeCode('BUS')).toBeNull();
      expect(v.isTransactionTypeCode('tax')).toBeNull();
    });

    it('rejects invalid codes', () => {
      expect(v.isTransactionTypeCode('ZZZ')).not.toBeNull();
      expect(v.isTransactionTypeCode('abc')).not.toBeNull();
    });
  });

  describe('isAlphanumeric', () => {
    it('accepts valid ASCII printable range', () => {
      for (let i = 0x20; i <= 0x7E; i++) {
        const chr = String.fromCodePoint(i);
        const err = v.isAlphanumeric(chr);
        expect(err).toBeNull();
      }
    });

    it('accepts extended Latin range (0xC0-0xFF)', () => {
      for (let i = 0xC0; i <= 0xFF; i++) {
        const chr = String.fromCodePoint(i);
        const err = v.isAlphanumeric(chr);
        expect(err).toBeNull();
      }
    });

    it('rejects control characters', () => {
      for (let i = 0x00; i <= 0x1F; i++) {
        const chr = String.fromCodePoint(i);
        const err = v.isAlphanumeric(chr);
        expect(err).not.toBeNull();
      }
    });

    it('accepts specific special characters', () => {
      const valid = ['Acme Corp!', '|', '¦', '¢', '¬', '±', 'ã', 'è', 'ñ'];
      for (const s of valid) {
        const err = v.isAlphanumeric(s);
        expect(err).toBeNull();
      }
    });

    it('rejects invalid special characters', () => {
      const invalid = ['©', '®', '§101.1'];
      for (const s of invalid) {
        const err = v.isAlphanumeric(s);
        expect(err).not.toBeNull();
        expect(err!.message).toContain('has non alphanumeric characters');
      }
    });

    it('accepts real-world examples', () => {
      expect(v.isAlphanumeric('123456-9876.1234')).toBeNull();
      expect(v.isAlphanumeric("D'Amador")).toBeNull();
    });

    it('rejects L\'Allier (smart quote)', () => {
      const err = v.isAlphanumeric('L\u2019Allier');
      expect(err).not.toBeNull();
      expect(err!.message).toContain('has non alphanumeric characters');
    });
  });

  describe('isUpperASCII', () => {
    it('accepts uppercase letters, digits, and space', () => {
      for (let i = 0x41; i <= 0x5A; i++) {
        expect(v.isUpperASCII(String.fromCodePoint(i))).toBeNull();
      }
      for (let i = 0x30; i <= 0x39; i++) {
        expect(v.isUpperASCII(String.fromCodePoint(i))).toBeNull();
      }
      expect(v.isUpperASCII(' ')).toBeNull();
    });

    it('rejects lowercase letters', () => {
      for (let i = 0x61; i <= 0x7A; i++) {
        expect(v.isUpperASCII(String.fromCodePoint(i))).not.toBeNull();
      }
    });
  });

  describe('isNonZero', () => {
    const cases: Array<{ input: string; expectError: boolean }> = [
      { input: '', expectError: true },
      { input: ' ', expectError: true },
      { input: '0', expectError: true },
      { input: '0 0', expectError: true },
      { input: '    000   ', expectError: true },
      // Valid cases
      { input: 'abc', expectError: false },
      { input: '000 123 a ', expectError: false },
    ];

    for (const tc of cases) {
      it(`isNonZero(${JSON.stringify(tc.input)}) error=${tc.expectError}`, () => {
        const err = v.isNonZero(tc.input);
        if (tc.expectError) {
          expect(err).toBe(ErrOnlyZeros);
        } else {
          expect(err).toBeNull();
        }
      });
    }
  });

  describe('validateSettlementDate (Julian day)', () => {
    const empty = '   ';
    const cases: Record<string, string> = {
      // invalid
      '': empty,
      '   ': empty,
      '01': empty,
      '01234': empty,
      'XXX': empty,
      '000': empty,
      '367': empty,
      // valid
      '001': '001',
      '020': '020',
      '366': '366',
    };

    for (const [input, valid] of Object.entries(cases)) {
      it(`validateSettlementDate(${JSON.stringify(input)}) = ${JSON.stringify(valid)}`, () => {
        expect(v.validateSettlementDate(input)).toBe(valid);
      });
    }
  });
});
