import { describe, it, expect } from 'vitest';
import {
  Batch, newBatch, convertBatchType,
  BatchHeader, newBatchHeader, BatchControl, newBatchControl,
  EntryDetail, newEntryDetail,
  ADVEntryDetail, newADVEntryDetail,
  Addenda02, newAddenda02,
  Addenda05, newAddenda05, Addenda98, newAddenda98, Addenda99, newAddenda99,
  PPD, CCD, WEB, TEL, ACK, ARC, BOC, CIE, COR, CTX, DNE, ENR,
  MTE, POP, POS, RCK, SHR, TRC, TRX, XCK, ATX, ADV, IAT,
  MixedDebitsAndCredits, CreditsOnly, DebitsOnly,
  CheckingCredit, CheckingDebit, SavingsCredit, SavingsDebit,
  CheckingReturnNOCCredit, CheckingReturnNOCDebit,
  CheckingPrenoteCredit, CheckingPrenoteDebit,
  CheckingZeroDollarRemittanceCredit,
  SavingsZeroDollarRemittanceCredit,
  CategoryForward, CategoryReturn, CategoryNOC,
  OffsetChecking, OffsetSavings,
  readACHFile,
} from '../src/index.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Batcher, Offset } from '../src/index.js';
// Import batch types to trigger registration
import '../src/batches/index.js';

// =========================================================================
// Helpers (maps to Go mockBatchHeader, mockEntryDetail, etc.)
// =========================================================================
function mockBatchHeader(sec: string = PPD, scc = CreditsOnly): BatchHeader {
  const bh = newBatchHeader();
  bh.serviceClassCode = scc;
  bh.companyName = 'ACME CORP';
  bh.companyIdentification = '1234567890';
  bh.standardEntryClassCode = sec;
  bh.companyEntryDescription = 'PAYROLL';
  bh.originatorStatusCode = 1;
  bh.odfiIdentification = '12104288';
  return bh;
}

function mockEntry(amount = 100000000, tc = CheckingCredit): EntryDetail {
  const ed = newEntryDetail();
  ed.transactionCode = tc;
  ed.rdfiIdentification = '23138010';
  ed.checkDigit = '4';
  ed.dfiAccountNumber = '123456789';
  ed.amount = amount;
  ed.individualName = 'Wade Arnold';
  ed.traceNumber = '121042880000001';
  return ed;
}

/** Build a valid PPD batch for testing verification paths */
function buildBatch(sec = PPD, scc = CreditsOnly): Batch {
  const bh = mockBatchHeader(sec, scc);
  const [batch, err] = newBatch(bh);
  if (err) throw err;
  batch!.addEntry(mockEntry());
  const createErr = batch!.create();
  if (createErr) throw createErr;
  return batch as Batch;
}

// =========================================================================
// Core Batch Tests (maps to batch_test.go)
// =========================================================================
describe('Batch', () => {
  it('should create a new batch with header', () => {
    const bh = mockBatchHeader();
    const batch = new Batch(bh);
    expect(batch.header.standardEntryClassCode).toBe(PPD);
  });

  // testBatchNoEntry
  it('should fail with no entries', () => {
    const bh = mockBatchHeader();
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    const createErr = batch!.create();
    expect(createErr).not.toBeNull();
    expect(createErr!.message).toContain('Entry Record');
  });

  // testBatchNumberMismatch
  it('should fail with BatchNumber header != control', () => {
    const batch = buildBatch();
    batch.control.batchNumber = 999;
    const err = batch.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('BatchNumber');
  });

  // testBatchIsEntryHash
  it('should fail with wrong EntryHash', () => {
    const batch = buildBatch();
    batch.control.entryHash = 9999999;
    const err = batch.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('EntryHash');
  });

  // testCreditBatchIsBatchAmount
  it('should fail with TotalCreditEntryDollarAmount mismatch', () => {
    const batch = buildBatch();
    batch.control.totalCreditEntryDollarAmount = 1;
    const err = batch.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('TotalCreditEntryDollarAmount');
  });

  // testSavingsBatchIsBatchAmount
  it('should fail with TotalDebitEntryDollarAmount mismatch', () => {
    const bh = mockBatchHeader(PPD, DebitsOnly);
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    batch!.addEntry(mockEntry(50000, CheckingDebit));
    batch!.create();
    (batch as Batch).control.totalDebitEntryDollarAmount = 1;
    const valErr = batch!.validate();
    expect(valErr).not.toBeNull();
    expect(valErr!.message).toContain('TotalDebitEntryDollarAmount');
  });

  // testBatchEntryCountEquality
  it('should fail with EntryAddendaCount mismatch', () => {
    const batch = buildBatch();
    batch.control.entryAddendaCount = 99;
    const err = batch.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('EntryAddendaCount');
  });

  it('should allow EntryAddendaCount mismatch with UnequalAddendaCounts opt', () => {
    const batch = buildBatch();
    batch.control.entryAddendaCount = 99;
    batch.setValidation({ unequalAddendaCounts: true });
    const err = batch.validateTotals();
    expect(err).toBeNull();
  });

  // testBatchTraceNumberNotODFI
  it('should fail with Trace Number ODFI mismatch', () => {
    const batch = buildBatch();
    batch.entries[0].traceNumber = '990000000000001';
    const err = batch.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('ODFI');
  });

  // testBatchIsSequenceAscending
  it('should fail with trace numbers not ascending', () => {
    const bh = mockBatchHeader(PPD, CreditsOnly);
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    const ed1 = mockEntry(10000, CheckingCredit);
    ed1.traceNumber = '121042880000002';
    const ed2 = mockEntry(10000, CheckingCredit);
    ed2.traceNumber = '121042880000001';
    batch!.addEntry(ed1);
    batch!.addEntry(ed2);
    batch!.create();
    const valErr = batch!.validate();
    expect(valErr).not.toBeNull();
    expect(valErr!.message).toContain('TraceNumber');
  });

  // testBatchAddendaIndicator
  it('should fail with AddendaRecordIndicator=0 when addenda present', () => {
    const bh = mockBatchHeader(PPD, CreditsOnly);
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    const ed = mockEntry(10000, CheckingCredit);
    const a05 = newAddenda05();
    a05.paymentRelatedInformation = 'test';
    a05.sequenceNumber = 1;
    a05.entryDetailSequenceNumber = 1;
    ed.addenda05.push(a05);
    ed.addendaRecordIndicator = 0;
    batch!.addEntry(ed);
    batch!.create();
    const valErr = batch!.validate();
    expect(valErr).not.toBeNull();
    expect(valErr!.message).toContain('AddendaRecordIndicator');
  });

  // testBatchCategoryForwardReturn
  it('should fail when mixing Forward and Return categories', () => {
    const bh = mockBatchHeader(PPD, MixedDebitsAndCredits);
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    const ed1 = mockEntry(10000, CheckingCredit);
    ed1.category = CategoryForward;
    batch!.addEntry(ed1);
    const ed2 = mockEntry(10000, CheckingDebit);
    ed2.traceNumber = '121042880000002';
    ed2.category = CategoryReturn;
    ed2.addendaRecordIndicator = 1;
    const a99 = newAddenda99();
    a99.returnCode = 'R01';
    a99.originalTrace = '121042880000001';
    a99.addendaInformation = '';
    a99.traceNumber = '121042880000002';
    ed2.addenda99 = a99;
    batch!.addEntry(ed2);
    batch!.create();
    const valErr = batch!.validate();
    expect(valErr).not.toBeNull();
    expect(valErr!.message).toContain('Category');
  });

  // testNewBatchDefault
  it('should fail NewBatch with invalid SEC code', () => {
    const bh = mockBatchHeader('NIL');
    const [batch, err] = newBatch(bh);
    expect(err).not.toBeNull();
    expect(batch).toBeNull();
  });

  // testIATBatch
  it('should fail NewBatch with IAT SEC code', () => {
    const bh = mockBatchHeader(IAT);
    const [batch, err] = newBatch(bh);
    expect(err).not.toBeNull();
    expect(batch).toBeNull();
  });

  // TestBatchInvalidServiceClassCode
  it('should fail with ServiceClassCode header != control', () => {
    const batch = buildBatch();
    batch.control.serviceClassCode = DebitsOnly;
    const err = batch.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('ServiceClassCode');
  });

  it('should bypass ServiceClassCode mismatch with UnequalServiceClassCode opt', () => {
    const batch = buildBatch();
    batch.control.serviceClassCode = DebitsOnly;
    batch.setValidation({ unequalServiceClassCode: true });
    const err = batch.validate();
    if (err) {
      expect(err.message).not.toContain('ServiceClassCode');
    }
  });

  // TestBatchConvertBatchType
  it('should ConvertBatchType for all 21 SEC codes', () => {
    const allSEC = [ACK, ARC, ATX, BOC, CCD, CIE, COR, CTX, DNE, ENR,
      MTE, POP, POS, PPD, RCK, SHR, TEL, TRC, TRX, WEB, XCK];
    for (const sec of allSEC) {
      const bh = mockBatchHeader(sec);
      const batch = new Batch(bh);
      const converted = convertBatchType(batch);
      expect(converted).not.toBeNull();
    }
  });

  // testBatchFieldInclusion
  it('should fail field inclusion with empty ODFI', () => {
    const bh = mockBatchHeader();
    bh.odfiIdentification = '';
    const [batch, err] = newBatch(bh);
    if (batch) {
      batch.addEntry(mockEntry());
      const createErr = batch.create();
      expect(createErr).not.toBeNull();
    } else {
      expect(err).not.toBeNull();
    }
  });

  // TestBatch_calculateEntryHash
  it('should calculate entry hash for multiple entries', () => {
    const bh = mockBatchHeader(PPD, CreditsOnly);
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    const ed1 = mockEntry(10000, CheckingCredit);
    const ed2 = mockEntry(5000, CheckingCredit);
    ed2.traceNumber = '121042880000002';
    batch!.addEntry(ed1);
    batch!.addEntry(ed2);
    batch!.create();
    expect((batch as Batch).control.entryHash).toBe(46276020);
  });

  // TestBatch__isTraceNumberODFI with BypassOriginValidation
  it('should bypass trace number ODFI check with BypassOriginValidation', () => {
    const batch = buildBatch();
    batch.entries[0].traceNumber = '990000000000001';
    batch.setValidation({ bypassOriginValidation: true, customTraceNumbers: true });
    const err = batch.validate();
    if (err) {
      expect(err.message).not.toContain('ODFI');
    }
  });

  // TestBatch__CustomTraceNumbers
  it('should allow custom trace numbers with CustomTraceNumbers opt', () => {
    const bh = mockBatchHeader(PPD, CreditsOnly);
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    const ed1 = mockEntry(10000, CheckingCredit);
    ed1.traceNumber = '000000000000099';
    const ed2 = mockEntry(10000, CheckingCredit);
    ed2.traceNumber = '000000000000001';
    batch!.addEntry(ed1);
    batch!.addEntry(ed2);
    batch!.setValidation({ customTraceNumbers: true, bypassOriginValidation: true });
    const createErr = batch!.create();
    expect(createErr).toBeNull();
  });

  // TestBatch__CompanyIdentificationMismatch
  it('should fail with CompanyIdentification mismatch', () => {
    const batch = buildBatch();
    batch.control.companyIdentification = 'DIFFERENT';
    const err = batch.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('CompanyIdentification');
  });

  it('should bypass CompanyIdentification mismatch with opt', () => {
    const batch = buildBatch();
    batch.control.companyIdentification = 'DIFFERENT';
    batch.setValidation({ bypassCompanyIdentificationMatch: true });
    const err = batch.validate();
    if (err) {
      expect(err.message).not.toContain('CompanyIdentification');
    }
  });

  // TestBatch_DeleteEntries
  it('should delete entries by predicate', () => {
    const batch = buildBatch();
    expect(batch.entries.length).toBe(1);
    batch.deleteEntries(e => e.amount === 100000000);
    expect(batch.entries.length).toBe(0);
  });

  // ValidateTotals
  it('should validateTotals successfully on valid batch', () => {
    const batch = buildBatch();
    const err = batch.validateTotals();
    expect(err).toBeNull();
  });

  // Credit and debit calculations
  it('should calculate credit and debit totals correctly', () => {
    const bh = mockBatchHeader(PPD, MixedDebitsAndCredits);
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    batch!.addEntry(mockEntry(10000, CheckingCredit));
    const ed2 = mockEntry(5000, CheckingDebit);
    ed2.traceNumber = '121042880000002';
    batch!.addEntry(ed2);
    batch!.create();
    expect((batch as Batch).control.totalCreditEntryDollarAmount).toBe(10000);
    expect((batch as Batch).control.totalDebitEntryDollarAmount).toBe(5000);
  });

  // Addenda05 sequence number tracking
  it('should set addenda05 sequence numbers during build', () => {
    const bh = mockBatchHeader(PPD, CreditsOnly);
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    const ed = mockEntry(10000, CheckingCredit);
    const a05 = newAddenda05();
    a05.paymentRelatedInformation = 'Payment info';
    ed.addenda05.push(a05);
    ed.addendaRecordIndicator = 1;
    batch!.addEntry(ed);
    const createErr = batch!.create();
    expect(createErr).toBeNull();
    expect(ed.addenda05[0].sequenceNumber).toBe(1);
    expect(ed.addenda05[0].entryDetailSequenceNumber).toBeGreaterThan(0);
  });

  // Offset tests (maps to TestBatch__upsertOffsets*)
  it('should create offset entries for credits', () => {
    const bh = mockBatchHeader(PPD, CreditsOnly);
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    batch!.addEntry(mockEntry(10000, CheckingCredit));
    batch!.withOffset({
      routingNumber: '121042882',
      accountNumber: '9876543210',
      accountType: OffsetChecking,
      description: 'OFFSET',
    });
    const createErr = batch!.create();
    expect(createErr).toBeNull();
    expect((batch as Batch).entries.length).toBe(2);
    expect((batch as Batch).header.serviceClassCode).toBe(MixedDebitsAndCredits);
  });

  it('should create offset entries for debits', () => {
    const bh = mockBatchHeader(PPD, DebitsOnly);
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    batch!.addEntry(mockEntry(10000, CheckingDebit));
    batch!.withOffset({
      routingNumber: '121042882',
      accountNumber: '9876543210',
      accountType: OffsetChecking,
      description: 'OFFSET',
    });
    const createErr = batch!.create();
    expect(createErr).toBeNull();
    expect((batch as Batch).entries.length).toBe(2);
    expect((batch as Batch).header.serviceClassCode).toBe(MixedDebitsAndCredits);
  });

  it('should fail offset with invalid routing number', () => {
    const bh = mockBatchHeader(PPD, CreditsOnly);
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    batch!.addEntry(mockEntry(10000, CheckingCredit));
    batch!.withOffset({
      routingNumber: '00000000',
      accountNumber: '9876543210',
      accountType: OffsetChecking,
      description: 'OFFSET',
    });
    const createErr = batch!.create();
    expect(createErr).not.toBeNull();
    expect(createErr!.message).toContain('routing');
  });

  it('should fail offset with unknown account type', () => {
    const bh = mockBatchHeader(PPD, CreditsOnly);
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    batch!.addEntry(mockEntry(10000, CheckingCredit));
    batch!.withOffset({
      routingNumber: '121042882',
      accountNumber: '9876543210',
      accountType: 'invalid' as any,
      description: 'OFFSET',
    });
    const createErr = batch!.create();
    expect(createErr).not.toBeNull();
    expect(createErr!.message).toContain('account type');
  });

  // DNE originator status code check
  it('should fail DNE batch with wrong OriginatorStatusCode', () => {
    const bh = mockBatchHeader(DNE, CreditsOnly);
    bh.originatorStatusCode = 1;
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    const ed = mockEntry(0, CheckingPrenoteCredit);
    batch!.addEntry(ed);
    const createErr = batch!.create();
    expect(createErr).not.toBeNull();
    expect(createErr!.message).toContain('OriginatorStatusCode');
  });

  // ValidAmountForCodes - prenote must have zero amount
  it('should fail prenote with non-zero amount', () => {
    const bh = mockBatchHeader(PPD, CreditsOnly);
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    const ed = mockEntry(500, CheckingPrenoteCredit);
    batch!.addEntry(ed);
    const createErr = batch!.create();
    expect(createErr).not.toBeNull();
    expect(createErr!.message).toContain('Amount');
  });

  // ValidAmountForCodes - zero amount rejected unless allowed
  it('should fail non-prenote entry with zero amount', () => {
    const bh = mockBatchHeader(PPD, CreditsOnly);
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    const ed = mockEntry(0, CheckingCredit);
    batch!.addEntry(ed);
    const createErr = batch!.create();
    expect(createErr).not.toBeNull();
  });

  it('should allow zero amount with AllowZeroEntryAmount opt', () => {
    const bh = mockBatchHeader(PPD, CreditsOnly);
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    const ed = mockEntry(0, CheckingCredit);
    batch!.addEntry(ed);
    batch!.setValidation({ allowZeroEntryAmount: true });
    const createErr = batch!.create();
    expect(createErr).toBeNull();
  });

  // SkipAll
  it('should skip all validation with SkipAll opt', () => {
    const bh = mockBatchHeader(PPD, CreditsOnly);
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    batch!.setValidation({ skipAll: true });
    const valErr = batch!.validate();
    expect(valErr).toBeNull();
  });

  // BypassBatchValidation
  it('should bypass batch validation with BypassBatchValidation opt', () => {
    const bh = mockBatchHeader(PPD, CreditsOnly);
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    batch!.setValidation({ bypassBatchValidation: true });
    const valErr = batch!.validate();
    expect(valErr).toBeNull();
  });

  // TransactionCode/ServiceClassCode validation
  it('should fail credit TransactionCode with DebitsOnly ServiceClassCode', () => {
    const bh = mockBatchHeader(PPD, DebitsOnly);
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    // Add a credit entry to a debits-only batch
    batch!.addEntry(mockEntry(10000, CheckingCredit));
    const createErr = batch!.create();
    expect(createErr).not.toBeNull();
    expect(createErr!.message).toContain('TransactionCode');
  });

  it('should fail debit TransactionCode with CreditsOnly ServiceClassCode', () => {
    const bh = mockBatchHeader(PPD, CreditsOnly);
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    batch!.addEntry(mockEntry(10000, CheckingDebit));
    const createErr = batch!.create();
    expect(createErr).not.toBeNull();
    expect(createErr!.message).toContain('TransactionCode');
  });

  // --- Expanded tests (Go parity) ---

  it('should assign category based on transaction code', () => {
    // Forward entries always start as Forward (category set during parse)
    for (const tc of [CheckingCredit, CheckingDebit, SavingsCredit, SavingsDebit]) {
      const ed = mockEntry(10000, tc);
      expect(ed.category).toBe(CategoryForward);
    }
    // Return/NOC entries must have category explicitly set
    const retEd = mockEntry(10000, CheckingReturnNOCCredit);
    retEd.category = CategoryReturn;
    expect(retEd.category).toBe(CategoryReturn);
  });

  it('should fail with Addenda02 and wrong AddendaRecordIndicator', () => {
    const bh = mockBatchHeader(POS, DebitsOnly);
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    const ed = mockEntry(10000, CheckingDebit);
    const a02 = newAddenda02();
    a02.referenceInformationOne = 'REF123';
    a02.referenceInformationTwo = 'AB';
    a02.terminalIdentificationCode = 'TERM01';
    a02.transactionSerialNumber = 'SN0001';
    a02.transactionDate = '0614';
    a02.authorizationCodeOrExpireDate = 'AUTH01';
    a02.terminalLocation = '123 Main St';
    a02.terminalCity = 'New York';
    a02.terminalState = 'NY';
    a02.traceNumber = ed.traceNumber;
    ed.addenda02 = a02;
    ed.addendaRecordIndicator = 0; // wrong
    batch!.addEntry(ed);
    const createErr = batch!.create();
    expect(createErr).not.toBeNull();
    expect(createErr!.message).toContain('AddendaRecordIndicator');
  });

  it('should fail addenda05 sequence numbers out of order', () => {
    const bh = mockBatchHeader(CCD, CreditsOnly);
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    const ed = mockEntry(10000, CheckingCredit);
    ed.addendaRecordIndicator = 1;

    // Build creates with ascending sequence numbers, but verify checks them.
    // We need to bypass build's auto-sequencing and call validate directly.
    const a1 = newAddenda05();
    a1.paymentRelatedInformation = 'Payment 1';
    a1.sequenceNumber = 2;
    a1.entryDetailSequenceNumber = 1;
    ed.addenda05.push(a1);

    const a2 = newAddenda05();
    a2.paymentRelatedInformation = 'Payment 2';
    a2.sequenceNumber = 1;
    a2.entryDetailSequenceNumber = 1;
    ed.addenda05.push(a2);

    batch!.addEntry(ed);
    // build() will re-sequence addenda05, so build first then corrupt
    batch!.create();
    // Corrupt the sequence after build
    const entries = batch!.getEntries();
    entries[0].addenda05[0].sequenceNumber = 5;
    entries[0].addenda05[1].sequenceNumber = 1;
    const valErr = batch!.validate();
    expect(valErr).not.toBeNull();
    expect(valErr!.message).toContain('SequenceNumber');
  });

  it('should populate BatchControl from build', () => {
    const batch = buildBatch();
    const bc = batch.getControl();
    expect(bc.serviceClassCode).toBe(CreditsOnly);
    expect(bc.companyIdentification).toBe('1234567890');
    expect(bc.odfiIdentification).toBe('12104288');
    expect(bc.entryAddendaCount).toBeGreaterThan(0);
  });

  it('should calculate balanced offset for credits', () => {
    const bh = mockBatchHeader(PPD, CreditsOnly);
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    const ed = mockEntry(500000, CheckingCredit); // $5,000.00
    batch!.addEntry(ed);

    const offset: Offset = {
      routingNumber: '121042882',
      accountNumber: 'OFFSET-ACCT',
      accountType: OffsetChecking,
      description: 'OFFSET',
    };
    batch!.withOffset(offset);
    const createErr = batch!.create();
    expect(createErr).toBeNull();

    // Should have 2 entries: original credit + offset debit
    const entries = batch!.getEntries();
    expect(entries.length).toBe(2);

    // Offset entry should be a debit
    const offsetEntry = entries.find(e => e.individualName === 'OFFSET');
    expect(offsetEntry).toBeDefined();
    expect(offsetEntry!.amount).toBe(500000);
  });

  it('should calculate balanced offset for debits', () => {
    const bh = mockBatchHeader(PPD, DebitsOnly);
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    const ed = mockEntry(300000, CheckingDebit); // $3,000.00
    batch!.addEntry(ed);

    const offset: Offset = {
      routingNumber: '121042882',
      accountNumber: 'OFFSET-ACCT',
      accountType: OffsetChecking,
      description: 'OFFSET',
    };
    batch!.withOffset(offset);
    const createErr = batch!.create();
    expect(createErr).toBeNull();

    const entries = batch!.getEntries();
    expect(entries.length).toBe(2);

    // Offset entry should be a credit
    const offsetEntry = entries.find(e => e.individualName === 'OFFSET');
    expect(offsetEntry).toBeDefined();
    expect(offsetEntry!.amount).toBe(300000);
  });

  it('should calculate balanced offset for mixed debits and credits', () => {
    const bh = mockBatchHeader(PPD, MixedDebitsAndCredits);
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    batch!.addEntry(mockEntry(500000, CheckingCredit));
    const ed2 = mockEntry(200000, CheckingDebit);
    ed2.traceNumber = '121042880000002';
    batch!.addEntry(ed2);

    const offset: Offset = {
      routingNumber: '121042882',
      accountNumber: 'OFFSET-ACCT',
      accountType: OffsetChecking,
      description: 'OFFSET',
    };
    batch!.withOffset(offset);
    const createErr = batch!.create();
    expect(createErr).toBeNull();

    const entries = batch!.getEntries();
    expect(entries.length).toBeGreaterThan(2);
  });

  it('should call withOffset idempotently', () => {
    const bh = mockBatchHeader(PPD, CreditsOnly);
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    batch!.addEntry(mockEntry(500000, CheckingCredit));

    const offset: Offset = {
      routingNumber: '121042882',
      accountNumber: 'OFFSET-ACCT',
      accountType: OffsetChecking,
      description: 'OFFSET',
    };
    batch!.withOffset(offset);
    batch!.create();
    const firstCount = batch!.getEntries().length;

    // Call withOffset again and rebuild
    batch!.withOffset(offset);
    batch!.create();
    const secondCount = batch!.getEntries().length;

    expect(secondCount).toBe(firstCount);
  });

  it('should handle ABA8 routing number in entry hash', () => {
    const bh = mockBatchHeader(PPD, CreditsOnly);
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    const ed = mockEntry(10000, CheckingCredit);
    ed.rdfiIdentification = '23138010';
    batch!.addEntry(ed);
    const createErr = batch!.create();
    expect(createErr).toBeNull();
    expect(batch!.getControl().entryHash).toBe(23138010);
  });

  it('should allow invalid amounts with AllowInvalidAmounts opt', () => {
    // Prenote entries normally must have zero amount
    const bh = mockBatchHeader(PPD, CreditsOnly);
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    const ed = mockEntry(10000, CheckingPrenoteCredit); // prenote with non-zero amount
    batch!.addEntry(ed);
    // Without opt: should fail because prenote with non-zero amount
    const createErr = batch!.create();
    expect(createErr).not.toBeNull();
    expect(createErr!.message).toContain('Amount');

    // With opt: should pass
    batch!.setValidation({ allowInvalidAmounts: true });
    const createErr2 = batch!.create();
    expect(createErr2).toBeNull();
  });

  it('should set trace numbers based on ODFI during build', () => {
    const bh = mockBatchHeader(PPD, CreditsOnly);
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    const ed = mockEntry(10000, CheckingCredit);
    ed.traceNumber = '000000000000000'; // wrong ODFI prefix
    batch!.addEntry(ed);
    batch!.create();

    // build should set trace number with correct ODFI prefix
    const entries = batch!.getEntries();
    expect(entries[0].traceNumber.startsWith('12104288')).toBe(true);
  });

  it('should return JSON for batch', () => {
    const batch = buildBatch();
    const json = JSON.stringify(batch);
    expect(json).toContain('ACME CORP');
    expect(json).toContain('PPD');
  });

  // =========================================================================
  // equal() tests (mirrors Go TestBatch__Equal)
  // =========================================================================
  describe('equal()', () => {
    const testdataDir = path.join(__dirname, 'testdata');
    function loadFirstBatch(): Batcher {
      const content = fs.readFileSync(path.join(testdataDir, 'ppd-debit.ach'), 'utf-8');
      const file = readACHFile(content);
      return file.batches[0];
    }

    it('identical batches are equal', () => {
      const first = loadFirstBatch();
      const second = loadFirstBatch();
      expect(first.equal(second)).toBe(true);
    });

    it('null/undefined returns false', () => {
      const batch = loadFirstBatch();
      expect(batch.equal(null as any)).toBe(false);
      expect(batch.equal(undefined as any)).toBe(false);
    });

    it('changed ServiceClassCode → not equal', () => {
      const first = loadFirstBatch();
      const second = loadFirstBatch();
      second.getHeader().serviceClassCode = 1;
      expect(first.equal(second)).toBe(false);
    });

    it('changed StandardEntryClassCode → not equal', () => {
      const first = loadFirstBatch();
      const second = loadFirstBatch();
      second.getHeader().standardEntryClassCode = 'ZZZ';
      expect(first.equal(second)).toBe(false);
    });

    it('changed CompanyName → not equal', () => {
      const first = loadFirstBatch();
      const second = loadFirstBatch();
      second.getHeader().companyName = 'foo';
      expect(first.equal(second)).toBe(false);
    });

    it('changed CompanyIdentification → not equal', () => {
      const first = loadFirstBatch();
      const second = loadFirstBatch();
      second.getHeader().companyIdentification = 'new company';
      expect(first.equal(second)).toBe(false);
    });

    it('changed EffectiveEntryDate → not equal', () => {
      const first = loadFirstBatch();
      const second = loadFirstBatch();
      second.getHeader().effectiveEntryDate = '1111';
      expect(first.equal(second)).toBe(false);
    });

    it('changed ODFIIdentification → not equal', () => {
      const first = loadFirstBatch();
      const second = loadFirstBatch();
      second.getHeader().odfiIdentification = '12';
      expect(first.equal(second)).toBe(false);
    });

    it('changed TransactionCode → not equal', () => {
      const first = loadFirstBatch();
      const second = loadFirstBatch();
      second.getEntries()[0].transactionCode = 1;
      expect(first.equal(second)).toBe(false);
    });

    it('changed RDFIIdentification → not equal', () => {
      const first = loadFirstBatch();
      const second = loadFirstBatch();
      second.getEntries()[0].rdfiIdentification = '41';
      expect(first.equal(second)).toBe(false);
    });

    it('changed DFIAccountNumber → not equal', () => {
      const first = loadFirstBatch();
      const second = loadFirstBatch();
      second.getEntries()[0].dfiAccountNumber = '542';
      expect(first.equal(second)).toBe(false);
    });

    it('changed Amount → not equal', () => {
      const first = loadFirstBatch();
      const second = loadFirstBatch();
      second.getEntries()[0].amount = 1;
      expect(first.equal(second)).toBe(false);
    });

    it('changed IdentificationNumber → not equal', () => {
      const first = loadFirstBatch();
      const second = loadFirstBatch();
      second.getEntries()[0].identificationNumber = '99';
      expect(first.equal(second)).toBe(false);
    });

    it('changed IndividualName → not equal', () => {
      const first = loadFirstBatch();
      const second = loadFirstBatch();
      second.getEntries()[0].individualName = 'jane doe';
      expect(first.equal(second)).toBe(false);
    });

    it('changed DiscretionaryData → not equal', () => {
      const first = loadFirstBatch();
      const second = loadFirstBatch();
      second.getEntries()[0].discretionaryData = 'other info';
      expect(first.equal(second)).toBe(false);
    });

    it('added EntryDetail → not equal', () => {
      const first = loadFirstBatch();
      const second = loadFirstBatch();
      second.addEntry(second.getEntries()[0]);
      expect(first.equal(second)).toBe(false);
    });
  });

  // =========================================================================
  // deleteADVEntries() tests (mirrors Go TestBatch_DeleteADVEntries)
  // =========================================================================
  describe('deleteADVEntries()', () => {
    it('should delete by ID and by amount', () => {
      const batch = new Batch();
      batch.setHeader(mockBatchHeader());

      const ed1 = newADVEntryDetail();
      ed1.id = '1';
      ed1.amount = 20;
      const ed2 = newADVEntryDetail();
      ed2.id = '2';
      ed2.amount = 60;
      const ed3 = newADVEntryDetail();
      ed3.id = '3';
      ed3.amount = 100;

      batch.addADVEntry(ed1);
      batch.addADVEntry(ed2);
      batch.addADVEntry(ed3);
      expect(batch.advEntries).toHaveLength(3);

      batch.deleteADVEntries(e => e.id === '2');
      expect(batch.advEntries).toHaveLength(2);
      expect(batch.advEntries[0].id).toBe('1');
      expect(batch.advEntries[1].id).toBe('3');

      batch.addADVEntry(ed2);

      batch.deleteADVEntries(e => e.amount >= 50);
      expect(batch.advEntries).toHaveLength(1);
      expect(batch.advEntries[0].id).toBe('1');
    });
  });

  // =========================================================================
  // upsertOffsets panic regression (mirrors Go TestBatch_upsertOffsets_PanicRegression)
  // =========================================================================
  it('should not error on upsertOffsets with pre-existing offset entry', () => {
    const bh = newBatchHeader();
    bh.serviceClassCode = MixedDebitsAndCredits;
    bh.standardEntryClassCode = WEB;
    bh.companyName = 'Test';
    bh.companyIdentification = '123456789';
    bh.companyEntryDescription = 'PAYROLL';
    bh.originatorStatusCode = 1;
    bh.odfiIdentification = '12104288';

    const [batch, batchErr] = newBatch(bh);
    expect(batchErr).toBeNull();

    // Add 3 normal debit entries
    for (let i = 0; i < 3; i++) {
      const ed = newEntryDetail();
      ed.transactionCode = CheckingDebit;
      ed.rdfiIdentification = '12345678';
      ed.checkDigit = '0';
      ed.dfiAccountNumber = '123456789';
      ed.amount = 100;
      ed.individualName = 'User';
      ed.traceNumber = `121042880000${String(i + 1).padStart(3, '0')}`;
      batch!.addEntry(ed);
    }

    // Add offset as last entry (this triggered the i+i bug in Go)
    const offsetEntry = newEntryDetail();
    offsetEntry.transactionCode = CheckingCredit;
    offsetEntry.rdfiIdentification = '98765432';
    offsetEntry.checkDigit = '0';
    offsetEntry.dfiAccountNumber = '123456789';
    offsetEntry.amount = 300;
    offsetEntry.individualName = 'OFFSET';
    offsetEntry.traceNumber = '121042880000004';
    batch!.addEntry(offsetEntry);

    // Setup offset config
    batch!.withOffset({
      routingNumber: '987654320',
      accountNumber: '123456',
      accountType: OffsetChecking,
      description: 'OFFSET',
    });

    const createErr = batch!.create();
    expect(createErr).toBeNull();
    expect((batch as Batch).entries.length).toBe(4);
  });

  // =========================================================================
  // upsertOffsets error path (mirrors Go TestBatch__upsertOffsetsErr)
  // =========================================================================
  it('should fail offset with invalid account type then invalid routing', () => {
    const bh = mockBatchHeader(PPD, MixedDebitsAndCredits);
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    batch!.addEntry(mockEntry(10000, CheckingCredit));

    // Set offset with invalid account type
    batch!.withOffset({
      routingNumber: '121042882',
      accountNumber: '123456789',
      accountType: 'invalid' as any,
      description: 'test offset',
    });
    const createErr = batch!.create();
    expect(createErr).not.toBeNull();

    // Now set valid account type but break the routing number
    batch!.withOffset({
      routingNumber: '1',
      accountNumber: '123456789',
      accountType: OffsetChecking,
      description: 'test offset',
    });
    const createErr2 = batch!.create();
    expect(createErr2).not.toBeNull();
    expect(createErr2!.message).toContain('routing');
  });
});
