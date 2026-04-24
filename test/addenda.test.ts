// Ported from moov-io/ach addenda tests
import { describe, it, expect } from 'vitest';
import { Addenda05, newAddenda05 } from '../src/addenda05';
import { Addenda02, newAddenda02 } from '../src/addenda02';
import { Addenda98, newAddenda98, lookupChangeCode, isRefusedChangeCode } from '../src/addenda98';
import { Addenda99, newAddenda99, lookupReturnCode } from '../src/addenda99';

describe('Addenda05', () => {
  function mockAddenda05(): Addenda05 {
    const a = newAddenda05();
    a.paymentRelatedInformation = 'Credit account  1 for payment';
    a.sequenceNumber = 1;
    a.entryDetailSequenceNumber = 1;
    return a;
  }

  it('validates a mock addenda05', () => {
    expect(mockAddenda05().validate()).toBeNull();
  });

  it('round-trips parse/string', () => {
    const a = mockAddenda05();
    const str = a.string();
    expect([...str].length).toBe(94);

    const a2 = newAddenda05();
    a2.parse(str);
    expect(a2.string()).toBe(str);
  });

  it('rejects wrong type code', () => {
    const a = mockAddenda05();
    a.typeCode = '99';
    expect(a.validate()).not.toBeNull();
  });

  it('rejects empty type code', () => {
    const a = mockAddenda05();
    a.typeCode = '';
    expect(a.validate()).not.toBeNull();
  });

  it('rejects zero sequence number', () => {
    const a = mockAddenda05();
    a.sequenceNumber = 0;
    expect(a.validate()).not.toBeNull();
  });

  it('rejects payment info exceeding 80 chars', () => {
    const a = mockAddenda05();
    a.paymentRelatedInformation = 'x'.repeat(81);
    expect(a.validate()).not.toBeNull();
  });

  it('fields are properly padded', () => {
    const a = mockAddenda05();
    expect([...a.paymentRelatedInformationField()].length).toBe(80);
    expect(a.sequenceNumberField()).toBe('0001');
    expect(a.entryDetailSequenceNumberField()).toBe('0000001');
  });
});

describe('Addenda02', () => {
  function mockAddenda02(): Addenda02 {
    const a = newAddenda02();
    a.referenceInformationOne = 'REF123';
    a.referenceInformationTwo = 'AB';
    a.terminalIdentificationCode = 'TERM01';
    a.transactionSerialNumber = 'SN0001';
    a.transactionDate = '0614';
    a.authorizationCodeOrExpireDate = 'AUTH01';
    a.terminalLocation = '123 Main St';
    a.terminalCity = 'New York';
    a.terminalState = 'NY';
    a.traceNumber = '121042880000001';
    return a;
  }

  it('validates a mock addenda02', () => {
    expect(mockAddenda02().validate()).toBeNull();
  });

  it('round-trips parse/string', () => {
    const a = mockAddenda02();
    const str = a.string();
    expect([...str].length).toBe(94);

    const a2 = newAddenda02();
    a2.parse(str);
    expect(a2.string()).toBe(str);
  });

  it('rejects wrong type code', () => {
    const a = mockAddenda02();
    a.typeCode = '05';
    expect(a.validate()).not.toBeNull();
  });

  it('rejects missing required fields', () => {
    const a = mockAddenda02();
    a.transactionSerialNumber = '';
    expect(a.validate()!.message).toContain('TransactionSerialNumber');
  });

  it('rejects invalid transaction date', () => {
    const a = mockAddenda02();
    a.transactionDate = '1335'; // invalid day 35
    expect(a.validate()).not.toBeNull();
  });
});

describe('Addenda98', () => {
  function mockAddenda98(): Addenda98 {
    const a = newAddenda98();
    a.changeCode = 'C01';
    a.originalTrace = '121042880000001';
    a.originalDFI = '12104288';
    a.correctedData = '1918171614';
    a.traceNumber = '091012980000088';
    return a;
  }

  it('validates a mock addenda98', () => {
    expect(mockAddenda98().validate()).toBeNull();
  });

  it('round-trips parse/string', () => {
    const a = mockAddenda98();
    const str = a.string();
    expect([...str].length).toBe(94);

    const a2 = newAddenda98();
    a2.parse(str);
    expect(a2.changeCode).toBe('C01');
    expect(a2.originalTrace).toBe('121042880000001');
    expect(a2.originalDFI).toBe('12104288');
    expect(a2.correctedData).toBe('1918171614');
  });

  it('rejects invalid change code', () => {
    const a = mockAddenda98();
    a.changeCode = 'C99';
    expect(a.validate()!.message).toContain('ChangeCode');
  });

  it('rejects empty corrected data', () => {
    const a = mockAddenda98();
    a.correctedData = '';
    expect(a.validate()!.message).toContain('CorrectedData');
  });

  it('rejects wrong type code', () => {
    const a = mockAddenda98();
    a.typeCode = '05';
    expect(a.validate()).not.toBeNull();
  });
});

describe('Addenda99', () => {
  function mockAddenda99(): Addenda99 {
    const a = newAddenda99();
    a.returnCode = 'R01';
    a.originalTrace = '121042880000001';
    a.originalDFI = '12104288';
    a.traceNumber = '091012980000088';
    return a;
  }

  it('validates a mock addenda99', () => {
    expect(mockAddenda99().validate()).toBeNull();
  });

  it('round-trips parse/string', () => {
    const a = mockAddenda99();
    const str = a.string();
    expect([...str].length).toBe(94);

    const a2 = newAddenda99();
    a2.parse(str);
    expect(a2.returnCode).toBe('R01');
    expect(a2.originalTrace).toBe('121042880000001');
    expect(a2.originalDFI).toBe('12104288');
  });

  it('rejects invalid return code', () => {
    const a = mockAddenda99();
    a.returnCode = 'R00';
    expect(a.validate()!.message).toContain('ReturnCode');
  });

  it('accepts custom return codes with opt', () => {
    const a = mockAddenda99();
    a.returnCode = 'R00';
    a.setValidation({ customReturnCodes: true });
    expect(a.validate()).toBeNull();
  });

  it('rejects wrong type code', () => {
    const a = mockAddenda99();
    a.typeCode = '05';
    expect(a.validate()).not.toBeNull();
  });

  it('handles dateOfDeath field', () => {
    const a = mockAddenda99();
    a.dateOfDeath = '';
    expect([...a.dateOfDeathField()].length).toBe(6);

    a.dateOfDeath = '220101';
    expect(a.dateOfDeathField()).toBe('220101');
  });
});

describe('lookupChangeCode', () => {
  it('finds known change codes', () => {
    expect(lookupChangeCode('C01')!.code).toBe('C01');
    expect(lookupChangeCode('c01')!.code).toBe('C01');
    expect(lookupChangeCode('C09')!.code).toBe('C09');
  });

  it('returns null for unknown', () => {
    expect(lookupChangeCode('C99')).toBeNull();
  });
});

describe('isRefusedChangeCode', () => {
  it('identifies refused change codes', () => {
    expect(isRefusedChangeCode('C61')).toBe(true);
    expect(isRefusedChangeCode('C69')).toBe(true);
    expect(isRefusedChangeCode('C01')).toBe(false);
  });
});

describe('lookupReturnCode', () => {
  it('finds known return codes', () => {
    expect(lookupReturnCode('R01')!.code).toBe('R01');
    expect(lookupReturnCode('r01')!.code).toBe('R01');
    expect(lookupReturnCode('R90')!.code).toBe('R90');
  });

  it('returns null for unknown', () => {
    expect(lookupReturnCode('R00')).toBeNull();
  });
});

// =========================================================================
// Expanded Addenda02 Tests (Go parity)
// =========================================================================
describe('Addenda02 (expanded)', () => {
  function mockAddenda02(): Addenda02 {
    const a = newAddenda02();
    a.referenceInformationOne = 'REF123';
    a.referenceInformationTwo = 'AB';
    a.terminalIdentificationCode = 'TERM01';
    a.transactionSerialNumber = 'SN0001';
    a.transactionDate = '0614';
    a.authorizationCodeOrExpireDate = 'AUTH01';
    a.terminalLocation = '123 Main St';
    a.terminalCity = 'New York';
    a.terminalState = 'NY';
    a.traceNumber = '121042880000001';
    return a;
  }

  it('rejects empty TypeCode', () => {
    const a = mockAddenda02();
    a.typeCode = '';
    expect(a.validate()!.message).toContain('TypeCode');
  });

  it('rejects empty TransactionDate', () => {
    const a = mockAddenda02();
    a.transactionDate = '';
    expect(a.validate()!.message).toContain('TransactionDate');
  });

  it('rejects empty TerminalLocation', () => {
    const a = mockAddenda02();
    a.terminalLocation = '';
    expect(a.validate()!.message).toContain('TerminalLocation');
  });

  it('rejects empty TerminalCity', () => {
    const a = mockAddenda02();
    a.terminalCity = '';
    expect(a.validate()!.message).toContain('TerminalCity');
  });

  it('rejects empty TerminalState', () => {
    const a = mockAddenda02();
    a.terminalState = '';
    expect(a.validate()!.message).toContain('TerminalState');
  });

  it('accepts valid date 0205', () => {
    const a = mockAddenda02();
    a.transactionDate = '0205';
    expect(a.validate()).toBeNull();
  });

  it('rejects Feb 30 (0230)', () => {
    const a = mockAddenda02();
    a.transactionDate = '0230';
    expect(a.validate()).not.toBeNull();
  });

  it('accepts valid 30-day month (0630)', () => {
    const a = mockAddenda02();
    a.transactionDate = '0630';
    expect(a.validate()).toBeNull();
  });

  it('accepts valid 31-day month (0131)', () => {
    const a = mockAddenda02();
    a.transactionDate = '0131';
    expect(a.validate()).toBeNull();
  });

  it('rejects invalid day 39 (1039)', () => {
    const a = mockAddenda02();
    a.transactionDate = '1039';
    expect(a.validate()).not.toBeNull();
  });

  it('rejects non-alphanumeric in alphanumeric fields', () => {
    const fields: Array<keyof Addenda02> = [
      'referenceInformationOne',
      'referenceInformationTwo',
      'terminalIdentificationCode',
      'transactionSerialNumber',
      'authorizationCodeOrExpireDate',
      'terminalLocation',
      'terminalCity',
      'terminalState',
    ];
    for (const field of fields) {
      const a = mockAddenda02();
      (a as any)[field] = '®';
      const err = a.validate();
      expect(err, `field ${field} should reject ®`).not.toBeNull();
    }
  });

  it('allows special characters with allowSpecialCharacters opt', () => {
    const a = mockAddenda02();
    a.terminalLocation = 'Łomża';
    a.setValidation({ allowSpecialCharacters: true });
    expect(a.validate()).toBeNull();
  });

  it('field methods produce correct padding', () => {
    const a = mockAddenda02();
    expect([...a.referenceInformationOneField()].length).toBe(7);
    expect([...a.referenceInformationTwoField()].length).toBe(3);
    expect([...a.terminalIdentificationCodeField()].length).toBe(6);
    expect([...a.transactionSerialNumberField()].length).toBe(6);
    expect([...a.transactionDateField()].length).toBe(4);
    expect([...a.authorizationCodeOrExpireDateField()].length).toBe(6);
    expect([...a.terminalLocationField()].length).toBe(27);
    expect([...a.terminalCityField()].length).toBe(15);
    expect([...a.terminalStateField()].length).toBe(2);
    expect([...a.traceNumberField()].length).toBe(15);
  });
});

// =========================================================================
// Expanded Addenda05 Tests (Go parity)
// =========================================================================
describe('Addenda05 (expanded)', () => {
  function mockAddenda05(): Addenda05 {
    const a = newAddenda05();
    a.paymentRelatedInformation = 'Credit account  1 for payment';
    a.sequenceNumber = 1;
    a.entryDetailSequenceNumber = 1;
    return a;
  }

  it('rejects non-alphanumeric in paymentRelatedInformation', () => {
    const a = mockAddenda05();
    a.paymentRelatedInformation = '®©';
    expect(a.validate()).not.toBeNull();
  });

  it('allows special characters with allowSpecialCharacters opt', () => {
    const a = mockAddenda05();
    a.paymentRelatedInformation = 'Łomża payment';
    a.setValidation({ allowSpecialCharacters: true });
    expect(a.validate()).toBeNull();
  });

  it('field methods produce correct padding', () => {
    const a = mockAddenda05();
    expect([...a.paymentRelatedInformationField()].length).toBe(80);
    expect(a.sequenceNumberField()).toBe('0001');
    expect(a.entryDetailSequenceNumberField()).toBe('0000001');
  });
});

// =========================================================================
// Expanded Addenda98 Tests (Go parity)
// =========================================================================
describe('Addenda98 (expanded)', () => {
  function mockAddenda98(): Addenda98 {
    const a = newAddenda98();
    a.changeCode = 'C01';
    a.originalTrace = '121042880000001';
    a.originalDFI = '12104288';
    a.correctedData = '1918171614';
    a.traceNumber = '091012980000088';
    return a;
  }

  it('validates with C13 change code', () => {
    const a = mockAddenda98();
    a.changeCode = 'C13';
    expect(a.validate()).toBeNull();
  });

  it('rejects empty TypeCode', () => {
    const a = mockAddenda98();
    a.typeCode = '';
    expect(a.validate()!.message).toContain('TypeCode');
  });

  it('originalTraceField pads short values', () => {
    const a = mockAddenda98();
    a.originalTrace = '12345';
    expect(a.originalTraceField()).toBe('000000000012345');
    expect([...a.originalTraceField()].length).toBe(15);
  });

  it('originalDFIField pads short values', () => {
    const a = mockAddenda98();
    a.originalDFI = '9101298';
    expect(a.originalDFIField()).toBe('09101298');
    expect([...a.originalDFIField()].length).toBe(8);
  });

  it('correctedDataField pads to 29 chars', () => {
    const a = mockAddenda98();
    a.correctedData = '1918171614';
    expect([...a.correctedDataField()].length).toBe(29);
  });

  it('traceNumberField pads short values', () => {
    const a = mockAddenda98();
    a.traceNumber = '91012980000088';
    expect(a.traceNumberField()).toBe('091012980000088');
    expect([...a.traceNumberField()].length).toBe(15);
  });

  it('changeCodeField returns lookup for valid code', () => {
    const a = mockAddenda98();
    a.changeCode = 'C01';
    const cc = a.changeCodeField();
    expect(cc).not.toBeNull();
    expect(cc!.code).toBe('C01');
  });

  it('changeCodeField returns lookup for C07', () => {
    const a = mockAddenda98();
    a.changeCode = 'C07';
    const cc = a.changeCodeField();
    expect(cc).not.toBeNull();
    expect(cc!.code).toBe('C07');
  });

  it('changeCodeField returns null for unknown code', () => {
    const a = mockAddenda98();
    a.changeCode = 'C99';
    expect(a.changeCodeField()).toBeNull();
  });
});

// =========================================================================
// Expanded Addenda99 Tests (Go parity)
// =========================================================================
describe('Addenda99 (expanded)', () => {
  function mockAddenda99(): Addenda99 {
    const a = newAddenda99();
    a.returnCode = 'R01';
    a.originalTrace = '121042880000001';
    a.originalDFI = '12104288';
    a.traceNumber = '091012980000088';
    return a;
  }

  it('validates with R13 return code', () => {
    const a = mockAddenda99();
    a.returnCode = 'R13';
    expect(a.validate()).toBeNull();
  });

  it('rejects empty ReturnCode', () => {
    const a = mockAddenda99();
    a.returnCode = '';
    expect(a.validate()!.message).toContain('ReturnCode');
  });

  it('rejects empty TypeCode', () => {
    const a = mockAddenda99();
    a.typeCode = '';
    expect(a.validate()).not.toBeNull();
  });

  it('originalTraceField pads short values', () => {
    const a = mockAddenda99();
    a.originalTrace = '12345';
    expect(a.originalTraceField()).toBe('000000000012345');
    expect([...a.originalTraceField()].length).toBe(15);
  });

  it('originalDFIField pads short values', () => {
    const a = mockAddenda99();
    a.originalDFI = '9101298';
    expect(a.originalDFIField()).toBe('09101298');
    expect([...a.originalDFIField()].length).toBe(8);
  });

  it('addendaInformationField pads to 44 chars', () => {
    const a = mockAddenda99();
    a.addendaInformation = 'Authorization Revoked';
    expect([...a.addendaInformationField()].length).toBe(44);
    expect(a.addendaInformationField().startsWith('Authorization Revoked')).toBe(true);
  });

  it('traceNumberField pads short values', () => {
    const a = mockAddenda99();
    a.traceNumber = '91012980000066';
    expect(a.traceNumberField()).toBe('091012980000066');
    expect([...a.traceNumberField()].length).toBe(15);
  });

  it('returnCodeField returns lookup for valid code', () => {
    const a = mockAddenda99();
    a.returnCode = 'R01';
    const rc = a.returnCodeField();
    expect(rc).not.toBeNull();
    expect(rc!.code).toBe('R01');
  });

  it('returnCodeField returns null for unknown code', () => {
    const a = mockAddenda99();
    a.returnCode = 'R00';
    expect(a.returnCodeField()).toBeNull();
  });

  it('all known return codes validate and produce 94-char string', () => {
    const knownCodes = [
      'R01', 'R02', 'R03', 'R04', 'R05', 'R06', 'R07', 'R08', 'R09', 'R10',
      'R11', 'R12', 'R13', 'R14', 'R15', 'R16', 'R17', 'R18', 'R19', 'R20',
      'R21', 'R22', 'R23', 'R24', 'R25', 'R26', 'R27', 'R28', 'R29', 'R30',
      'R31', 'R32', 'R33', 'R34', 'R35', 'R36', 'R37', 'R38', 'R39', 'R40',
      'R41', 'R42', 'R43', 'R44', 'R45', 'R46', 'R47',
      'R50', 'R51', 'R52', 'R53',
      'R61', 'R62', 'R67', 'R68', 'R69', 'R70',
      'R71', 'R72', 'R73', 'R74', 'R75', 'R76', 'R77',
      'R80', 'R81', 'R82', 'R83', 'R84', 'R85',
      'R90',
    ];
    for (const code of knownCodes) {
      const a = mockAddenda99();
      a.returnCode = code;
      expect(a.validate(), `return code ${code} should validate`).toBeNull();
      expect([...a.string()].length, `return code ${code} string should be 94 chars`).toBe(94);
    }
  });
});
