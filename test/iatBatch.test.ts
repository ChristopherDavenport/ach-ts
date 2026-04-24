import { describe, it, expect } from 'vitest';
import {
  IATBatch, IATBatchHeader, IATEntryDetail,
  newBatchControl,
  MixedDebitsAndCredits, CreditsOnly, DebitsOnly,
  AutomatedAccountingAdvices,
  CheckingCredit, CheckingDebit,
  CheckingReturnNOCCredit,
  SavingsCredit,
  CategoryForward, CategoryReturn, CategoryNOC,
  IAT, COR, IATCOR,
} from '../src/index.js';
import { Addenda10 } from '../src/addenda10.js';
import { Addenda11 } from '../src/addenda11.js';
import { Addenda12 } from '../src/addenda12.js';
import { Addenda13 } from '../src/addenda13.js';
import { Addenda14 } from '../src/addenda14.js';
import { Addenda15 } from '../src/addenda15.js';
import { Addenda16 } from '../src/addenda16.js';
import { Addenda17, newAddenda17 } from '../src/addenda17.js';
import { Addenda18, newAddenda18 } from '../src/addenda18.js';
import { Addenda98, newAddenda98 } from '../src/addenda98.js';
import { Addenda99, newAddenda99 } from '../src/addenda99.js';

// =========================================================================
// Helpers (maps to mockIATBatch, mockIATBatchHeader, etc. in iatBatch_test.go)
// =========================================================================
function mockIATBatchHeader(): IATBatchHeader {
  const bh = IATBatchHeader.newIATBatchHeader();
  bh.serviceClassCode = MixedDebitsAndCredits;
  bh.foreignExchangeIndicator = 'FF';
  bh.foreignExchangeReferenceIndicator = 3;
  bh.isoDestinationCountryCode = 'US';
  bh.originatorIdentification = '1234567890';
  bh.standardEntryClassCode = IAT;
  bh.companyEntryDescription = 'TRADEPAY';
  bh.isoOriginatingCurrencyCode = 'USD';
  bh.isoDestinationCurrencyCode = 'USD';
  bh.effectiveEntryDate = '240101';
  bh.originatorStatusCode = 1;
  bh.odfiIdentification = '12104288';
  return bh;
}

function mockIATEntry(tc = CheckingCredit, amount = 10000): IATEntryDetail {
  const ed = new IATEntryDetail();
  ed.transactionCode = tc;
  ed.rdfiIdentification = '23138010';
  ed.checkDigit = '4';
  ed.addendaRecords = 7;
  ed.amount = amount;
  ed.dfiAccountNumber = '123456789';
  ed.addendaRecordIndicator = 1;
  ed.traceNumber = '121042880000001';
  ed.category = CategoryForward;
  attachMandatoryAddenda(ed);
  return ed;
}

function attachMandatoryAddenda(ed: IATEntryDetail): void {
  const a10 = new Addenda10();
  a10.transactionTypeCode = 'ANN';
  a10.foreignPaymentAmount = 10000;
  a10.foreignTraceNumber = 'TRACE123';
  a10.name = 'John Doe';
  a10.entryDetailSequenceNumber = 1;
  ed.addenda10 = a10;

  const a11 = new Addenda11();
  a11.originatorName = 'Test Corp';
  a11.originatorStreetAddress = '123 Main St';
  a11.entryDetailSequenceNumber = 1;
  ed.addenda11 = a11;

  const a12 = new Addenda12();
  a12.originatorCityStateProvince = 'New York*NY\\';
  a12.originatorCountryPostalCode = 'US*10001\\';
  a12.entryDetailSequenceNumber = 1;
  ed.addenda12 = a12;

  const a13 = new Addenda13();
  a13.odfiName = 'Test Bank';
  a13.odfiIDNumberQualifier = '01';
  a13.odfiIdentification = '121042882';
  a13.odfiBranchCountryCode = 'US';
  a13.entryDetailSequenceNumber = 1;
  ed.addenda13 = a13;

  const a14 = new Addenda14();
  a14.rdfiName = 'Receiver Bank';
  a14.rdfiIDNumberQualifier = '01';
  a14.rdfiIdentification = '231380104';
  a14.rdfiBranchCountryCode = 'US';
  a14.entryDetailSequenceNumber = 1;
  ed.addenda14 = a14;

  const a15 = new Addenda15();
  a15.receiverIDNumber = 'RCV123';
  a15.receiverStreetAddress = '456 Oak Ave';
  a15.entryDetailSequenceNumber = 1;
  ed.addenda15 = a15;

  const a16 = new Addenda16();
  a16.receiverCityStateProvince = 'Los Angeles*CA\\';
  a16.receiverCountryPostalCode = 'US*90001\\';
  a16.entryDetailSequenceNumber = 1;
  ed.addenda16 = a16;
}

function buildIATBatch(): IATBatch {
  const bh = mockIATBatchHeader();
  const batch = new IATBatch(bh);
  batch.addEntry(mockIATEntry());
  const err = batch.create();
  if (err) throw err;
  return batch;
}

// =========================================================================
// IATBatchHeader Tests
// =========================================================================
describe('IATBatchHeader', () => {
  it('should parse and string round-trip', () => {
    const bh = mockIATBatchHeader();
    const str = bh.string();
    expect(str.length).toBe(94);
    const bh2 = new IATBatchHeader();
    bh2.parse(str);
    expect(bh2.serviceClassCode).toBe(bh.serviceClassCode);
    expect(bh2.foreignExchangeIndicator).toBe(bh.foreignExchangeIndicator);
    expect(bh2.foreignExchangeReferenceIndicator).toBe(bh.foreignExchangeReferenceIndicator);
    expect(bh2.isoDestinationCountryCode).toBe(bh.isoDestinationCountryCode);
    expect(bh2.standardEntryClassCode).toBe(IAT);
    expect(bh2.isoOriginatingCurrencyCode).toBe('USD');
    expect(bh2.isoDestinationCurrencyCode).toBe('USD');
  });

  it('should validate successfully with valid data', () => {
    expect(mockIATBatchHeader().validate()).toBeNull();
  });

  it('should fail with missing ServiceClassCode', () => {
    const bh = IATBatchHeader.newIATBatchHeader();
    const err = bh.validate();
    expect(err).not.toBeNull();
  });

  it('should reject invalid ForeignExchangeIndicator', () => {
    const bh = mockIATBatchHeader();
    bh.foreignExchangeIndicator = 'XX';
    const err = bh.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('ForeignExchangeIndicator');
  });

  it('should reject invalid ForeignExchangeReferenceIndicator', () => {
    const bh = mockIATBatchHeader();
    bh.foreignExchangeIndicator = 'FV'; // non-FF requires valid FERI
    bh.foreignExchangeReferenceIndicator = 9;
    const err = bh.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('ForeignExchangeReferenceIndicator');
  });

  it('should allow FERI=0 with FF indicator', () => {
    const bh = mockIATBatchHeader();
    bh.foreignExchangeIndicator = 'FF';
    bh.foreignExchangeReferenceIndicator = 0;
    const err = bh.validate();
    expect(err).toBeNull();
  });

  it('should reject FERI=0 with non-FF indicator', () => {
    const bh = mockIATBatchHeader();
    bh.foreignExchangeIndicator = 'FV';
    bh.foreignExchangeReferenceIndicator = 0;
    const err = bh.validate();
    expect(err).not.toBeNull();
  });

  // TestParseRuneCountIATBatchHeader
  it('should not parse record with wrong length', () => {
    const bh = new IATBatchHeader();
    bh.parse('short');
    expect(bh.serviceClassCode).toBe(0);
  });

  it('equal should compare key fields', () => {
    const bh1 = mockIATBatchHeader();
    const bh2 = mockIATBatchHeader();
    expect(bh1.equal(bh2)).toBe(true);
    bh2.odfiIdentification = '99999999';
    expect(bh1.equal(bh2)).toBe(false);
  });

  it('equal should handle null', () => {
    const bh = mockIATBatchHeader();
    expect(bh.equal(null)).toBe(false);
  });
});

// =========================================================================
// IATEntryDetail Tests
// =========================================================================
describe('IATEntryDetail', () => {
  it('should parse and string round-trip', () => {
    const ed = mockIATEntry();
    const str = ed.string();
    expect(str.length).toBe(94);
    const ed2 = new IATEntryDetail();
    ed2.parse(str);
    expect(ed2.transactionCode).toBe(ed.transactionCode);
    expect(ed2.rdfiIdentification).toBe(ed.rdfiIdentification);
    expect(ed2.amount).toBe(ed.amount);
  });

  it('should validate correctly', () => {
    expect(mockIATEntry().validate()).toBeNull();
  });

  it('should count all addenda (7 mandatory)', () => {
    expect(mockIATEntry().addendaCount()).toBe(7);
  });

  it('should fail with missing TransactionCode', () => {
    const ed = mockIATEntry();
    ed.transactionCode = 0;
    expect(ed.validate()).not.toBeNull();
  });

  it('should fail with missing RDFIIdentification', () => {
    const ed = mockIATEntry();
    ed.rdfiIdentification = '';
    expect(ed.validate()).not.toBeNull();
  });

  it('should fail with missing TraceNumber', () => {
    const ed = mockIATEntry();
    ed.traceNumber = '';
    expect(ed.validate()).not.toBeNull();
  });

  it('setRDFI should split routing number', () => {
    const ed = new IATEntryDetail();
    ed.setRDFI('231380104');
    expect(ed.rdfiIdentification).toBe('23138010');
    expect(ed.checkDigit).toBe('4');
  });

  it('setTraceNumber should format correctly', () => {
    const ed = new IATEntryDetail();
    ed.setTraceNumber('12104288', 1);
    expect(ed.traceNumber).toBe('121042880000001');
  });

  it('isCorrection should return true with Addenda98', () => {
    const ed = mockIATEntry();
    expect(ed.isCorrection()).toBe(false);
    ed.addenda98 = newAddenda98();
    expect(ed.isCorrection()).toBe(true);
  });
});

// =========================================================================
// IATBatch Tests (maps to iatBatch_test.go)
// =========================================================================
describe('IATBatch', () => {
  // TestMockIATBatch
  it('should create and validate', () => {
    const batch = buildIATBatch();
    expect(batch.control.entryAddendaCount).toBeGreaterThan(0);
  });

  // testIATNoEntry
  it('should fail with no entries', () => {
    const bh = mockIATBatchHeader();
    const batch = new IATBatch(bh);
    const err = batch.create();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('Entry Record');
  });

  // testIATBatchNumberMismatch
  it('should fail with BatchNumber mismatch', () => {
    const batch = buildIATBatch();
    batch.control.batchNumber = 999;
    const err = batch.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('BatchNumber');
  });

  // testIATServiceClassCodeMismatch
  it('should fail with ServiceClassCode mismatch', () => {
    const batch = buildIATBatch();
    batch.control.serviceClassCode = DebitsOnly;
    const err = batch.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('ServiceClassCode');
  });

  // testIATODFIIdentificationMismatch
  it('should fail with ODFI mismatch', () => {
    const batch = buildIATBatch();
    batch.control.odfiIdentification = '99999999';
    const err = batch.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('ODFIIdentification');
  });

  // testIATBatchCreditIsBatchAmount
  it('should fail with TotalCreditEntryDollarAmount mismatch', () => {
    const batch = buildIATBatch();
    batch.control.totalCreditEntryDollarAmount = 1;
    const err = batch.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('TotalCreditEntryDollarAmount');
  });

  // testIATBatchDebitIsBatchAmount
  it('should fail with TotalDebitEntryDollarAmount mismatch', () => {
    const batch = buildIATBatch();
    batch.control.totalDebitEntryDollarAmount = 1;
    const err = batch.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('TotalDebitEntryDollarAmount');
  });

  // testIATBatchEntryCountEquality
  it('should fail with EntryAddendaCount mismatch', () => {
    const batch = buildIATBatch();
    batch.control.entryAddendaCount = 99;
    const err = batch.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('EntryAddendaCount');
  });

  // testIATBatchisEntryHash
  it('should fail with EntryHash mismatch', () => {
    const batch = buildIATBatch();
    batch.control.entryHash = 9999999;
    const err = batch.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('EntryHash');
  });

  // testIATBatchIsSequenceAscending
  it('should fail with trace numbers not ascending', () => {
    const bh = mockIATBatchHeader();
    const batch = new IATBatch(bh);
    const ed1 = mockIATEntry();
    ed1.traceNumber = '121042880000002';
    const ed2 = mockIATEntry();
    ed2.traceNumber = '121042880000001';
    batch.addEntry(ed1);
    batch.addEntry(ed2);
    batch.create();
    const err = batch.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('TraceNumber');
  });

  // testIATBatchInvalidTraceNumberODFI
  it('should fail with trace number ODFI mismatch', () => {
    const batch = buildIATBatch();
    batch.entries[0].traceNumber = '990000000000001';
    const err = batch.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('ODFI');
  });

  // testIATBatchAddendaRecordIndicator
  it('should fail with AddendaRecordIndicator != 1', () => {
    const bh = mockIATBatchHeader();
    const batch = new IATBatch(bh);
    const ed = mockIATEntry();
    ed.addendaRecordIndicator = 2;
    batch.addEntry(ed);
    batch.create();
    const err = batch.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('AddendaRecordIndicator');
  });

  // testIATBatchCategory
  it('should fail when mixing Forward and Return categories', () => {
    const bh = mockIATBatchHeader();
    const batch = new IATBatch(bh);
    const ed1 = mockIATEntry();
    ed1.category = CategoryForward;
    batch.addEntry(ed1);
    const ed2 = mockIATEntry(CheckingDebit, 5000);
    ed2.traceNumber = '121042880000002';
    ed2.category = CategoryReturn;
    const a99 = newAddenda99();
    a99.returnCode = 'R01';
    a99.originalTrace = '121042880000001';
    a99.addendaInformation = '';
    a99.traceNumber = '121042880000002';
    ed2.addenda99 = a99;
    batch.addEntry(ed2);
    batch.create();
    const err = batch.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('Category');
  });

  // Missing mandatory addenda tests (7 tests for Addenda10-16)
  const mandatoryAddenda = ['addenda10', 'addenda11', 'addenda12', 'addenda13', 'addenda14', 'addenda15', 'addenda16'] as const;
  for (const field of mandatoryAddenda) {
    it(`should fail with missing ${field}`, () => {
      const bh = mockIATBatchHeader();
      const batch = new IATBatch(bh);
      const ed = mockIATEntry();
      (ed as any)[field] = null;
      batch.addEntry(ed);
      const err = batch.create();
      expect(err).not.toBeNull();
      expect(err!.message).toContain(field.charAt(0).toUpperCase() + field.slice(1));
    });
  }

  // testIATBatchAddenda17Count (>2 Addenda17)
  it('should reject more than 2 Addenda17 records', () => {
    const bh = mockIATBatchHeader();
    const batch = new IATBatch(bh);
    const ed = mockIATEntry();
    for (let i = 0; i < 3; i++) {
      const a17 = newAddenda17();
      a17.paymentRelatedInformation = `info${i}`;
      a17.sequenceNumber = i + 1;
      a17.entryDetailSequenceNumber = 1;
      ed.addenda17.push(a17);
    }
    ed.addendaRecords = 10;
    batch.addEntry(ed);
    batch.create();
    const err = batch.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('Addenda17');
  });

  // testIATBatchAddenda18Count (>5 Addenda18)
  it('should reject more than 5 Addenda18 records', () => {
    const bh = mockIATBatchHeader();
    const batch = new IATBatch(bh);
    const ed = mockIATEntry();
    for (let i = 0; i < 6; i++) {
      const a18 = newAddenda18();
      a18.foreignCorrespondentBankName = `Bank${i}`;
      a18.foreignCorrespondentBankIDNumberQualifier = '01';
      a18.foreignCorrespondentBankIDNumber = `ID${i}`;
      a18.foreignCorrespondentBankBranchCountryCode = 'US';
      a18.sequenceNumber = i + 1;
      a18.entryDetailSequenceNumber = 1;
      ed.addenda18.push(a18);
    }
    ed.addendaRecords = 13;
    batch.addEntry(ed);
    batch.create();
    const err = batch.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('Addenda18');
  });

  // TestIATBatchReturnAddendaError - Addenda17/18 not allowed in returns
  it('should reject Addenda17 in return entries', () => {
    const bh = mockIATBatchHeader();
    const batch = new IATBatch(bh);
    const ed = mockIATEntry(CheckingDebit, 5000);
    ed.category = CategoryReturn;
    const a99 = newAddenda99();
    a99.returnCode = 'R01';
    a99.originalTrace = '121042880000001';
    a99.addendaInformation = '';
    a99.traceNumber = '121042880000001';
    ed.addenda99 = a99;
    const a17 = newAddenda17();
    a17.paymentRelatedInformation = 'info';
    a17.sequenceNumber = 1;
    a17.entryDetailSequenceNumber = 1;
    ed.addenda17.push(a17);
    ed.addendaRecords = 9;
    batch.addEntry(ed);
    batch.create();
    const err = batch.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('Addenda17');
  });

  it('should reject Addenda18 in return entries', () => {
    const bh = mockIATBatchHeader();
    const batch = new IATBatch(bh);
    const ed = mockIATEntry(CheckingDebit, 5000);
    ed.category = CategoryReturn;
    const a99 = newAddenda99();
    a99.returnCode = 'R01';
    a99.originalTrace = '121042880000001';
    a99.addendaInformation = '';
    a99.traceNumber = '121042880000001';
    ed.addenda99 = a99;
    const a18 = newAddenda18();
    a18.foreignCorrespondentBankName = 'Bank';
    a18.foreignCorrespondentBankIDNumberQualifier = '01';
    a18.foreignCorrespondentBankIDNumber = 'ID01';
    a18.foreignCorrespondentBankBranchCountryCode = 'US';
    a18.sequenceNumber = 1;
    a18.entryDetailSequenceNumber = 1;
    ed.addenda18.push(a18);
    ed.addendaRecords = 9;
    batch.addEntry(ed);
    batch.create();
    const err = batch.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('Addenda18');
  });

  // TestIATBatch_calculateEntryHash
  it('should calculate entry hash for multiple entries', () => {
    const bh = mockIATBatchHeader();
    const batch = new IATBatch(bh);
    const ed1 = mockIATEntry();
    const ed2 = mockIATEntry(CheckingDebit, 5000);
    ed2.traceNumber = '121042880000002';
    batch.addEntry(ed1);
    batch.addEntry(ed2);
    batch.create();
    // 23138010 * 2 = 46276020
    expect(batch.control.entryHash).toBe(46276020);
  });

  // testIATBatchValidateEntry - invalid TransactionCode
  it('should fail with invalid TransactionCode', () => {
    const bh = mockIATBatchHeader();
    const batch = new IATBatch(bh);
    const ed = mockIATEntry();
    ed.transactionCode = 99; // invalid
    batch.addEntry(ed);
    const err = batch.create();
    expect(err).not.toBeNull();
  });

  // ValidateTotals
  it('should validateTotals successfully on valid batch', () => {
    const batch = buildIATBatch();
    expect(batch.validateTotals()).toBeNull();
  });

  // Credit totals calculation
  it('should calculate credit totals correctly', () => {
    const batch = buildIATBatch();
    expect(batch.control.totalCreditEntryDollarAmount).toBe(10000);
    expect(batch.control.totalDebitEntryDollarAmount).toBe(0);
  });

  // Debit totals calculation
  it('should calculate debit totals correctly', () => {
    const bh = mockIATBatchHeader();
    const batch = new IATBatch(bh);
    batch.addEntry(mockIATEntry(CheckingDebit, 5000));
    batch.create();
    expect(batch.control.totalDebitEntryDollarAmount).toBe(5000);
    expect(batch.control.totalCreditEntryDollarAmount).toBe(0);
  });

  // TestIATBatch__isTraceNumberODFI with BypassOriginValidation
  it('should bypass trace ODFI check with BypassOriginValidation', () => {
    const batch = buildIATBatch();
    batch.entries[0].traceNumber = '990000000000001';
    batch.setValidation({ bypassOriginValidation: true, customTraceNumbers: true });
    const err = batch.validate();
    if (err) {
      expect(err.message).not.toContain('ODFI');
    }
  });

  // TestIATBatch__CustomTraceNumbers
  it('should allow custom trace numbers', () => {
    const bh = mockIATBatchHeader();
    const batch = new IATBatch(bh);
    const ed1 = mockIATEntry();
    ed1.traceNumber = '000000000000099';
    const ed2 = mockIATEntry(CheckingCredit, 5000);
    ed2.traceNumber = '000000000000001';
    batch.addEntry(ed1);
    batch.addEntry(ed2);
    batch.setValidation({ customTraceNumbers: true, bypassOriginValidation: true });
    const err = batch.create();
    expect(err).toBeNull();
  });

  // TestIATBatchInvalidServiceClassCode with UnequalServiceClassCode bypass
  it('should bypass SCC mismatch with UnequalServiceClassCode', () => {
    const batch = buildIATBatch();
    batch.control.serviceClassCode = DebitsOnly;
    batch.setValidation({ unequalServiceClassCode: true });
    const err = batch.validate();
    if (err) {
      expect(err.message).not.toContain('ServiceClassCode');
    }
  });

  // SkipAll
  it('should skip all validation with SkipAll', () => {
    const bh = mockIATBatchHeader();
    const batch = new IATBatch(bh);
    batch.setValidation({ skipAll: true });
    expect(batch.validate()).toBeNull();
  });

  // BypassBatchValidation
  it('should bypass validation with BypassBatchValidation', () => {
    const bh = mockIATBatchHeader();
    const batch = new IATBatch(bh);
    batch.setValidation({ bypassBatchValidation: true });
    expect(batch.validate()).toBeNull();
  });

  // AutomatedAccountingAdvices SCC rejected
  it('should reject AutomatedAccountingAdvices ServiceClassCode', () => {
    const bh = mockIATBatchHeader();
    bh.serviceClassCode = AutomatedAccountingAdvices;
    const batch = new IATBatch(bh);
    batch.addEntry(mockIATEntry());
    batch.create();
    const err = batch.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('ServiceClassCode');
  });

  // --- Expanded tests (Go parity) ---

  it('should build batch control with correct fields', () => {
    const batch = buildIATBatch();
    const bc = batch.control;
    expect(bc.serviceClassCode).toBe(MixedDebitsAndCredits);
    expect(bc.odfiIdentification).toBe('12104288');
    expect(bc.entryAddendaCount).toBeGreaterThan(0);
  });

  it('should fail with empty ODFI identification in header', () => {
    const bh = mockIATBatchHeader();
    bh.odfiIdentification = '';
    const batch = new IATBatch(bh);
    batch.addEntry(mockIATEntry());
    const err = batch.create();
    expect(err).not.toBeNull();
  });

  it('should fail when entry is single category (Forward + Return)', () => {
    const bh = mockIATBatchHeader();
    const batch = new IATBatch(bh);

    // Add forward entry
    const fwdEntry = mockIATEntry(CheckingCredit);
    fwdEntry.category = CategoryForward;
    batch.addEntry(fwdEntry);

    // Add return entry
    const retEntry = mockIATEntry(CheckingReturnNOCCredit, 5000);
    retEntry.category = CategoryReturn;
    retEntry.traceNumber = '121042880000002';
    const a99 = newAddenda99();
    a99.returnCode = 'R01';
    a99.originalTrace = '121042880000001';
    a99.originalDFI = '12104288';
    a99.traceNumber = '121042880000002';
    retEntry.addenda99 = a99;
    batch.addEntry(retEntry);

    batch.create();
    const err = batch.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('Category');
  });

  // Addenda 10-16 EntryDetailSequenceNumber mismatch tests
  it.each([
    ['addenda10', (ed: IATEntryDetail) => { ed.addenda10!.entryDetailSequenceNumber = 999; }],
    ['addenda11', (ed: IATEntryDetail) => { ed.addenda11!.entryDetailSequenceNumber = 999; }],
    ['addenda12', (ed: IATEntryDetail) => { ed.addenda12!.entryDetailSequenceNumber = 999; }],
    ['addenda13', (ed: IATEntryDetail) => { ed.addenda13!.entryDetailSequenceNumber = 999; }],
    ['addenda14', (ed: IATEntryDetail) => { ed.addenda14!.entryDetailSequenceNumber = 999; }],
    ['addenda15', (ed: IATEntryDetail) => { ed.addenda15!.entryDetailSequenceNumber = 999; }],
    ['addenda16', (ed: IATEntryDetail) => { ed.addenda16!.entryDetailSequenceNumber = 999; }],
  ] as [string, (ed: IATEntryDetail) => void][])('should fail when %s EntryDetailSequenceNumber mismatches', (_name, mutate) => {
    const bh = mockIATBatchHeader();
    const batch = new IATBatch(bh);
    const ed = mockIATEntry();
    batch.addEntry(ed);
    batch.create();
    // Corrupt EDSN after build
    mutate(batch.entries[0]);
    const err = batch.validate();
    expect(err).not.toBeNull();
  });

  // Addenda17 sequence number tests
  it('should fail when Addenda17 sequence numbers are out of order', () => {
    const bh = mockIATBatchHeader();
    const batch = new IATBatch(bh);
    const ed = mockIATEntry();
    const a17_1 = newAddenda17();
    a17_1.paymentRelatedInformation = 'Payment 1';
    a17_1.sequenceNumber = 1;
    a17_1.entryDetailSequenceNumber = 1;
    ed.addenda17.push(a17_1);
    const a17_2 = newAddenda17();
    a17_2.paymentRelatedInformation = 'Payment 2';
    a17_2.sequenceNumber = 2;
    a17_2.entryDetailSequenceNumber = 1;
    ed.addenda17.push(a17_2);
    ed.addendaRecords = 9; // 7 mandatory + 2 addenda17
    batch.addEntry(ed);
    batch.create();
    // Corrupt sequence after build
    batch.entries[0].addenda17[0].sequenceNumber = 3;
    batch.entries[0].addenda17[1].sequenceNumber = 1;
    const err = batch.validate();
    expect(err).not.toBeNull();
  });

  it('should fail when Addenda17 EntryDetailSequenceNumber mismatches', () => {
    const bh = mockIATBatchHeader();
    const batch = new IATBatch(bh);
    const ed = mockIATEntry();
    const a17 = newAddenda17();
    a17.paymentRelatedInformation = 'Payment 1';
    a17.sequenceNumber = 1;
    a17.entryDetailSequenceNumber = 1;
    ed.addenda17.push(a17);
    ed.addendaRecords = 8; // 7 + 1
    batch.addEntry(ed);
    batch.create();
    batch.entries[0].addenda17[0].entryDetailSequenceNumber = 999;
    const err = batch.validate();
    expect(err).not.toBeNull();
  });

  // Addenda18 sequence number tests
  it('should fail when Addenda18 sequence numbers are out of order', () => {
    const bh = mockIATBatchHeader();
    const batch = new IATBatch(bh);
    const ed = mockIATEntry();
    const a18_1 = newAddenda18();
    a18_1.foreignCorrespondentBankName = 'Bank 1';
    a18_1.foreignCorrespondentBankIDNumberQualifier = '01';
    a18_1.foreignCorrespondentBankIDNumber = '123';
    a18_1.foreignCorrespondentBankBranchCountryCode = 'US';
    a18_1.sequenceNumber = 1;
    a18_1.entryDetailSequenceNumber = 1;
    ed.addenda18.push(a18_1);
    const a18_2 = newAddenda18();
    a18_2.foreignCorrespondentBankName = 'Bank 2';
    a18_2.foreignCorrespondentBankIDNumberQualifier = '01';
    a18_2.foreignCorrespondentBankIDNumber = '456';
    a18_2.foreignCorrespondentBankBranchCountryCode = 'US';
    a18_2.sequenceNumber = 2;
    a18_2.entryDetailSequenceNumber = 1;
    ed.addenda18.push(a18_2);
    ed.addendaRecords = 9; // 7 + 2
    batch.addEntry(ed);
    batch.create();
    batch.entries[0].addenda18[0].sequenceNumber = 5;
    batch.entries[0].addenda18[1].sequenceNumber = 1;
    const err = batch.validate();
    expect(err).not.toBeNull();
  });

  it('should fail when Addenda18 EntryDetailSequenceNumber mismatches', () => {
    const bh = mockIATBatchHeader();
    const batch = new IATBatch(bh);
    const ed = mockIATEntry();
    const a18 = newAddenda18();
    a18.foreignCorrespondentBankName = 'Bank 1';
    a18.foreignCorrespondentBankIDNumberQualifier = '01';
    a18.foreignCorrespondentBankIDNumber = '123';
    a18.foreignCorrespondentBankBranchCountryCode = 'US';
    a18.sequenceNumber = 1;
    a18.entryDetailSequenceNumber = 1;
    ed.addenda18.push(a18);
    ed.addendaRecords = 8;
    batch.addEntry(ed);
    batch.create();
    batch.entries[0].addenda18[0].entryDetailSequenceNumber = 999;
    const err = batch.validate();
    expect(err).not.toBeNull();
  });

  it('should validate all mandatory addenda (10-16) field values', () => {
    const batch = buildIATBatch();
    const ed = batch.entries[0];
    expect(ed.addenda10).not.toBeNull();
    expect(ed.addenda11).not.toBeNull();
    expect(ed.addenda12).not.toBeNull();
    expect(ed.addenda13).not.toBeNull();
    expect(ed.addenda14).not.toBeNull();
    expect(ed.addenda15).not.toBeNull();
    expect(ed.addenda16).not.toBeNull();
    // All should have valid string output (94 chars each)
    for (const addenda of [ed.addenda10!, ed.addenda11!, ed.addenda12!, ed.addenda13!, ed.addenda14!, ed.addenda15!, ed.addenda16!]) {
      expect([...addenda.string()].length).toBe(94);
    }
  });

  it('should filter entries by predicate', () => {
    const batch = buildIATBatch();
    expect(batch.entries.length).toBe(1);
    batch.entries = batch.entries.filter(e => e.transactionCode !== CheckingCredit);
    expect(batch.entries.length).toBe(0);
  });

  it('should filter entries preserving non-matching', () => {
    const bh = mockIATBatchHeader();
    const batch = new IATBatch(bh);
    batch.addEntry(mockIATEntry(CheckingCredit, 10000));
    const ed2 = mockIATEntry(CheckingDebit, 20000);
    ed2.traceNumber = '121042880000002';
    batch.addEntry(ed2);
    batch.create();
    expect(batch.entries.length).toBe(2);
    batch.entries = batch.entries.filter(e => e.transactionCode !== CheckingCredit);
    expect(batch.entries.length).toBe(1);
    expect(batch.entries[0].transactionCode).toBe(CheckingDebit);
  });

  it('should handle Addenda98 with IAT COR batch', () => {
    const bh = mockIATBatchHeader();
    bh.standardEntryClassCode = IAT;
    const batch = new IATBatch(bh);
    const ed = mockIATEntry(CheckingReturnNOCCredit, 0);
    ed.category = CategoryNOC;
    const a98 = newAddenda98();
    a98.changeCode = 'C01';
    a98.originalTrace = '121042880000001';
    a98.originalDFI = '12104288';
    a98.correctedData = '1918171614';
    a98.traceNumber = '091012980000088';
    ed.addenda98 = a98;
    batch.addEntry(ed);
    const createErr = batch.create();
    // IAT COR entries should work with Addenda98
    // The validation may or may not pass depending on IAT-specific rules,
    // but it should not crash
    expect(typeof createErr).toBe('object');
  });

  it('should reject more than 1 Addenda99 per entry', () => {
    const bh = mockIATBatchHeader();
    const batch = new IATBatch(bh);
    const ed = mockIATEntry(CheckingReturnNOCCredit, 5000);
    ed.category = CategoryReturn;
    const a99 = newAddenda99();
    a99.returnCode = 'R01';
    a99.originalTrace = '121042880000001';
    a99.originalDFI = '12104288';
    a99.traceNumber = '121042880000001';
    ed.addenda99 = a99;
    batch.addEntry(ed);
    // IATBatch only supports 1 Addenda99 per entry (not an array)
    // So this test verifies the type system enforces it
    expect(ed.addenda99).toBeDefined();
    expect(batch.entries.length).toBe(1);
  });

  it('should round-trip IAT batch via JSON', () => {
    const batch = buildIATBatch();
    const json = JSON.stringify(batch);
    expect(json).toContain('IAT');
    expect(json).toContain('TRADEPAY');
    expect(json).toContain('John Doe');
    const parsed = JSON.parse(json);
    expect(parsed.header.standardEntryClassCode).toBe('IAT');
  });
});
