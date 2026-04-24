import { describe, it, expect } from 'vitest';
import {
  parseTXP, txpString, isTXPFormat,
  ErrInvalidTXPFormat, ErrInvalidTXPCharacter,
} from '../src/index.js';
import type { TXP, TaxAmount } from '../src/index.js';

describe('ParseTXP', () => {
  const tests: Array<{
    name: string;
    input: string;
    expected: TXP | null;
    expectError: boolean;
  }> = [
    {
      name: 'Valid TXP with 3 amounts and verification (NACHA Example 1)',
      input: 'TXP*123456789*606*960331*T*100000*P*12000*I*4567*SML2A\\',
      expected: {
        taxIdentificationNumber: '123456789',
        taxPaymentTypeCode: '606',
        date: '960331',
        taxAmounts: [
          { amountType: 'T', amountCents: '100000' },
          { amountType: 'P', amountCents: '12000' },
          { amountType: 'I', amountCents: '4567' },
        ],
        taxpayerVerification: 'SML2A',
      },
      expectError: false,
    },
    {
      name: 'Valid TXP with 1 amount and verification (NACHA Example 2)',
      input: 'TXP*12345678934*526*960930*T*100000***SML2A\\',
      expected: {
        taxIdentificationNumber: '12345678934',
        taxPaymentTypeCode: '526',
        date: '960930',
        taxAmounts: [
          { amountType: 'T', amountCents: '100000' },
        ],
        taxpayerVerification: 'SML2A',
      },
      expectError: false,
    },
    {
      name: 'Valid TXP with 3 amounts and no verification (NACHA Example 3)',
      input: 'TXP*123456789*94105*960301*1*10000*2*5000*3*15000\\',
      expected: {
        taxIdentificationNumber: '123456789',
        taxPaymentTypeCode: '94105',
        date: '960301',
        taxAmounts: [
          { amountType: '1', amountCents: '10000' },
          { amountType: '2', amountCents: '5000' },
          { amountType: '3', amountCents: '15000' },
        ],
        taxpayerVerification: '',
      },
      expectError: false,
    },
    {
      name: 'Valid TXP with 2 amounts and *** delimiter',
      input: 'TXP*123456789*941*250901*1*1000*2*500***VERIFIED\\',
      expected: {
        taxIdentificationNumber: '123456789',
        taxPaymentTypeCode: '941',
        date: '250901',
        taxAmounts: [
          { amountType: '1', amountCents: '1000' },
          { amountType: '2', amountCents: '500' },
        ],
        taxpayerVerification: 'VERIFIED',
      },
      expectError: false,
    },
    {
      name: 'Valid TXP with 1 amount and no verification',
      input: 'TXP*123456789*941*250901*T*100000\\',
      expected: {
        taxIdentificationNumber: '123456789',
        taxPaymentTypeCode: '941',
        date: '250901',
        taxAmounts: [
          { amountType: 'T', amountCents: '100000' },
        ],
        taxpayerVerification: '',
      },
      expectError: false,
    },
    {
      name: 'Valid TXP with 2 amounts and no verification',
      input: 'TXP*123456789*941*250901*1*1000*2*500\\',
      expected: {
        taxIdentificationNumber: '123456789',
        taxPaymentTypeCode: '941',
        date: '250901',
        taxAmounts: [
          { amountType: '1', amountCents: '1000' },
          { amountType: '2', amountCents: '500' },
        ],
        taxpayerVerification: '',
      },
      expectError: false,
    },
    {
      name: 'Valid TXP with mixed amount types',
      input: 'TXP*888999000*STATE*20231231*S*200000*2*10000**CONFIRMED\\',
      expected: {
        taxIdentificationNumber: '888999000',
        taxPaymentTypeCode: 'STATE',
        date: '20231231',
        taxAmounts: [
          { amountType: 'S', amountCents: '200000' },
          { amountType: '2', amountCents: '10000' },
        ],
        taxpayerVerification: 'CONFIRMED',
      },
      expectError: false,
    },
    {
      name: 'Empty string',
      input: '',
      expected: null,
      expectError: true,
    },
    {
      name: 'Missing TXP prefix',
      input: '123456789*FEDERAL*20231231*TAX2023Q4*500000*1**VERIFIED\\',
      expected: null,
      expectError: true,
    },
    {
      name: 'Valid TXP without backslash terminator',
      input: 'TXP*123456789*FEDERAL*20231231*TAX2023Q4*500000*1**VERIFIED',
      expected: {
        taxIdentificationNumber: '123456789',
        taxPaymentTypeCode: 'FEDERAL',
        date: '20231231',
        taxAmounts: [
          { amountType: 'TAX2023Q4', amountCents: '500000' },
        ],
        taxpayerVerification: 'VERIFIED',
      },
      expectError: false,
    },
    {
      name: 'Too few parts',
      input: 'TXP*123456789*FEDERAL*20231231*TAX2023Q4\\',
      expected: null,
      expectError: true,
    },
    {
      name: 'Odd number of amount parts',
      input: 'TXP*123456789*FEDERAL*20231231*500000*1*25000*VERIFIED\\',
      expected: null,
      expectError: true,
    },
    {
      name: 'TXP exceeds 80 byte limit',
      input: 'TXP*123456789*FEDERAL*20231231*TAX2023Q4*500000*1*25000*2*10000*VERIFIED_WITH_VERY_LONG_VERIFICATION_STRING\\',
      expected: null,
      expectError: true,
    },
    {
      name: 'Empty amount type in pair',
      input: 'TXP*123456789*941*250901**1000\\',
      expected: null,
      expectError: true,
    },
    {
      name: 'Empty amount cents in pair',
      input: 'TXP*123456789*941*250901*T*\\',
      expected: null,
      expectError: true,
    },
    {
      name: 'Empty TaxIdentificationNumber',
      input: 'TXP**941*250901*T*1000\\',
      expected: null,
      expectError: true,
    },
    {
      name: 'Empty TaxPaymentTypeCode',
      input: 'TXP*123456789**250901*T*1000\\',
      expected: null,
      expectError: true,
    },
    {
      name: 'Empty Date',
      input: 'TXP*123456789*941**T*1000\\',
      expected: null,
      expectError: true,
    },
    {
      name: 'Date too short',
      input: 'TXP*123456789*941*2509*T*1000\\',
      expected: null,
      expectError: true,
    },
    {
      name: 'Date too long',
      input: 'TXP*123456789*941*2509011*T*1000\\',
      expected: null,
      expectError: true,
    },
    {
      name: 'Date non-numeric',
      input: 'TXP*123456789*941*ABCDEF*T*1000\\',
      expected: null,
      expectError: true,
    },
    {
      name: 'Multiple consecutive empty delimiters',
      input: 'TXP*123456789*941*250901*T*1000****VERIFIED\\',
      expected: {
        taxIdentificationNumber: '123456789',
        taxPaymentTypeCode: '941',
        date: '250901',
        taxAmounts: [
          { amountType: 'T', amountCents: '1000' },
        ],
        taxpayerVerification: 'VERIFIED',
      },
      expectError: false,
    },
    {
      name: 'Trailing asterisk without verification',
      input: 'TXP*123456789*941*250901*T*1000*\\',
      expected: {
        taxIdentificationNumber: '123456789',
        taxPaymentTypeCode: '941',
        date: '250901',
        taxAmounts: [
          { amountType: 'T', amountCents: '1000' },
        ],
        taxpayerVerification: '',
      },
      expectError: false,
    },
    {
      name: 'Non-numeric amount with spaces',
      input: 'TXP*123456789*941*250901*T* 1000 \\',
      expected: null,
      expectError: true,
    },
    {
      name: 'Case-insensitive TXP prefix',
      input: 'txp*123456789*941*250901*T*1000\\',
      expected: null,
      expectError: true,
    },
    {
      name: 'Single asterisk after amounts',
      input: 'TXP*123456789*941*250901*T*1000*VERIFIED\\',
      expected: {
        taxIdentificationNumber: '123456789',
        taxPaymentTypeCode: '941',
        date: '250901',
        taxAmounts: [
          { amountType: 'T', amountCents: '1000' },
        ],
        taxpayerVerification: 'VERIFIED',
      },
      expectError: false,
    },
  ];

  for (const tt of tests) {
    it(tt.name, () => {
      const [result, err] = parseTXP(tt.input);

      if (tt.expectError) {
        expect(err).not.toBeNull();
        return;
      }

      expect(err).toBeNull();
      expect(result).not.toBeNull();

      expect(result!.taxIdentificationNumber).toBe(tt.expected!.taxIdentificationNumber);
      expect(result!.taxPaymentTypeCode).toBe(tt.expected!.taxPaymentTypeCode);
      expect(result!.date).toBe(tt.expected!.date);
      expect(result!.taxAmounts).toHaveLength(tt.expected!.taxAmounts.length);
      for (let i = 0; i < tt.expected!.taxAmounts.length; i++) {
        expect(result!.taxAmounts[i].amountCents).toBe(tt.expected!.taxAmounts[i].amountCents);
        expect(result!.taxAmounts[i].amountType).toBe(tt.expected!.taxAmounts[i].amountType);
      }
      expect(result!.taxpayerVerification).toBe(tt.expected!.taxpayerVerification);
    });
  }
});

describe('ValidateTXPCharacters', () => {
  // We test character validation indirectly through parseTXP since validateTXPCharacters is private.
  // Invalid characters cause ErrInvalidTXPCharacter; we use a base valid format and inject characters.
  const base = 'TXP*123456789*FEDERAL*20231231*TAX2023Q4*500000*1*25000*2**VERIFIED\\';

  it('Valid characters', () => {
    const [, err] = parseTXP(base);
    expect(err).toBeNull();
  });

  it('Invalid @ symbol', () => {
    const [, err] = parseTXP('TXP*123@456*FEDERAL*20231231*TAX2023Q4*500000*1**VERIFIED\\');
    expect(err).toBe(ErrInvalidTXPCharacter);
  });

  it('Invalid # symbol', () => {
    const [, err] = parseTXP('TXP*123#456*FEDERAL*20231231*TAX2023Q4*500000*1**VERIFIED\\');
    expect(err).toBe(ErrInvalidTXPCharacter);
  });

  it('Invalid newline', () => {
    const [, err] = parseTXP('TXP*123\n456*FEDERAL*20231231*TAX2023Q4*500000*1**VERIFIED\\');
    expect(err).toBe(ErrInvalidTXPCharacter);
  });

  it('Invalid tab', () => {
    const [, err] = parseTXP('TXP*123\t456*FEDERAL*20231231*TAX2023Q4*500000*1**VERIFIED\\');
    expect(err).toBe(ErrInvalidTXPCharacter);
  });

  it('Valid hyphen', () => {
    const [, err] = parseTXP('TXP*123-456*FEDERAL*20231231*TAX2023Q4*500000*1**VERIFIED\\');
    expect(err).toBeNull();
  });

  it('Valid period', () => {
    const [, err] = parseTXP('TXP*123.456*FEDERAL*20231231*TAX2023Q4*500000*1**VERIFIED\\');
    expect(err).toBeNull();
  });

  it('Valid colon', () => {
    const [, err] = parseTXP('TXP*123:456*FEDERAL*20231231*TAX2023Q4*500000*1**VERIFIED\\');
    expect(err).toBeNull();
  });

  it('Valid integer amount type', () => {
    const [, err] = parseTXP('TXP*123456789*FEDERAL*20231231*TAX2023Q4*500000*1*25000*2**VERIFIED\\');
    expect(err).toBeNull();
  });

  it('Valid single letter amount type', () => {
    const [, err] = parseTXP('TXP*123456789*STATE*20231231*TAX2023Q4*500000*S**VERIFIED\\');
    expect(err).toBeNull();
  });
});

describe('IsTXPFormat', () => {
  it('Valid TXP format', () => {
    expect(isTXPFormat('TXP*123456789*FEDERAL*20231231*TAX2023Q4*500000*1*25000*2**VERIFIED\\')).toBe(true);
  });

  it('Invalid format - missing TXP prefix', () => {
    expect(isTXPFormat('123456789*FEDERAL*20231231*TAX2023Q4*500000*1**VERIFIED\\')).toBe(false);
  });

  it('Valid format - without backslash', () => {
    expect(isTXPFormat('TXP*123456789*FEDERAL*20231231*TAX2023Q4*500000*1**VERIFIED')).toBe(true);
  });

  it('Empty string', () => {
    expect(isTXPFormat('')).toBe(false);
  });
});

describe('TXPToString', () => {
  const tests: Array<{ name: string; txp: TXP; expected: string }> = [
    {
      name: 'TXP with 3 amounts and verification',
      txp: {
        taxIdentificationNumber: '123456789',
        taxPaymentTypeCode: '606',
        date: '960331',
        taxAmounts: [
          { amountType: 'T', amountCents: '100000' },
          { amountType: 'P', amountCents: '12000' },
          { amountType: 'I', amountCents: '4567' },
        ],
        taxpayerVerification: 'SML2A',
      },
      expected: 'TXP*123456789*606*960331*T*100000*P*12000*I*4567*SML2A\\',
    },
    {
      name: 'TXP with 1 amount and verification',
      txp: {
        taxIdentificationNumber: '12345678934',
        taxPaymentTypeCode: '526',
        date: '960930',
        taxAmounts: [
          { amountType: 'T', amountCents: '100000' },
        ],
        taxpayerVerification: 'SML2A',
      },
      expected: 'TXP*12345678934*526*960930*T*100000*SML2A\\',
    },
    {
      name: 'TXP with 3 amounts and no verification',
      txp: {
        taxIdentificationNumber: '123456789',
        taxPaymentTypeCode: '94105',
        date: '960301',
        taxAmounts: [
          { amountType: '1', amountCents: '10000' },
          { amountType: '2', amountCents: '5000' },
          { amountType: '3', amountCents: '15000' },
        ],
        taxpayerVerification: '',
      },
      expected: 'TXP*123456789*94105*960301*1*10000*2*5000*3*15000\\',
    },
    {
      name: 'TXP with 2 amounts and no verification',
      txp: {
        taxIdentificationNumber: '123456789',
        taxPaymentTypeCode: '941',
        date: '250901',
        taxAmounts: [
          { amountType: '1', amountCents: '1000' },
          { amountType: '2', amountCents: '500' },
        ],
        taxpayerVerification: '',
      },
      expected: 'TXP*123456789*941*250901*1*1000*2*500\\',
    },
    {
      name: 'TXP with mixed amount types',
      txp: {
        taxIdentificationNumber: '888999000',
        taxPaymentTypeCode: 'STATE',
        date: '20231231',
        taxAmounts: [
          { amountType: 'S', amountCents: '200000' },
          { amountType: '2', amountCents: '10000' },
        ],
        taxpayerVerification: 'CONFIRMED',
      },
      expected: 'TXP*888999000*STATE*20231231*S*200000*2*10000*CONFIRMED\\',
    },
  ];

  for (const tt of tests) {
    it(tt.name, () => {
      const result = txpString(tt.txp);
      expect(result).toBe(tt.expected);
    });
  }
});

describe('TXPToStringRoundTrip', () => {
  const roundTripInputs = [
    { name: 'TXP with 3 amounts and verification', input: 'TXP*123456789*606*960331*T*100000*P*12000*I*4567*SML2A\\' },
    { name: 'TXP with 1 amount and verification', input: 'TXP*12345678934*526*960930*T*100000***SML2A\\' },
    { name: 'TXP with 3 amounts and no verification', input: 'TXP*123456789*94105*960301*1*10000*2*5000*3*15000\\' },
    { name: 'TXP with 2 amounts and no verification', input: 'TXP*123456789*941*250901*1*1000*2*500\\' },
    { name: 'TXP with 1 amount and no verification', input: 'TXP*123456789*941*250901*T*100000\\' },
  ];

  for (const tt of roundTripInputs) {
    it(tt.name, () => {
      // Parse the input
      const [txp, err] = parseTXP(tt.input);
      expect(err).toBeNull();
      expect(txp).not.toBeNull();

      // Serialize it back
      const serialized = txpString(txp!);

      // Parse the serialized string again
      const [reparsed, err2] = parseTXP(serialized);
      expect(err2).toBeNull();
      expect(reparsed).not.toBeNull();

      // Verify the round-trip results match
      expect(reparsed!.taxIdentificationNumber).toBe(txp!.taxIdentificationNumber);
      expect(reparsed!.taxPaymentTypeCode).toBe(txp!.taxPaymentTypeCode);
      expect(reparsed!.date).toBe(txp!.date);
      expect(reparsed!.taxAmounts).toHaveLength(txp!.taxAmounts.length);
      for (let i = 0; i < txp!.taxAmounts.length; i++) {
        expect(reparsed!.taxAmounts[i].amountCents).toBe(txp!.taxAmounts[i].amountCents);
        expect(reparsed!.taxAmounts[i].amountType).toBe(txp!.taxAmounts[i].amountType);
      }
      expect(reparsed!.taxpayerVerification).toBe(txp!.taxpayerVerification);
    });
  }
});
