import { describe, it, expect } from 'vitest';
import {
  ADVEntryDetail,
  ADVBatchControl,
  ADVFileControl,
  AutomatedAccountingAdvices,
} from '../src/index.js';

// =========================================================================
// ADV Entry Detail Tests
// =========================================================================
describe('ADVEntryDetail', () => {
  const mockRecord =
    '681231380104744-5678-99    00000005000012104288211131 Name                    0011000010500001';

  function mockADVEntryDetail(): ADVEntryDetail {
    const ed = new ADVEntryDetail();
    ed.transactionCode = 81;
    ed.rdfiIdentification = '23138010';
    ed.checkDigit = '4';
    ed.dfiAccountNumber = '744-5678-99    ';
    ed.amount = 50000;
    ed.adviceRoutingNumber = '121042882';
    ed.fileIdentification = '11131';
    ed.achOperatorData = ' ';
    ed.individualName = 'Name                  ';
    ed.discretionaryData = '00';
    ed.addendaRecordIndicator = 1;
    ed.achOperatorRoutingNumber = '10000105';
    ed.julianDay = 0;
    ed.sequenceNumber = 1;
    return ed;
  }

  it('should parse a record string', () => {
    const ed = new ADVEntryDetail();
    ed.parse(mockRecord);

    expect(ed.transactionCode).toBe(81);
    expect(ed.rdfiIdentification).toBe('23138010');
    expect(ed.checkDigit).toBe('4');
    expect(ed.amount).toBe(50000);
    expect(ed.adviceRoutingNumber).toBe('121042882');
    expect(ed.fileIdentification).toBe('11131');
    expect(ed.sequenceNumber).toBe(1);
  });

  it('should round-trip parse and string', () => {
    const ed = new ADVEntryDetail();
    ed.parse(mockRecord);
    expect(ed.string()).toBe(mockRecord);
  });

  it('should validate invalid TransactionCode', () => {
    const ed = mockADVEntryDetail();
    ed.transactionCode = 63;
    ed.julianDay = 50; // satisfy field inclusion
    const err = ed.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('TransactionCode');
  });

  it('should reject non-alphanumeric DFIAccountNumber', () => {
    const ed = mockADVEntryDetail();
    ed.julianDay = 50; // fix field inclusion
    ed.dfiAccountNumber = '744®5678-99    ';
    const err = ed.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('DFIAccountNumber');
  });

  it('should reject non-alphanumeric IndividualName', () => {
    const ed = mockADVEntryDetail();
    ed.julianDay = 50;
    ed.individualName = 'Name®                 ';
    const err = ed.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('IndividualName');
  });

  it('should fail field inclusion when TransactionCode is 0', () => {
    const ed = new ADVEntryDetail();
    const err = ed.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('TransactionCode');
  });

  it('should set RDFI from 9-digit routing number', () => {
    const ed = new ADVEntryDetail();
    ed.setRDFI('231380104');
    expect(ed.rdfiIdentification).toBe('23138010');
    expect(ed.checkDigit).toBe('4');
  });

  it('should format field methods correctly', () => {
    const ed = mockADVEntryDetail();
    expect(ed.rdfiIdentificationField()).toBe('23138010');
    expect(ed.amountField()).toBe('000000050000');
    expect(ed.adviceRoutingNumberField()).toBe('121042882');
    expect(ed.fileIdentificationField()).toBe('11131');
    expect(ed.sequenceNumberField()).toBe('0001');
  });

  it('should not parse a record of wrong length', () => {
    const ed = new ADVEntryDetail();
    ed.parse('too short');
    expect(ed.transactionCode).toBe(0);
  });
});

// =========================================================================
// ADV Batch Control Tests
// =========================================================================
describe('ADVBatchControl', () => {
  const mockRecord =
    '828000000100053200010000000000000001050000000000000000000000T-BANK             076401250000001';

  function mockADVBatchControl(): ADVBatchControl {
    const bc = new ADVBatchControl();
    bc.serviceClassCode = AutomatedAccountingAdvices;
    bc.entryAddendaCount = 1;
    bc.entryHash = 5320001;
    bc.totalDebitEntryDollarAmount = 10500;
    bc.totalCreditEntryDollarAmount = 0;
    bc.achOperatorData = 'T-BANK';
    bc.odfiIdentification = '07640125';
    bc.batchNumber = 1;
    return bc;
  }

  it('should parse a record string', () => {
    const bc = new ADVBatchControl();
    bc.parse(mockRecord);

    expect(bc.serviceClassCode).toBe(280);
    expect(bc.entryAddendaCount).toBe(1);
    expect(bc.entryHash).toBe(5320001);
    expect(bc.totalDebitEntryDollarAmount).toBe(10500);
    expect(bc.totalCreditEntryDollarAmount).toBe(0);
    expect(bc.achOperatorData).toBe('T-BANK');
    expect(bc.odfiIdentification).toBe('07640125');
    expect(bc.batchNumber).toBe(1);
  });

  it('should round-trip parse and string', () => {
    const bc = mockADVBatchControl();
    expect(bc.string()).toBe(mockRecord);
  });

  it('should fail validation with invalid ServiceClassCode', () => {
    const bc = mockADVBatchControl();
    bc.serviceClassCode = 123;
    const err = bc.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('ServiceClassCode');
  });

  it('should fail field inclusion when ServiceClassCode is 0', () => {
    const bc = new ADVBatchControl();
    bc.serviceClassCode = 0;
    const err = bc.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('ServiceClassCode');
  });

  it('should fail field inclusion when ODFIIdentification is empty', () => {
    const bc = mockADVBatchControl();
    bc.odfiIdentification = '';
    const err = bc.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('ODFIIdentification');
  });

  it('should format field methods correctly', () => {
    const bc = mockADVBatchControl();
    expect(bc.entryAddendaCountField()).toBe('000001');
    expect(bc.entryHashField()).toBe('0005320001');
    expect(bc.batchNumberField()).toBe('0000001');
  });
});

// =========================================================================
// ADV File Control Tests
// =========================================================================
describe('ADVFileControl', () => {
  const mockRecord =
    '90000010000010000000100053200010000000000000001050000000000000000000000                       ';

  function mockADVFileControl(): ADVFileControl {
    const fc = new ADVFileControl();
    fc.batchCount = 1;
    fc.blockCount = 1;
    fc.entryAddendaCount = 1;
    fc.entryHash = 5320001;
    fc.totalDebitEntryDollarAmountInFile = 10500;
    fc.totalCreditEntryDollarAmountInFile = 0;
    return fc;
  }

  it('should parse a record string', () => {
    const fc = new ADVFileControl();
    fc.parse(mockRecord);

    expect(fc.batchCount).toBe(1);
    expect(fc.blockCount).toBe(1);
    expect(fc.entryAddendaCount).toBe(1);
    expect(fc.entryHash).toBe(5320001);
    expect(fc.totalDebitEntryDollarAmountInFile).toBe(10500);
    expect(fc.totalCreditEntryDollarAmountInFile).toBe(0);
  });

  it('should round-trip parse and string', () => {
    const fc = mockADVFileControl();
    expect(fc.string()).toBe(mockRecord);
  });

  it('should fail validation when BatchCount is 0', () => {
    const fc = mockADVFileControl();
    fc.batchCount = 0;
    const err = fc.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('BatchCount');
  });

  it('should fail validation when BlockCount is 0', () => {
    const fc = mockADVFileControl();
    fc.blockCount = 0;
    const err = fc.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('BlockCount');
  });

  it('should fail validation when EntryAddendaCount is 0', () => {
    const fc = mockADVFileControl();
    fc.entryAddendaCount = 0;
    const err = fc.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('EntryAddendaCount');
  });

  it('should fail validation when EntryHash is 0', () => {
    const fc = mockADVFileControl();
    fc.entryHash = 0;
    const err = fc.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('EntryHash');
  });

  it('should format field methods correctly', () => {
    const fc = mockADVFileControl();
    expect(fc.batchCountField()).toBe('000001');
    expect(fc.blockCountField()).toBe('000001');
    expect(fc.entryAddendaCountField()).toBe('00000001');
    expect(fc.entryHashField()).toBe('0005320001');
  });

  it('should not parse a record that is too short', () => {
    const fc = new ADVFileControl();
    fc.parse('too short');
    expect(fc.batchCount).toBe(0);
  });
});
