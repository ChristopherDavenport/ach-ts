import { describe, it, expect } from 'vitest';
import { FileControl, BatchHeader, BatchControl } from '../src/index.js';

// =========================================================================
// FileControl Tests
// =========================================================================
describe('FileControl', () => {
  const mockRecord =
    '9000001000001000000010005320001000000010500000000000000                                       ';

  function mockFileControl(): FileControl {
    const fc = new FileControl();
    fc.batchCount = 1;
    fc.blockCount = 1;
    fc.entryAddendaCount = 1;
    fc.entryHash = 5320001;
    fc.totalDebitEntryDollarAmountInFile = 10500;
    fc.totalCreditEntryDollarAmountInFile = 0;
    return fc;
  }

  it('should parse a record string', () => {
    const fc = new FileControl();
    fc.parse(mockRecord);

    expect(fc.batchCount).toBe(1);
    expect(fc.blockCount).toBe(1);
    expect(fc.entryAddendaCount).toBe(1);
    expect(fc.entryHash).toBe(5320001);
    expect(fc.totalDebitEntryDollarAmountInFile).toBe(10500);
    expect(fc.totalCreditEntryDollarAmountInFile).toBe(0);
  });

  it('should round-trip parse and string', () => {
    const fc = mockFileControl();
    expect(fc.string()).toBe(mockRecord);
  });

  it('should fail validation when BlockCount is 0', () => {
    const fc = mockFileControl();
    fc.blockCount = 0;
    const err = fc.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('BlockCount');
  });

  it('should format field methods correctly', () => {
    const fc = mockFileControl();
    expect(fc.batchCountField()).toBe('000001');
    expect(fc.blockCountField()).toBe('000001');
    expect(fc.entryAddendaCountField()).toBe('00000001');
    expect(fc.entryHashField()).toBe('0005320001');
  });

  it('should not parse a record of wrong length', () => {
    const fc = new FileControl();
    fc.parse('too short');
    expect(fc.batchCount).toBe(0);
  });
});

// =========================================================================
// BatchHeader Tests
// =========================================================================
describe('BatchHeader', () => {
  const mockRecord =
    '5225companyname                         origid    PPDCHECKPAYMT000002190730   1076401250000001';

  it('should parse a record string', () => {
    const bh = new BatchHeader();
    bh.parse(mockRecord);

    expect(bh.serviceClassCode).toBe(225);
    expect(bh.standardEntryClassCode).toBe('PPD');
    expect(bh.companyEntryDescription).toBe('CHECKPAYMT');
    expect(bh.odfiIdentification).toBe('07640125');
    expect(bh.batchNumber).toBe(1);
  });

  it('should round-trip parse and string', () => {
    const bh = new BatchHeader();
    bh.parse(mockRecord);
    expect(bh.string()).toBe(mockRecord);
  });

  it('should reject invalid ServiceClassCode', () => {
    const bh = new BatchHeader();
    bh.parse(mockRecord);
    bh.serviceClassCode = 123;
    const err = bh.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('ServiceClassCode');
  });

  it('should not parse a record of wrong length', () => {
    const bh = new BatchHeader();
    bh.parse('too short');
    expect(bh.serviceClassCode).toBe(0);
  });
});

// =========================================================================
// BatchControl Tests
// =========================================================================
describe('BatchControl', () => {
  const mockRecord =
    '82250000010005320001000000010500000000000000origid                             076401250000001';

  it('should parse a record string', () => {
    const bc = new BatchControl();
    bc.parse(mockRecord);

    expect(bc.serviceClassCode).toBe(225);
    expect(bc.entryAddendaCount).toBe(1);
    expect(bc.entryHash).toBe(5320001);
    expect(bc.totalDebitEntryDollarAmount).toBe(10500);
    expect(bc.totalCreditEntryDollarAmount).toBe(0);
    expect(bc.odfiIdentification).toBe('07640125');
    expect(bc.batchNumber).toBe(1);
  });

  it('should round-trip parse and string', () => {
    const bc = new BatchControl();
    bc.parse(mockRecord);
    expect(bc.string()).toBe(mockRecord);
  });

  it('should reject invalid ServiceClassCode', () => {
    const bc = new BatchControl();
    bc.parse(mockRecord);
    bc.serviceClassCode = 123;
    const err = bc.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('ServiceClassCode');
  });

  it('should not parse a record of wrong length', () => {
    const bc = new BatchControl();
    bc.parse('too short');
    expect(bc.serviceClassCode).toBe(0);
  });
});
