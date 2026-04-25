import { describe, it, expect } from 'vitest';
import {
  Addenda98Refused,
  Addenda99Dishonored,
  Addenda99Contested,
  lookupChangeCode,
} from '../src/index.js';
import { isDishonoredReturnCode } from '../src/addenda/addenda99Dishonored.js';
import { isContestedReturnCode } from '../src/addenda/addenda99Contested.js';

// =========================================================================
// Addenda98Refused Tests
// =========================================================================
describe('Addenda98Refused', () => {
  function mockAddenda98Refused(): Addenda98Refused {
    const a = new Addenda98Refused();
    a.refusedChangeCode = 'C62';
    a.originalTrace = '059999990000003';
    a.originalDFI = '05999999';
    a.correctedData = '68-6547';
    a.changeCode = 'C01';
    a.traceSequenceNumber = '0000002';
    a.traceNumber = '059999990000001';
    return a;
  }

  it('should round-trip string and parse', () => {
    const a = mockAddenda98Refused();
    const s = a.string();
    expect(s.length).toBe(94);

    const b = new Addenda98Refused();
    b.parse(s);
    expect(b.typeCode).toBe('98');
    expect(b.refusedChangeCode).toBe('C62');
    expect(b.originalTrace).toBe('059999990000003');
    expect(b.originalDFI).toBe('05999999');
    expect(b.correctedData).toBe('68-6547');
    expect(b.changeCode).toBe('C01');
    expect(b.traceSequenceNumber).toBe('0000002');
    expect(b.traceNumber).toBe('059999990000001');
  });

  it('should format field methods with shortened inputs', () => {
    const a = mockAddenda98Refused();
    a.originalTrace = '059993';
    a.traceNumber = '000123';
    expect(a.originalTraceField()).toBe('000000000059993');
    expect(a.traceNumberField()).toBe('000000000000123');
    expect(a.correctedDataField()).toBe('68-6547                      ');
  });

  it('should reject invalid RefusedChangeCode', () => {
    const a = mockAddenda98Refused();
    a.refusedChangeCode = 'X99';
    const err = a.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('RefusedChangeCode');
  });

  it('should reject empty CorrectedData', () => {
    const a = mockAddenda98Refused();
    a.correctedData = '';
    const err = a.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('CorrectedData');
  });

  it('should reject invalid ChangeCode', () => {
    const a = mockAddenda98Refused();
    a.changeCode = 'ZZZ';
    const err = a.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('ChangeCode');
  });

  it('should reject empty TraceSequenceNumber', () => {
    const a = mockAddenda98Refused();
    a.traceSequenceNumber = '';
    const err = a.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('TraceSequenceNumber');
  });

  it('should reject invalid TypeCode', () => {
    const a = mockAddenda98Refused();
    a.typeCode = '99';
    const err = a.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('TypeCode');
  });

  it('should return ChangeCode lookup for refusedChangeCodeField', () => {
    const a = mockAddenda98Refused();
    const code = a.refusedChangeCodeField();
    expect(code).not.toBeNull();
    expect(code!.code).toBe('C62');
  });

  it('should return ChangeCode lookup for changeCodeField', () => {
    const a = mockAddenda98Refused();
    const code = a.changeCodeField();
    expect(code).not.toBeNull();
    expect(code!.code).toBe('C01');
  });
});

// =========================================================================
// Addenda99Dishonored Tests
// =========================================================================
describe('Addenda99Dishonored', () => {
  const mockRecord1 =
    '799R6909100001137143222042712114530   1211453000251201170506                   091000011371432';

  const mockRecord2 =
    '799R68059999990000301      12391871   12391871000000117901                     059999990000001';

  it('should parse first record string', () => {
    const a = new Addenda99Dishonored();
    a.parse(mockRecord1);

    expect(a.typeCode).toBe('99');
    expect(a.dishonoredReturnReasonCode).toBe('R69');
    expect(a.originalEntryTraceNumber).toBe('091000011371432');
    expect(a.originalReceivingDFIIdentification).toBe('12114530');
    expect(a.returnTraceNumber).toBe('121145300025120');
    expect(a.returnSettlementDate).toBe('117');
    expect(a.returnReasonCode).toBe('05');
    expect(a.traceNumber).toBe('091000011371432');
  });

  it('should round-trip second record (no reserved data)', () => {
    // mockRecord1 has data in reserved positions 22-27 ("220427") that gets lost on round-trip.
    // mockRecord2 has blank reserved positions, so it round-trips cleanly.
    const a = new Addenda99Dishonored();
    a.parse(mockRecord2);
    expect(a.string()).toBe(mockRecord2);
  });

  it('should parse second record string', () => {
    const a = new Addenda99Dishonored();
    a.parse(mockRecord2);

    expect(a.typeCode).toBe('99');
    expect(a.dishonoredReturnReasonCode).toBe('R68');
    expect(a.originalEntryTraceNumber).toBe('059999990000301');
    expect(a.originalReceivingDFIIdentification).toBe('12391871');
    expect(a.returnTraceNumber).toBe('123918710000001');
    expect(a.returnSettlementDate).toBe('179');
    expect(a.returnReasonCode).toBe('01');
    expect(a.traceNumber).toBe('059999990000001');
  });

  it('should round-trip second record', () => {
    const a = new Addenda99Dishonored();
    a.parse(mockRecord2);
    expect(a.string()).toBe(mockRecord2);
  });

  it('should format field methods with shortened inputs', () => {
    const a = new Addenda99Dishonored();
    a.parse(mockRecord2);
    a.originalEntryTraceNumber = '0599999900301';
    a.returnTraceNumber = '123918710001';
    a.traceNumber = '05999900001';
    expect(a.originalEntryTraceNumberField()).toBe('000599999900301');
    expect(a.returnTraceNumberField()).toBe('000123918710001');
    expect(a.traceNumberField()).toBe('000005999900001');
  });

  it('should reject invalid DishonoredReturnReasonCode', () => {
    const a = new Addenda99Dishonored();
    a.parse(mockRecord1);
    a.dishonoredReturnReasonCode = 'R01';
    const err = a.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('DishonoredReturnReasonCode');
  });

  it('should accept valid codes with customReturnCodes', () => {
    const a = new Addenda99Dishonored();
    a.parse(mockRecord1);
    a.dishonoredReturnReasonCode = 'R01';
    a.setValidation({ customReturnCodes: true });
    expect(a.validate()).toBeNull();
  });

  it('should reject invalid TypeCode', () => {
    const a = new Addenda99Dishonored();
    a.parse(mockRecord1);
    a.typeCode = '98';
    const err = a.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('TypeCode');
  });
});

describe('isDishonoredReturnCode', () => {
  it.each(['R61', 'R62', 'R67', 'R68', 'R69', 'R70'])('should accept %s', (code) => {
    expect(isDishonoredReturnCode(code)).toBe(true);
  });

  it.each(['R01', 'R02', 'R71', 'R99', ''])('should reject %s', (code) => {
    expect(isDishonoredReturnCode(code)).toBe(false);
  });
});

// =========================================================================
// Addenda99Contested Tests
// =========================================================================
describe('Addenda99Contested', () => {
  function mockAddenda99Contested(): Addenda99Contested {
    const a = new Addenda99Contested();
    a.contestedReturnCode = 'R71';
    a.originalEntryTraceNumber = '059999990000301';
    a.dateOriginalEntryReturned = '167';
    a.originalReceivingDFIIdentification = '12391871';
    a.originalSettlementDate = '164';
    a.returnTraceNumber = '779999990000301';
    a.returnSettlementDate = '165';
    a.returnReasonCode = '01';
    a.dishonoredReturnTraceNumber = '889999990000301';
    a.dishonoredReturnSettlementDate = '166';
    a.dishonoredReturnReasonCode = '67';
    a.traceNumber = '123918710000001';
    return a;
  }

  it('should round-trip string and parse', () => {
    const a = mockAddenda99Contested();
    const s = a.string();
    expect(s.length).toBe(94);

    const b = new Addenda99Contested();
    b.parse(s);
    expect(b.typeCode).toBe('99');
    expect(b.contestedReturnCode).toBe('R71');
    expect(b.originalEntryTraceNumber).toBe('059999990000301');
    expect(b.dateOriginalEntryReturned).toBe('000167');
    expect(b.originalReceivingDFIIdentification).toBe('12391871');
    expect(b.originalSettlementDate).toBe('164');
    expect(b.returnTraceNumber).toBe('779999990000301');
    expect(b.returnSettlementDate).toBe('165');
    expect(b.returnReasonCode).toBe('01');
    expect(b.dishonoredReturnTraceNumber).toBe('889999990000301');
    expect(b.dishonoredReturnSettlementDate).toBe('166');
    expect(b.dishonoredReturnReasonCode).toBe('67');
    expect(b.traceNumber).toBe('123918710000001');
  });

  it('should format field methods with shortened inputs', () => {
    const a = mockAddenda99Contested();
    a.originalEntryTraceNumber = '0599999900301';
    a.dateOriginalEntryReturned = '167';
    a.returnTraceNumber = '1239187101';
    a.traceNumber = '1239187100001';
    expect(a.originalEntryTraceNumberField()).toBe('000599999900301');
    expect(a.dateOriginalEntryReturnedField()).toBe('000167');
    expect(a.returnTraceNumberField()).toBe('000001239187101');
    expect(a.traceNumberField()).toBe('001239187100001');
  });

  it('should reject invalid ContestedReturnCode', () => {
    const a = mockAddenda99Contested();
    a.contestedReturnCode = 'R01';
    const err = a.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('ContestedReturnCode');
  });

  it('should accept valid codes with customReturnCodes', () => {
    const a = mockAddenda99Contested();
    a.contestedReturnCode = 'R01';
    a.setValidation({ customReturnCodes: true });
    expect(a.validate()).toBeNull();
  });

  it('should reject invalid TypeCode', () => {
    const a = mockAddenda99Contested();
    a.typeCode = '98';
    const err = a.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('TypeCode');
  });
});

describe('isContestedReturnCode', () => {
  it.each(['R71', 'R72', 'R73', 'R74', 'R75', 'R76', 'R77'])('should accept %s', (code) => {
    expect(isContestedReturnCode(code)).toBe(true);
  });

  it.each(['R01', 'R68', 'R70', 'R78', ''])('should reject %s', (code) => {
    expect(isContestedReturnCode(code)).toBe(false);
  });
});
