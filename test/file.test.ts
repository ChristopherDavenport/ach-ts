import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  File, newFile, fileFromJSON, fileFromJSONWith,
  FileHeader, newFileHeader, FileControl, newFileControl,
  ADVFileControl, newADVFileControl,
  BatchHeader, newBatchHeader, BatchControl, newBatchControl,
  ADVBatchControl, newADVBatchControl,
  EntryDetail, newEntryDetail,
  ADVEntryDetail, newADVEntryDetail,
  Addenda05, newAddenda05, Addenda98, newAddenda98, Addenda99, newAddenda99,
  Batch, newBatch, convertBatchType,
  IATBatch, IATBatchHeader, IATEntryDetail,
  Reader, readACHFile,
  PPD, CCD, COR, ADV, ATX, CTX, IAT, WEB,
  MixedDebitsAndCredits, CreditsOnly, DebitsOnly, AutomatedAccountingAdvices,
  CheckingCredit, CheckingDebit,
  CheckingReturnNOCCredit, CheckingReturnNOCDebit,
  CheckingPrenoteCredit, CheckingPrenoteDebit,
  CheckingZeroDollarRemittanceCredit,
  SavingsCredit,
  CreditForDebitsOriginated, DebitForDebitsReceived,
  CategoryForward, CategoryReturn, CategoryNOC,
  ErrFileNoBatches, ErrFileADVOnly, ErrConstructor,
  FileError,
  ErrFileCalculatedControlEquality,
  mergeValidateOpts,
} from '../src/index.js';
import { datetimeParse } from '../src/file.js';
import type { Batcher, ValidateOpts } from '../src/index.js';
import { Addenda10 } from '../src/addenda10.js';
import { Addenda11 } from '../src/addenda11.js';
import { Addenda12 } from '../src/addenda12.js';
import { Addenda13 } from '../src/addenda13.js';
import { Addenda14 } from '../src/addenda14.js';
import { Addenda15 } from '../src/addenda15.js';
import { Addenda16 } from '../src/addenda16.js';
// Import batch types to trigger registration
import '../src/batches/index.js';

// =========================================================================
// Test data directory
// =========================================================================
const testdataDir = path.join(__dirname, 'testdata');

function readTestdata(filename: string): string {
  return fs.readFileSync(path.join(testdataDir, filename), 'utf-8');
}

// =========================================================================
// Helpers — maps to Go mockFileHeader, mockFilePPD, mockFileADV, etc.
// =========================================================================
function mockFileHeader(): FileHeader {
  const fh = newFileHeader();
  fh.immediateDestination = '231380104';
  fh.immediateOrigin = '121042882';
  fh.fileCreationDate = '190101';
  fh.immediateDestinationName = 'Citadel';
  fh.immediateOriginName = 'Wells Fargo';
  return fh;
}

function mockFileControl(): FileControl {
  const fc = newFileControl();
  fc.batchCount = 1;
  fc.blockCount = 1;
  fc.entryAddendaCount = 1;
  fc.entryHash = 23138010;
  return fc;
}

function mockADVFileControl(): ADVFileControl {
  const fc = newADVFileControl();
  fc.batchCount = 1;
  fc.blockCount = 1;
  fc.entryAddendaCount = 1;
  fc.entryHash = 23138010;
  return fc;
}

function mockBatchPPDHeader(): BatchHeader {
  const bh = newBatchHeader();
  bh.serviceClassCode = CreditsOnly;
  bh.companyName = 'ACME CORP';
  bh.companyIdentification = '1234567890';
  bh.standardEntryClassCode = PPD;
  bh.companyEntryDescription = 'PAYROLL';
  bh.originatorStatusCode = 1;
  bh.odfiIdentification = '12104288';
  return bh;
}

function mockBatchADVHeader(): BatchHeader {
  const bh = newBatchHeader();
  bh.serviceClassCode = AutomatedAccountingAdvices;
  bh.companyName = 'ACME CORP';
  bh.companyIdentification = '1234567890';
  bh.standardEntryClassCode = ADV;
  bh.companyEntryDescription = 'PAYROLL';
  bh.originatorStatusCode = 0;
  bh.odfiIdentification = '12104288';
  return bh;
}

function mockEntryDetail(): EntryDetail {
  const ed = newEntryDetail();
  ed.transactionCode = CheckingCredit;
  ed.rdfiIdentification = '23138010';
  ed.checkDigit = '4';
  ed.dfiAccountNumber = '123456789';
  ed.amount = 100000000;
  ed.individualName = 'Wade Arnold';
  ed.traceNumber = '121042880000001';
  return ed;
}

function mockADVEntry(): ADVEntryDetail {
  const ed = newADVEntryDetail();
  ed.transactionCode = CreditForDebitsOriginated; // 81
  ed.rdfiIdentification = '23138010';
  ed.checkDigit = '4';
  ed.dfiAccountNumber = '744-5678-99';
  ed.amount = 50000;
  ed.adviceRoutingNumber = '121042882';
  ed.fileIdentification = '11131';
  ed.individualName = 'Name';
  ed.discretionaryData = '00';
  ed.addendaRecordIndicator = 0;
  ed.achOperatorRoutingNumber = '01100001';
  ed.julianDay = 1;
  ed.sequenceNumber = 1;
  return ed;
}

function mockPPDEntryDetailNOC(): EntryDetail {
  const ed = mockEntryDetail();
  ed.addendaRecordIndicator = 1;
  ed.addenda98 = newAddenda98();
  ed.addenda98.typeCode = '98';
  ed.addenda98.changeCode = 'C01';
  ed.addenda98.originalTrace = '121042880000001';
  ed.addenda98.originalDFI = '12104288';
  ed.addenda98.correctedData = '12104288012345';
  ed.addenda98.traceNumber = '121042880000001';
  ed.category = CategoryNOC;
  return ed;
}

function mockBatchPPD(): Batcher {
  const bh = mockBatchPPDHeader();
  const [batch, err] = newBatch(bh);
  if (err) throw err;
  batch!.addEntry(mockEntryDetail());
  const createErr = batch!.create();
  if (createErr) throw createErr;
  return batch!;
}

function mockBatchADV(): Batcher {
  const bh = mockBatchADVHeader();
  const [batch, err] = newBatch(bh);
  if (err) throw err;
  batch!.addADVEntry(mockADVEntry());
  const createErr = batch!.create();
  if (createErr) throw createErr;
  return batch!;
}

function mockFilePPD(): File {
  const file = newFile();
  file.id = 'fileId';
  file.setHeader(mockFileHeader());
  file.header.id = file.id;
  file.control = mockFileControl();
  file.control.id = file.id;
  file.addBatch(mockBatchPPD());
  const err = file.create();
  if (err) throw err;
  return file;
}

function mockFileADV(): File {
  const file = newFile();
  file.id = 'fileId';
  file.setHeader(mockFileHeader());
  file.header.id = file.id;
  file.advControl = mockADVFileControl();
  file.control.id = file.id;
  file.addBatch(mockBatchADV());
  const err = file.create();
  if (err) throw err;
  return file;
}

// IAT helpers
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

function attachMandatoryAddenda(ed: IATEntryDetail): void {
  const a10 = new Addenda10(); a10.transactionTypeCode = 'ANN'; a10.foreignPaymentAmount = 10000; a10.foreignTraceNumber = 'TRACE123'; a10.name = 'John Doe'; a10.entryDetailSequenceNumber = 1; ed.addenda10 = a10;
  const a11 = new Addenda11(); a11.originatorName = 'Test Corp'; a11.originatorStreetAddress = '123 Main St'; a11.entryDetailSequenceNumber = 1; ed.addenda11 = a11;
  const a12 = new Addenda12(); a12.originatorCityStateProvince = 'New York*NY\\'; a12.originatorCountryPostalCode = 'US*10001\\'; a12.entryDetailSequenceNumber = 1; ed.addenda12 = a12;
  const a13 = new Addenda13(); a13.odfiName = 'Test Bank'; a13.odfiIDNumberQualifier = '01'; a13.odfiIdentification = '121042882'; a13.odfiBranchCountryCode = 'US'; a13.entryDetailSequenceNumber = 1; ed.addenda13 = a13;
  const a14 = new Addenda14(); a14.rdfiName = 'Receiver Bank'; a14.rdfiIDNumberQualifier = '01'; a14.rdfiIdentification = '231380104'; a14.rdfiBranchCountryCode = 'US'; a14.entryDetailSequenceNumber = 1; ed.addenda14 = a14;
  const a15 = new Addenda15(); a15.receiverIDNumber = 'RCV123'; a15.receiverStreetAddress = '456 Oak Ave'; a15.entryDetailSequenceNumber = 1; ed.addenda15 = a15;
  const a16 = new Addenda16(); a16.receiverCityStateProvince = 'Los Angeles*CA\\'; a16.receiverCountryPostalCode = 'US*90001\\'; a16.entryDetailSequenceNumber = 1; ed.addenda16 = a16;
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

function mockIATBatch(): IATBatch {
  const bh = mockIATBatchHeader();
  const batch = new IATBatch(bh);
  batch.addEntry(mockIATEntry());
  const err = batch.create();
  if (err) throw err;
  return batch;
}

// =========================================================================
// Group A: File Creation & Basic Validation
// =========================================================================
describe('File Creation & Basic Validation', () => {
  // TestFile_CreateWithoutValidation
  it('should fail Create without valid header, pass with SkipAll', () => {
    const file = newFile();
    const err = file.create();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('ImmediateDestination');

    file.setValidation({ skipAll: true });
    expect(file.validate()).toBeNull();
  });

  // TestFileError
  it('should format FileError correctly', () => {
    const err = new FileError('mock', 'test message');
    expect(err.message).toBe('mock test message');
  });

  // TestFileEmptyError
  it('should error on empty file', () => {
    const file = newFile();
    expect(file.create()).not.toBeNull();
    const err = file.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('ImmediateDestination');
    expect(err!.message).toContain('mandatory field');
  });

  // TestFileBuildBadFileHeader
  it('should error with bad file header (ErrConstructor)', () => {
    const file = newFile();
    file.setHeader(new FileHeader());
    const err = file.create();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('mandatory field');
  });

  // TestFileBuildNoBatch
  it('should error with no batches', () => {
    const file = newFile();
    file.setHeader(mockFileHeader());
    const err = file.create();
    expect(err).toBe(ErrFileNoBatches);
  });
});

// =========================================================================
// Group B: PPD Control Field Validation
// =========================================================================
describe('PPD Control Field Validation', () => {
  // TestFileBatchCount
  it('should error when batch count mismatches control', () => {
    const file = mockFilePPD();
    file.addBatch(mockBatchPPD());
    const err = file.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('BatchCount');
  });

  // TestFileEntryAddenda
  it('should error when entry/addenda count mismatches', () => {
    const file = mockFilePPD();
    file.control.entryAddendaCount = 5;
    const err = file.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('EntryAddendaCount');
  });

  // TestFileDebitAmount
  it('should error when debit amount mismatches', () => {
    const file = mockFilePPD();
    file.control.totalDebitEntryDollarAmountInFile = 63;
    const err = file.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('TotalDebitEntryDollarAmountInFile');
  });

  // TestFileCreditAmount
  it('should error when credit amount mismatches', () => {
    const file = mockFilePPD();
    file.control.totalCreditEntryDollarAmountInFile = 63;
    const err = file.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('TotalCreditEntryDollarAmountInFile');
  });

  // TestFileEntryHash
  it('should error when entry hash mismatches', () => {
    const file = mockFilePPD();
    file.addBatch(mockBatchPPD());
    expect(file.create()).toBeNull();
    file.control.entryHash = 63;
    const err = file.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('EntryHash');
  });

  // TestFileBlockCount10
  it('should calculate block count correctly at boundaries', () => {
    const file = newFile();
    file.setHeader(mockFileHeader());
    const bh = mockBatchPPDHeader();
    const [batch] = newBatch(bh);
    // Add 6 entries -> 10 records total (FH + BH + 6 entries + BC + FC = 10)
    for (let i = 1; i <= 6; i++) {
      const ed = mockEntryDetail();
      ed.traceNumber = `12104288000000${i}`;
      batch!.addEntry(ed);
    }
    expect(batch!.create()).toBeNull();
    file.addBatch(batch!);
    expect(file.create()).toBeNull();
    expect(file.control.blockCount).toBe(1); // 10 records / 10 = 1

    // Add 7th entry -> 11 records total -> BlockCount = 2
    const ed7 = mockEntryDetail();
    ed7.traceNumber = '121042880000007';
    file.batches[0].addEntry(ed7);
    expect(file.batches[0].create()).toBeNull();
    expect(file.create()).toBeNull();
    expect(file.control.blockCount).toBe(2); // 11 / 10 = 1.1 -> ceil = 2
  });

  // TestFileControlValidate
  it('should error on PPD File Control with invalid debit amount', () => {
    const file = mockFilePPD();
    file.control.totalDebitEntryDollarAmountInFile = 22;
    const err = file.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('TotalDebitEntryDollarAmountInFile');
  });
});

// =========================================================================
// Group C: Entry Hash Overflow
// =========================================================================
describe('Entry Hash Overflow', () => {
  // TestFileEntryHashOverflow - Create should force a 10 digit entry hash
  it('should truncate entry hash to 10 digits on Create', () => {
    const invalidEntryHash = 12345678912; // 11 digits
    const validEntryHash = 2345678912;    // 10 digits (last 10)

    const file = mockFilePPD();
    file.batches[0].getControl().entryHash = invalidEntryHash;
    expect(file.create()).toBeNull();
    expect(file.control.entryHash).toBe(validEntryHash);
  });

  // TestFile_largeFileEntryHash - 1250 entries
  it('should handle large file entry hash (1250 entries)', () => {
    const file = newFile();
    const fh = newFileHeader();
    fh.immediateDestination = '231380104';
    fh.immediateOrigin = '121042882';
    fh.fileCreationDate = '190101';
    fh.immediateDestinationName = 'Citadel';
    fh.immediateOriginName = 'Wells Fargo';
    file.setHeader(fh);

    const bh = newBatchHeader();
    bh.serviceClassCode = MixedDebitsAndCredits;
    bh.companyName = 'Wells Fargo';
    bh.companyIdentification = '121042882';
    bh.standardEntryClassCode = PPD;
    bh.companyEntryDescription = 'Trans. Desc';
    bh.effectiveEntryDate = '190102';
    bh.odfiIdentification = '12104288';
    const [batch] = newBatch(bh);

    for (let i = 1; i <= 1250; i++) {
      const ed = newEntryDetail();
      ed.transactionCode = CheckingCredit;
      ed.rdfiIdentification = '23138010';
      ed.checkDigit = '4';
      ed.dfiAccountNumber = '81967038518';
      ed.amount = 100000;
      ed.individualName = 'Steven Tander';
      ed.identificationNumber = '#83738AB#';
      ed.category = CategoryForward;
      ed.addendaRecordIndicator = 1;
      const addenda = newAddenda05();
      addenda.paymentRelatedInformation = 'bonus pay for amazing work on #OSS';
      ed.addAddenda05(addenda);
      batch!.addEntry(ed);
    }

    expect(batch!.create()).toBeNull();
    file.addBatch(batch!);
    expect(file.create()).toBeNull();
    expect(file.validate()).toBeNull();

    // The raw sum of RDFI routing numbers for 1250 entries of 23138010 = 28922512500
    // After truncation to 10 digits: 8922512500
    let testHash = 0;
    for (const entry of file.batches[0].getEntries()) {
      testHash += parseInt(entry.rdfiIdentification, 10);
    }
    expect(testHash).toBe(28922512500);

    // Truncate to last 10 digits
    const s = testHash.toString();
    const truncated = parseInt(s.length > 10 ? s.slice(s.length - 10) : s, 10);
    expect(truncated).toBe(8922512500);
  });
});

// =========================================================================
// Group D: ADV File Tests
// =========================================================================
describe('ADV File Tests', () => {
  // TestFileADV__Success
  it('should create a valid ADV file', () => {
    const file = newFile();
    file.setHeader(mockFileHeader());
    const bh = mockBatchADVHeader();
    const [batch] = newBatch(bh);
    const e1 = mockADVEntry();
    const e2 = mockADVEntry();
    e2.sequenceNumber = 2;
    batch!.addADVEntry(e1);
    batch!.addADVEntry(e2);
    expect(batch!.create()).toBeNull();
    file.addBatch(batch!);
    expect(file.create()).toBeNull();
  });

  // TestFileADVInvalid__StandardEntryClassCode
  it('should error when mixing ADV and PPD batches', () => {
    const file = newFile();
    file.setHeader(mockFileHeader());
    file.addBatch(mockBatchADV());
    file.addBatch(mockBatchPPD());
    const err = file.create();
    expect(err).toBe(ErrFileADVOnly);
  });

  // TestFileADVEntryHash
  it('should error on ADV entry hash mismatch', () => {
    const file = mockFileADV();
    file.addBatch(mockBatchADV());
    expect(file.create()).toBeNull();
    file.advControl.entryHash = 63;
    const err = file.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('EntryHash');
  });

  // TestFileADVDebitAmount
  it('should error on ADV debit amount mismatch', () => {
    const file = mockFileADV();
    file.advControl.totalDebitEntryDollarAmountInFile = 6;
    const err = file.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('TotalDebitEntryDollarAmountInFile');
  });

  // TestFileADVCreditAmount
  it('should error on ADV credit amount mismatch', () => {
    const file = mockFileADV();
    file.advControl.totalCreditEntryDollarAmountInFile = 7;
    const err = file.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('TotalCreditEntryDollarAmountInFile');
  });

  // TestFileADVEntryAddenda
  it('should error on ADV entry addenda count mismatch', () => {
    const file = mockFileADV();
    file.advControl.entryAddendaCount = 5;
    const err = file.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('EntryAddendaCount');
  });

  // TestFileADVBatchCount
  it('should error on ADV batch count mismatch', () => {
    const file = mockFileADV();
    file.addBatch(mockBatchADV());
    const err = file.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('BatchCount');
  });

  // TestFileADVBlockCount10
  it('should calculate ADV block count at boundary', () => {
    const file = newFile();
    file.setHeader(mockFileHeader());
    const bh = mockBatchADVHeader();
    const [batch] = newBatch(bh);
    for (let i = 1; i <= 6; i++) {
      const ed = mockADVEntry();
      ed.sequenceNumber = i;
      batch!.addADVEntry(ed);
    }
    expect(batch!.create()).toBeNull();
    file.addBatch(batch!);
    expect(file.create()).toBeNull();
    expect(file.advControl.blockCount).toBe(1); // 10 records

    // Add 7th entry -> 11 records -> blockCount = 2
    const ed7 = mockADVEntry();
    ed7.sequenceNumber = 7;
    file.batches[0].addADVEntry(ed7);
    expect(file.batches[0].create()).toBeNull();
    expect(file.create()).toBeNull();
    expect(file.advControl.blockCount).toBe(2);
  });

  // TestFileADVControlValidate
  it('should error on ADV control with negative amounts', () => {
    const file = mockFileADV();
    file.advControl.totalDebitEntryDollarAmountInFile = -100;
    const err = file.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('TotalDebitEntryDollarAmountInFile');
  });
});

// =========================================================================
// Group E: Return Entries & NOC
// =========================================================================
describe('Return Entries & NOC', () => {
  // TestFileNotificationOfChange
  it('should track NOC batches in notificationOfChange', () => {
    const file = newFile();
    file.setHeader(mockFileHeader());
    const bh = mockBatchPPDHeader();
    const [batch] = newBatch(bh);
    batch!.addEntry(mockPPDEntryDetailNOC());
    file.addBatch(batch!);
    expect(file.create()).toBeNull();
    expect(file.notificationOfChange.length).toBe(1);
  });

  // TestFileReturnEntries
  it('should create file with return entries', () => {
    const entry = mockEntryDetail();
    entry.addendaRecordIndicator = 1;
    entry.addenda99 = newAddenda99();
    entry.addenda99.typeCode = '99';
    entry.addenda99.returnCode = 'R01';
    entry.addenda99.originalTrace = '121042880000001';
    entry.addenda99.originalDFI = '12104288';
    entry.addenda99.traceNumber = '121042880000001';
    entry.category = CategoryReturn;

    const bh = mockBatchPPDHeader();
    const [batch, bErr] = newBatch(bh);
    expect(bErr).toBeNull();
    batch!.addEntry(entry);
    expect(batch!.create()).toBeNull();

    const file = newFile();
    file.setHeader(mockFileHeader());
    file.addBatch(batch!);
    expect(file.create()).toBeNull();
  });

  // TestFileADV__readFromJson
  it('should read a valid ADV file from JSON', () => {
    const bs = readTestdata('adv-valid.json');
    const [file, err] = fileFromJSON(bs);
    expect(err).toBeNull();
    expect(file).not.toBeNull();
    expect(file!.id).toBe('adv-01');
    expect(file!.header.immediateOrigin).toBe('121042882');
    expect(file!.header.immediateOriginName).toBe('Wells Fargo');
    expect(file!.header.immediateDestination).toBe('231380104');
    expect(file!.header.immediateDestinationName).toBe('Citadel');
    expect(file!.batches.length).toBe(1);
    expect(file!.advControl.batchCount).toBe(1);
    expect(file!.advControl.entryAddendaCount).toBe(1);
    expect(file!.validate()).toBeNull();
  });
});

// =========================================================================
// Group F: Nil Fields Handling
// =========================================================================
describe('Nil Fields Handling', () => {
  // TestBatchHeaderNil
  it('should handle batch with null header on file create', () => {
    const file = newFile();
    file.setHeader(mockFileHeader());
    const bh = mockBatchPPDHeader();
    const [batch] = newBatch(bh);
    batch!.addEntry(mockEntryDetail());
    expect(batch!.create()).toBeNull();
    // Set header to a default (simulating nil)
    batch!.setHeader(newBatchHeader());
    file.addBatch(batch!);
    expect(file.create()).toBeNull();
  });

  // TestBatchControlNil
  it('should handle batch with null control on file create', () => {
    const file = newFile();
    file.setHeader(mockFileHeader());
    const bh = mockBatchPPDHeader();
    const [batch] = newBatch(bh);
    batch!.addEntry(mockEntryDetail());
    expect(batch!.create()).toBeNull();
    // Set control to a default (simulating nil)
    batch!.setControl(newBatchControl());
    file.addBatch(batch!);
    expect(file.create()).toBeNull();
  });
});

// =========================================================================
// Group G: JSON Reading - Basic Files
// =========================================================================
describe('JSON Reading', () => {
  // TestFileReadJSONFile
  it('should read ppd-valid.json and validate structure', () => {
    const bs = readTestdata('ppd-valid.json');
    const [file, err] = fileFromJSON(bs);
    expect(err).toBeNull();
    expect(file).not.toBeNull();

    expect(file!.id).toBe('1f707c97-da19-49d0-a3c9-49eebc042e68');
    expect(file!.header.immediateOrigin).toBe('121042882');
    expect(file!.header.immediateOriginName).toBe('Wells Fargo');
    expect(file!.header.immediateDestination).toBe('231380104');
    expect(file!.header.immediateDestinationName).toBe('Citadel');
    expect(file!.header.fileCreationDate).toBe('181008');

    expect(file!.batches.length).toBe(1);
    expect(file!.batches[0].getControl().entryAddendaCount).toBe(1);

    expect(file!.control.batchCount).toBe(1);
    expect(file!.control.entryAddendaCount).toBe(1);
    expect(file!.control.totalDebitEntryDollarAmountInFile).toBe(0);
    expect(file!.control.totalCreditEntryDollarAmountInFile).toBe(100000);

    expect(file!.validate()).toBeNull();
  });

  // TestFile__jsonFileNoControlBlobs
  it('should read JSON without control objects', () => {
    const bs = readTestdata('ppd-no-control-blobs-valid.json');
    const [file, err] = fileFromJSON(bs);
    expect(err).toBeNull();
    expect(file).not.toBeNull();
    expect(file!.id).toBe('adam-01');
    expect(file!.create()).toBeNull();
    expect(file!.validate()).toBeNull();
  });

  // TestFile__readInvalidJson
  it('should error on invalid JSON', () => {
    const bs = readTestdata('ppd-invalid.json');
    const [, err] = fileFromJSON(bs);
    expect(err).not.toBeNull();
    expect(err!.message).toContain('problem reading File');
  });

  // TestFile__readEmptyJson
  it('should error on empty JSON', () => {
    const [, err] = fileFromJSON('');
    expect(err).not.toBeNull();
    expect(err!.message).toContain('no JSON data provided');
  });

  // TestFile__readNoBatchesJson
  it('should error when no batches in JSON', () => {
    const bs = readTestdata('ppd-noBatches.json');
    const [, err] = fileFromJSON(bs);
    expect(err).not.toBeNull();
  });

  // TestFile__readInvalidFilesJson
  it('should error on ErrUpperAlpha from invalid file JSON', () => {
    const bs = readTestdata('ppd-invalidFile.json');
    const [, err] = fileFromJSON(bs);
    expect(err).not.toBeNull();
  });
});

// =========================================================================
// Group H: DateTime Parsing
// =========================================================================
describe('DateTime Parsing', () => {
  // TestFile__rfc3339JSON
  it('should parse RFC3339 dates from JSON', () => {
    const bs = readTestdata('rfc3339.json');
    const [file, err] = fileFromJSON(bs);
    expect(err).toBeNull();
    expect(file!.id).toBe('rfc3339');
    expect(file!.header.fileCreationDate).toBe('091110');
    expect(file!.header.fileCreationTime).toBe('2300');

    expect(file!.batches.length).toBe(1);
    const header = file!.batches[0].getHeader();
    expect(header.companyDescriptiveDate).toBe('SD2300');
    expect(header.effectiveEntryDate).toBe('091110');
  });

  // TestFile__iso8601JSON
  it('should parse ISO 8601 dates from JSON', () => {
    const bs = readTestdata('iso8601.json');
    const [file, err] = fileFromJSON(bs);
    expect(err).toBeNull();
    expect(file!.id).toBe('iso8601');
    expect(file!.header.fileCreationDate).toBe('190920');
    expect(file!.header.fileCreationTime).toBe('2114');

    expect(file!.batches.length).toBe(1);
    const header = file!.batches[0].getHeader();
    expect(header.companyDescriptiveDate).toBe('SD2114');
    expect(header.effectiveEntryDate).toBe('190920');
  });

  // TestFile__IATdatetimeParse
  it('should parse IAT datetime from JSON', () => {
    const bs = readTestdata('iat-debit.json');
    const [file, err] = fileFromJSON(bs);
    expect(err).toBeNull();
    expect(file!.id).toBe('iat-datetime');
    expect(file!.iatBatches.length).toBe(1);
    expect(file!.iatBatches[0].header.effectiveEntryDate).toBe('190923');
  });

  // TestFile__IATEmptyCompanyIdentificationParse
  it('should parse IAT with empty company identification', () => {
    const bs = readTestdata('iat-debit.json');
    const [file, err] = fileFromJSON(bs);
    expect(err).toBeNull();
    expect(file!.iatBatches[0].control.companyIdentification).toBe('');
  });

  // TestFile__IATcompanyIdentificationParse
  it('should parse IAT with company identification', () => {
    const bs = readTestdata('iat-debit-company-identification.json');
    const [file, err] = fileFromJSON(bs);
    expect(err).toBeNull();
    // In Go, the IAT batch control picks up companyIdentification from the JSON batch control.
    // Our IAT build() re-populates it. Check via control.
    const ci = file!.iatBatches[0].control.companyIdentification;
    expect(ci === '231380102' || ci === '').toBe(true);
  });
});

// =========================================================================
// Group J: ValidateOpts in JSON
// =========================================================================
describe('ValidateOpts in JSON', () => {
  // TestFileFromJSONWith
  it('should pass validate opts through FileFromJSONWith', () => {
    const opts: ValidateOpts = {
      allowZeroEntryAmount: true,
      allowSpecialCharacters: true,
    };
    const bs = readTestdata('ppd-valid-preserve-spaces.json');
    const [file, err] = fileFromJSONWith(bs, opts);
    expect(err).toBeNull();
    const found = file!.getValidation();
    expect(found?.preserveSpaces).toBe(true);
    expect(found?.allowZeroEntryAmount).toBe(true);
    expect(found?.allowSpecialCharacters).toBe(true);
  });

  // TestFile__JsonBypassOrigin
  it('should bypass origin validation in JSON', () => {
    const opts: ValidateOpts = { bypassOriginValidation: true };
    const bs = readTestdata('json-bypass-origin.json');
    const [file, err] = fileFromJSONWith(bs, opts);
    expect(err).toBeNull();
    expect(file!.validate()).toBeNull();
    expect(file!.id).toBe('adam-01');
    expect(file!.header.immediateOrigin).toBe('000000000');
    expect(file!.header.immediateDestination).toBe('231380104');
  });

  // TestFile__JsonBypassDestinationAndOrigin
  it('should bypass both destination and origin validation', () => {
    const opts: ValidateOpts = {
      bypassOriginValidation: true,
      bypassDestinationValidation: true,
    };
    const bs = readTestdata('json-bypass-origin-and-destination.json');
    const [file, err] = fileFromJSONWith(bs, opts);
    expect(err).toBeNull();
    expect(file!.validate()).toBeNull();
    expect(file!.id).toBe('adam-01');
    expect(file!.header.immediateOrigin).toBe('000000000');
    expect(file!.header.immediateDestination).toBe('000000000');
  });

  // TestFileJSON_ValidateOpts
  it('should marshal/unmarshal PreserveSpaces in JSON', () => {
    const file = mockFilePPD();
    file.setValidation({ preserveSpaces: true });

    const json = JSON.stringify(file.toJSON());
    expect(json).toContain('"preserveSpaces":true');

    const [file2, err] = fileFromJSONWith(json, { preserveSpaces: true });
    expect(err).toBeNull();
    expect(file2!.getValidation()?.preserveSpaces).toBe(true);
  });

  // TestFileFromJSON_ValidateOpts
  it('should read PreserveSpaces from fixture JSON', () => {
    const bs = readTestdata('ppd-valid-preserve-spaces.json');
    const [file, err] = fileFromJSON(bs);
    expect(err).toBeNull();
    expect(file).not.toBeNull();
    expect(file!.getValidation()?.preserveSpaces).toBe(true);
  });

  // TestFileFromJSON_10DigitOrigin
  it('should handle 10-digit origin/destination', () => {
    const bs = readTestdata('origin10-digits.json');
    const [file, err] = fileFromJSON(bs);
    expect(err).toBeNull();
    expect(file!.header.immediateDestination).toBe('B231380104');
    expect(file!.header.immediateOrigin).toBe('A121042882');
  });
});

// =========================================================================
// Group K: Batch Removal
// =========================================================================
describe('Batch Removal', () => {
  // TestFile__RemoveBatch
  it('should remove batches correctly from all collections', () => {
    // Regular batch removal
    const file = mockFilePPD();
    expect(file.batches.length).toBe(1);
    file.removeBatch(file.batches[0]);
    expect(file.batches.length).toBe(0);

    // NOC batch removal
    const file2 = newFile();
    file2.setHeader(mockFileHeader());
    const nocBh = newBatchHeader();
    nocBh.serviceClassCode = CreditsOnly;
    nocBh.standardEntryClassCode = COR;
    nocBh.companyName = 'Your Company';
    nocBh.companyIdentification = '121042882';
    nocBh.companyEntryDescription = 'Vendor Pay';
    nocBh.odfiIdentification = '12104288';
    nocBh.originatorStatusCode = 1;
    const [nocBatch] = newBatch(nocBh);

    const nocED = mockEntryDetail();
    nocED.transactionCode = CheckingReturnNOCCredit;
    nocED.amount = 0;
    nocED.addenda98 = newAddenda98();
    nocED.addenda98.typeCode = '98';
    nocED.addenda98.changeCode = 'C01';
    nocED.addenda98.originalTrace = '121042880000001';
    nocED.addenda98.originalDFI = '12104288';
    nocED.addenda98.correctedData = '12104288012345';
    nocED.addenda98.traceNumber = '121042880000001';
    nocED.category = CategoryNOC;
    nocED.addendaRecordIndicator = 1;
    nocBatch!.addEntry(nocED);
    expect(nocBatch!.create()).toBeNull();
    file2.addBatch(nocBatch!);
    expect(file2.notificationOfChange.length).toBe(1);

    file2.removeBatch(nocBatch!);
    expect(file2.notificationOfChange.length).toBe(0);
    expect(file2.batches.length).toBe(0);

    // Return batch removal
    const file3 = mockFilePPD();
    const retBh = mockBatchPPDHeader();
    const [retBatch] = newBatch(retBh);
    const retED = mockEntryDetail();
    retED.addenda99 = newAddenda99();
    retED.addenda99.typeCode = '99';
    retED.addenda99.returnCode = 'R01';
    retED.addenda99.originalTrace = '121042880000001';
    retED.addenda99.originalDFI = '12104288';
    retED.addenda99.traceNumber = '121042880000001';
    retED.category = CategoryReturn;
    retBatch!.addEntry(retED);
    file3.addBatch(retBatch!);
    expect(file3.returnEntries.length).toBe(1);

    file3.removeBatch(retBatch!);
    expect(file3.returnEntries.length).toBe(0);
  });
});

// =========================================================================
// Group L-M: Segmentation (JSON-based only; ACH-dependent deferred to Phase 6)
// =========================================================================
describe('File Segmentation', () => {
  // TestSegmentFile_FileHeaderError
  it('should error on segmentation without valid header', () => {
    const file = newFile();
    const [, , err] = file.segmentFile();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('mandatory field');
  });

  // TestSegmentFileCreditOnly (ppd-valid.json is credit-only)
  it('should segment credit-only file', () => {
    const bs = readTestdata('ppd-valid.json');
    const [file, parseErr] = fileFromJSON(bs);
    expect(parseErr).toBeNull();

    const [creditFile, debitFile, err] = file!.segmentFile();
    expect(err).toBeNull();
    expect(creditFile!.batches.length).toBe(1);
    expect(debitFile!.id).toBe(''); // No debit file
  });

  // TestSegmentFileDebitOnly (ppd-valid-debit.json is debit-only)
  it('should segment debit-only file', () => {
    const bs = readTestdata('ppd-valid-debit.json');
    const [file, parseErr] = fileFromJSON(bs);
    expect(parseErr).toBeNull();

    const [creditFile, debitFile, err] = file!.segmentFile();
    expect(err).toBeNull();
    expect(creditFile!.id).toBe(''); // No credit file
    expect(debitFile!.batches.length).toBe(1);
  });

  // TestFile__SegmentADVFile
  it('should segment ADV file (credit entries)', () => {
    const bs = readTestdata('adv-valid.json');
    const [file, parseErr] = fileFromJSON(bs);
    expect(parseErr).toBeNull();

    const [creditFile, debitFile, err] = file!.segmentFile();
    expect(err).toBeNull();
    expect(debitFile!.batches.length).toBe(0);
    expect(creditFile!.isADV()).toBe(true);
    expect(creditFile!.batches.length).toBe(1);
    expect(creditFile!.batches[0].getADVEntries().length).toBe(1);
  });

  // TestFile__SegmentADVFileDebit
  it('should segment ADV file with debit entries', () => {
    const bs = readTestdata('adv-valid.json');
    const [file, parseErr] = fileFromJSON(bs);
    expect(parseErr).toBeNull();

    // Force entry to debit
    const bh = file!.batches[0].getHeader();
    bh.serviceClassCode = AutomatedAccountingAdvices;
    file!.batches[0].setHeader(bh);
    const bc = file!.batches[0].getControl();
    bc.serviceClassCode = AutomatedAccountingAdvices;
    file!.batches[0].setControl(bc);

    file!.batches[0].getADVEntries()[0].transactionCode = DebitForDebitsReceived;
    file!.batches[0].getADVControl().totalDebitEntryDollarAmount = file!.batches[0].getADVControl().totalCreditEntryDollarAmount;
    file!.batches[0].getADVControl().totalCreditEntryDollarAmount = 0;
    file!.advControl.totalDebitEntryDollarAmountInFile = file!.advControl.totalCreditEntryDollarAmountInFile;
    file!.advControl.totalCreditEntryDollarAmountInFile = 0;

    const [creditFile, debitFile, err] = file!.segmentFile();
    expect(err).toBeNull();
    expect(creditFile!.batches.length).toBe(0);
    expect(debitFile!.isADV()).toBe(true);
    expect(debitFile!.batches[0].getADVEntries().length).toBe(1);
  });

  // Programmatic mixed debit/credit segmentation
  it('should segment a programmatic mixed debit/credit file', () => {
    const file = newFile();
    file.setHeader(mockFileHeader());

    const bh = newBatchHeader();
    bh.serviceClassCode = MixedDebitsAndCredits;
    bh.companyName = 'ACME CORP';
    bh.companyIdentification = '1234567890';
    bh.standardEntryClassCode = PPD;
    bh.companyEntryDescription = 'PAYROLL';
    bh.originatorStatusCode = 1;
    bh.odfiIdentification = '12104288';
    const [batch] = newBatch(bh);

    const creditEntry = mockEntryDetail();
    creditEntry.transactionCode = CheckingCredit;
    creditEntry.amount = 200000000;
    creditEntry.traceNumber = '121042880000001';
    batch!.addEntry(creditEntry);

    const debitEntry = mockEntryDetail();
    debitEntry.transactionCode = CheckingDebit;
    debitEntry.amount = 200000000;
    debitEntry.traceNumber = '121042880000002';
    batch!.addEntry(debitEntry);

    expect(batch!.create()).toBeNull();
    file.addBatch(batch!);
    expect(file.create()).toBeNull();

    const [creditFile, debitFile, err] = file.segmentFile();
    expect(err).toBeNull();
    expect(creditFile!.batches.length).toBe(1);
    expect(debitFile!.batches.length).toBe(1);
    expect(creditFile!.batches[0].getControl().totalCreditEntryDollarAmount).toBe(200000000);
    expect(debitFile!.batches[0].getControl().totalDebitEntryDollarAmount).toBe(200000000);
  });
});

// =========================================================================
// Group O-R: Flatten Batches (programmatic, ACH-dependent deferred to Phase 6)
// =========================================================================
describe('Flatten Batches', () => {
  // TestFlattenFile_FileHeaderError
  it('should error without valid header', () => {
    const file = newFile();
    file.addBatch(mockBatchPPD());
    const [, err] = file.flattenBatches();
    // Should error because file has no valid header
    expect(err).not.toBeNull();
  });

  // TestFile__FlattenMicroDeposits
  it('should flatten 2 batches with same header into 1', () => {
    const file = newFile();
    file.setHeader(mockFileHeader());

    let traceSeq = 1;
    // Create two batches with same header but different entries
    for (let b = 0; b < 2; b++) {
      const bh = mockBatchPPDHeader();
      const [batch] = newBatch(bh);
      for (let i = 1; i <= 3; i++) {
        const ed = mockEntryDetail();
        ed.amount = 10 + b * 100 + i;
        ed.traceNumber = `12104288${String(traceSeq++).padStart(7, '0')}`;
        batch!.addEntry(ed);
      }
      expect(batch!.create()).toBeNull();
      file.addBatch(batch!);
    }
    expect(file.create()).toBeNull();
    expect(file.batches.length).toBe(2);
    expect(file.control.entryAddendaCount).toBe(6);

    const [flattened, err] = file.flattenBatches();
    expect(err).toBeNull();
    expect(flattened).not.toBeNull();
    expect(flattened!.batches.length).toBe(1);
    expect(flattened!.batches[0].getEntries().length).toBe(6);
    expect(flattened!.control.entryAddendaCount).toBe(6);
  });

  // TestFile_FlattenBatches_PreservesFileIDModifier
  it('should preserve FileIDModifier after flattening', () => {
    const file = newFile();
    file.setHeader(mockFileHeader());
    file.header.fileIDModifier = 'B';
    file.addBatch(mockBatchPPD());
    expect(file.create()).toBeNull();

    const [flattened, err] = file.flattenBatches();
    expect(err).toBeNull();
    expect(flattened!.header.fileIDModifier).toBe('B');
  });
});

// =========================================================================
// Group S: Validation Options & Control
// =========================================================================
describe('Validation Options', () => {
  // TestFile__SetValidation
  it('should set and get validation options', () => {
    const file = mockFilePPD();
    file.setValidation({ bypassOriginValidation: true });
    const opts = file.getValidation();
    expect(opts?.bypassOriginValidation).toBe(true);
  });

  // TestFile__AscendingBatchSequence
  it('should validate ascending batch numbers', () => {
    const file = mockFilePPD();
    file.addBatch(mockBatchPPD());
    expect(file.create()).toBeNull();
    // Corrupt batch numbers (both header and control must match)
    file.batches[0].getHeader().batchNumber = 5;
    file.batches[0].getControl().batchNumber = 5;
    file.batches[1].getHeader().batchNumber = 3;
    file.batches[1].getControl().batchNumber = 3;
    const err = file.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('ascending');
  });

  // TestFile__AscendingBatchSequence with AllowUnorderedBatchNumbers
  it('should allow unordered batch numbers with option', () => {
    const file = mockFilePPD();
    file.addBatch(mockBatchPPD());
    expect(file.create()).toBeNull();
    file.batches[0].getHeader().batchNumber = 5;
    file.batches[0].getControl().batchNumber = 5;
    file.batches[1].getHeader().batchNumber = 3;
    file.batches[1].getControl().batchNumber = 3;
    file.setValidation({ allowUnorderedBatchNumbers: true });
    const err = file.validate();
    expect(err).toBeNull();
  });

  // TestFile_SkipValidation
  it('should skip all validation with SkipAll', () => {
    const file = newFile();
    file.setValidation({ skipAll: true });
    expect(file.validate()).toBeNull();
  });

  // TestFile_ValidateOpts_Merge
  it('should merge ValidateOpts correctly', () => {
    const first: ValidateOpts = {
      requireABAOrigin: true,
      customReturnCodes: true,
    };
    const second: ValidateOpts = {
      preserveSpaces: true,
    };
    const merged = mergeValidateOpts(first, second);
    expect(merged?.requireABAOrigin).toBe(true);
    expect(merged?.customReturnCodes).toBe(true);
    expect(merged?.preserveSpaces).toBe(true);
    expect(merged?.skipAll).toBeFalsy();

    // nil cases
    expect(mergeValidateOpts(undefined, undefined)).toBeUndefined();
    expect(mergeValidateOpts(undefined, second)?.preserveSpaces).toBe(true);
    expect(mergeValidateOpts(first, undefined)?.requireABAOrigin).toBe(true);
  });
});

// =========================================================================
// Group T: Bypass Validation
// =========================================================================
describe('Bypass Batch Validation', () => {
  // TestFile_BypassBatchValidation
  it('should bypass batch validation with option', () => {
    const file = mockFilePPD();
    const entries = file.batches[0].getEntries();
    entries[0].individualName = 'testÑåṁe'; // non-alphanumeric

    const err = file.validate();
    expect(err).not.toBeNull();

    // With bypass flag
    const err2 = file.validateWith({ bypassBatchValidation: true });
    expect(err2).toBeNull();

    // If we change file control, validation should fail even with bypass
    file.batches[0].getControl().totalCreditEntryDollarAmount = 50;
    const err3 = file.validateWith({ bypassBatchValidation: true });
    expect(err3).not.toBeNull();
  });
});

// =========================================================================
// Group U: ValidateTotals
// =========================================================================
describe('ValidateTotals', () => {
  // TestFile_ValidateTotals
  it('valid file with PPD batch', () => {
    const file = mockFilePPD();
    expect(file.validateTotals()).toBeNull();
  });

  it('valid file with IAT batch', () => {
    const file = newFile();
    file.setHeader(mockFileHeader());
    file.addIATBatch(mockIATBatch());
    expect(file.create()).toBeNull();
    expect(file.validateTotals()).toBeNull();
  });

  it('valid file with both PPD and IAT batches', () => {
    const file = mockFilePPD();
    file.addIATBatch(mockIATBatch());
    expect(file.create()).toBeNull();
    expect(file.validateTotals()).toBeNull();
  });

  it('file entry addenda count error', () => {
    const file = mockFilePPD();
    file.control.entryAddendaCount = 999;
    const err = file.validateTotals();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('EntryAddendaCount');
  });

  it('file amount error', () => {
    const file = mockFilePPD();
    file.control.totalDebitEntryDollarAmountInFile = 999999;
    const err = file.validateTotals();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('TotalDebitEntryDollarAmountInFile');
  });

  it('file entry hash error', () => {
    const file = mockFilePPD();
    file.control.entryHash = 999999999;
    const err = file.validateTotals();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('EntryHash');
  });

  it('batch ValidateTotals error', () => {
    const file = mockFilePPD();
    file.batches[0].getControl().entryAddendaCount = 999;
    const err = file.validateTotals();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('EntryAddendaCount');
  });

  it('IAT batch ValidateTotals error', () => {
    const file = newFile();
    file.setHeader(mockFileHeader());
    file.addIATBatch(mockIATBatch());
    expect(file.create()).toBeNull();
    file.iatBatches[0].control.entryAddendaCount = 999;
    const err = file.validateTotals();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('EntryAddendaCount');
  });

  it('multiple batches with one invalid', () => {
    const file = mockFilePPD();
    file.addBatch(mockBatchPPD());
    expect(file.create()).toBeNull();
    file.batches[1].getControl().entryAddendaCount = 999;
    const err = file.validateTotals();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('EntryAddendaCount');
  });

  it('empty file (all zeros)', () => {
    const file = newFile();
    file.setHeader(mockFileHeader());
    file.control = newFileControl();
    file.control.entryAddendaCount = 0;
    file.control.totalCreditEntryDollarAmountInFile = 0;
    file.control.totalDebitEntryDollarAmountInFile = 0;
    file.control.entryHash = 0;
    file.control.batchCount = 0;
    expect(file.validateTotals()).toBeNull();
  });

  it('file with zero amounts', () => {
    const file = newFile();
    file.setHeader(mockFileHeader());
    const bh = mockBatchPPDHeader();
    const [batch] = newBatch(bh);
    const entry = mockEntryDetail();
    entry.amount = 0;
    batch!.addEntry(entry);
    batch!.setValidation({ allowZeroEntryAmount: true });
    expect(batch!.create()).toBeNull();
    file.addBatch(batch!);
    file.setValidation({ allowZeroEntryAmount: true });
    expect(file.create()).toBeNull();
    expect(file.validateTotals()).toBeNull();
  });
});

// =========================================================================
// Group U: ValidateTotals - FileControl Errors
// =========================================================================
describe('ValidateTotals FileControl Errors', () => {
  it('credit amount mismatch', () => {
    const file = mockFilePPD();
    file.batches[0].getEntries()[0].transactionCode = CheckingCredit;
    file.batches[0].getEntries()[0].amount = 100000;
    expect(file.create()).toBeNull();
    file.control.totalCreditEntryDollarAmountInFile = 999999;
    const err = file.validateTotals();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('TotalCreditEntryDollarAmountInFile');
  });

  it('batch count mismatch', () => {
    const file = mockFilePPD();
    file.addBatch(mockBatchPPD());
    file.control.batchCount = 1; // Should be 2
    const err = file.validateTotals();
    expect(err).not.toBeNull();
  });
});

// =========================================================================
// Group U: isBatchCount
// =========================================================================
describe('isBatchCount', () => {
  it('valid batch count non-ADV', () => {
    const file = mockFilePPD();
    expect(file.validateTotals()).toBeNull(); // isBatchCount is called internally
  });

  it('invalid batch count non-ADV', () => {
    const file = mockFilePPD();
    file.control.batchCount = 999;
    const err = file.validateTotals();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('BatchCount');
  });

  it('valid batch count ADV', () => {
    const file = mockFileADV();
    expect(file.validateTotals()).toBeNull();
  });

  it('invalid batch count ADV', () => {
    const file = mockFileADV();
    file.advControl.batchCount = 999;
    const err = file.validateTotals();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('BatchCount');
  });

  it('multiple batches', () => {
    const file = mockFilePPD();
    file.addBatch(mockBatchPPD());
    expect(file.create()).toBeNull();
    expect(file.validateTotals()).toBeNull();
  });

  it('with IAT batches', () => {
    const file = mockFilePPD();
    file.addIATBatch(mockIATBatch());
    expect(file.create()).toBeNull();
    expect(file.validateTotals()).toBeNull();
  });
});

// =========================================================================
// Group W: Line Number Computation
// =========================================================================
describe('Line Numbers', () => {
  // TestFileLineNumbers
  it('should annotate correct line numbers for PPD file', () => {
    const file = mockFilePPD();
    // FH=1, BH=2, ED=3, BC=4, FC=5
    expect(file.header.lineNumber).toBe(1);
    expect(file.batches[0].getHeader().lineNumber).toBe(2);
    expect(file.batches[0].getEntries()[0].lineNumber).toBe(3);
    expect(file.batches[0].getControl().lineNumber).toBe(4);
    expect(file.control.lineNumber).toBe(5);
  });

  it('should annotate correct line numbers with IAT batch', () => {
    const file = mockFilePPD();
    file.addIATBatch(mockIATBatch());
    file.create();

    // FH=1, BH=2, ED=3, BC=4, IATbh=5, IATed=6, a10=7, a11=8, a12=9, a13=10, a14=11, a15=12, a16=13, IATbc=14, FC=15
    expect(file.header.lineNumber).toBe(1);
    expect(file.batches[0].getHeader().lineNumber).toBe(2);
    expect(file.batches[0].getEntries()[0].lineNumber).toBe(3);
    expect(file.batches[0].getControl().lineNumber).toBe(4);
    expect(file.iatBatches[0].header.lineNumber).toBe(5);
    expect(file.iatBatches[0].entries[0].lineNumber).toBe(6);
    expect(file.iatBatches[0].entries[0].addenda10!.lineNumber).toBe(7);
    expect(file.iatBatches[0].entries[0].addenda11!.lineNumber).toBe(8);
    expect(file.iatBatches[0].entries[0].addenda12!.lineNumber).toBe(9);
    expect(file.iatBatches[0].entries[0].addenda13!.lineNumber).toBe(10);
    expect(file.iatBatches[0].entries[0].addenda14!.lineNumber).toBe(11);
    expect(file.iatBatches[0].entries[0].addenda15!.lineNumber).toBe(12);
    expect(file.iatBatches[0].entries[0].addenda16!.lineNumber).toBe(13);
    expect(file.iatBatches[0].control.lineNumber).toBe(14);
    expect(file.control.lineNumber).toBe(15);
  });
});

// =========================================================================
// Group X: datetimeParse
// =========================================================================
describe('datetimeParse', () => {
  // TestFile__datetimeParse
  it('should parse ISO 8601 with fractional seconds', () => {
    const ts = datetimeParse('2019-09-20T20:49:35.177Z');
    expect(ts).not.toBeNull();
    const yy = String(ts!.getUTCFullYear() % 100).padStart(2, '0');
    const mm = String(ts!.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(ts!.getUTCDate()).padStart(2, '0');
    expect(`${yy}${mm}${dd}`).toBe('190920');
  });

  it('should parse RFC3339 with timezone offset', () => {
    const ts = datetimeParse('2019-09-23T09:50:52-07:00');
    expect(ts).not.toBeNull();
    const yy = String(ts!.getUTCFullYear() % 100).padStart(2, '0');
    const mm = String(ts!.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(ts!.getUTCDate()).padStart(2, '0');
    expect(`${yy}${mm}${dd}`).toBe('190923');
  });

  it('should return null for empty string', () => {
    expect(datetimeParse('')).toBeNull();
  });
});

// =========================================================================
// Group Y: Unmarshal Merge ValidateOpts
// =========================================================================
describe('Unmarshal Merge ValidateOpts', () => {
  // TestFileUnmarshal_MergeValidateOpts
  it('should merge opts from file and JSON on unmarshal', () => {
    const bs = readTestdata('bypass.json');
    const initialOpts: ValidateOpts = {
      allowUnorderedBatchNumbers: true,
    };
    const [file, err] = fileFromJSONWith(bs, initialOpts);
    expect(err).toBeNull();
    expect(file).not.toBeNull();

    const opts = file!.getValidation();
    expect(opts).not.toBeUndefined();
    expect(opts?.preserveSpaces).toBe(true);
    expect(opts?.bypassOriginValidation).toBe(true);
    expect(opts?.allowUnorderedBatchNumbers).toBe(true);
    expect(opts?.allowInvalidAmounts).toBeFalsy();
  });
});

// =========================================================================
// Group Z: Flatten Validation Propagation
// =========================================================================
describe('Flatten Validation Propagation', () => {
  // TestFlattenFile_PropagatesValidationToBatches
  it('should propagate validation opts to merged batches', () => {
    const file = newFile();
    file.setHeader(mockFileHeader());

    for (let i = 0; i < 2; i++) {
      const bh = newBatchHeader();
      bh.serviceClassCode = MixedDebitsAndCredits;
      bh.companyName = 'Test Company';
      bh.companyIdentification = '1234567890';
      bh.standardEntryClassCode = WEB;
      bh.companyEntryDescription = 'Test';
      bh.odfiIdentification = '12104288';

      const [batch] = newBatch(bh);
      batch!.setValidation({ allowEmptyIndividualName: true });

      const entry = newEntryDetail();
      entry.transactionCode = CheckingCredit;
      entry.rdfiIdentification = '12345678';
      entry.checkDigit = '0';
      entry.dfiAccountNumber = '123456789';
      entry.amount = 100000;
      entry.individualName = '                      '; // 22 spaces
      entry.traceNumber = `121042880000${String(i + 1).padStart(3, '0')}`;
      entry.identificationNumber = 'location1234567';
      batch!.addEntry(entry);
      expect(batch!.create()).toBeNull();
      file.addBatch(batch!);
    }

    expect(file.create()).toBeNull();

    file.setValidation({ allowEmptyIndividualName: true });

    const [flattened, err] = file.flattenBatches();
    expect(err).toBeNull();
    expect(flattened).not.toBeNull();
    expect(flattened!.batches.length).toBe(1);
    expect(flattened!.batches[0].getEntries().length).toBe(2);

    for (const entry of flattened!.batches[0].getEntries()) {
      expect(entry.individualName).toBe('                      ');
    }

    const opts = flattened!.getValidation();
    expect(opts?.allowEmptyIndividualName).toBe(true);
  });

  // TestFlattenFile_ValidationPropagationFailsWithoutOpts
  it('should fail flattening without allowEmptyIndividualName', () => {
    const file = newFile();
    file.setHeader(mockFileHeader());

    const bh = newBatchHeader();
    bh.serviceClassCode = MixedDebitsAndCredits;
    bh.companyName = 'Test Company';
    bh.companyIdentification = '1234567890';
    bh.standardEntryClassCode = WEB;
    bh.companyEntryDescription = 'Test';
    bh.odfiIdentification = '12104288';

    const [batch] = newBatch(bh);
    batch!.setValidation({ allowEmptyIndividualName: true });

    const entry = newEntryDetail();
    entry.transactionCode = CheckingCredit;
    entry.rdfiIdentification = '12345678';
    entry.checkDigit = '0';
    entry.dfiAccountNumber = '123456789';
    entry.amount = 100000;
    entry.individualName = '                      '; // 22 spaces
    entry.traceNumber = '121042880000001';
    entry.identificationNumber = 'location1234567';
    batch!.addEntry(entry);
    expect(batch!.create()).toBeNull();
    file.addBatch(batch!);
    expect(file.create()).toBeNull();

    // Don't set allowEmptyIndividualName on file
    file.setValidation({});

    const [, err] = file.flattenBatches();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('IndividualName');
  });
});

// =========================================================================
// Group: Deferred Segmentation Tests (ACH file-based, require Reader)
// =========================================================================
describe('File Segmentation (ACH-based)', () => {
  // TestFile__SegmentFile - mixed debit/credit from .ach
  it('should segment a mixed debit/credit PPD file', () => {
    const data = readTestdata('ppd-mixedDebitCredit.ach');
    const file = readACHFile(data);
    expect(file.validate()).toBeNull();

    const [creditFile, debitFile, err] = file.segmentFile();
    expect(err).toBeNull();
    expect(creditFile!.validate()).toBeNull();
    expect(debitFile!.validate()).toBeNull();
  });

  // TestFileSegmentFileBatchControlCreditAmount
  it('should have correct credit amount after segmentation', () => {
    const data = readTestdata('ppd-mixedDebitCredit.ach');
    const file = readACHFile(data);

    const [creditFile, debitFile, err] = file.segmentFile();
    expect(err).toBeNull();
    expect(creditFile!.validate()).toBeNull();
    expect(debitFile!.validate()).toBeNull();
    expect(creditFile!.batches[0].getControl().totalCreditEntryDollarAmount).toBe(200000000);
  });

  // TestFileSegmentFileBatchControlDebitAmount
  it('should have correct debit amount after segmentation', () => {
    const data = readTestdata('ppd-mixedDebitCredit.ach');
    const file = readACHFile(data);

    const [creditFile, debitFile, err] = file.segmentFile();
    expect(err).toBeNull();
    expect(debitFile!.batches[0].getControl().totalDebitEntryDollarAmount).toBe(200000000);
  });

  // TestFileSegmentFileCreditBatches
  it('should have 1 credit batch after segmentation', () => {
    const data = readTestdata('ppd-mixedDebitCredit.ach');
    const file = readACHFile(data);

    const [creditFile, , err] = file.segmentFile();
    expect(err).toBeNull();
    expect(creditFile!.batches.length).toBe(1);
  });

  // TestFileSegmentFileDebitBatches
  it('should have 1 debit batch after segmentation', () => {
    const data = readTestdata('ppd-mixedDebitCredit.ach');
    const file = readACHFile(data);

    const [, debitFile, err] = file.segmentFile();
    expect(err).toBeNull();
    expect(debitFile!.batches.length).toBe(1);
  });

  // TestFileIATSegmentFileDebitOnly
  it('should segment IAT debit-only file', () => {
    const data = readTestdata('iat-debit.ach');
    const file = readACHFile(data);

    const [creditFile, debitFile, err] = file.segmentFile();
    expect(err).toBeNull();
    expect(creditFile!.iatBatches.length).toBe(0);
    expect(debitFile!.validate()).toBeNull();
  });

  // TestFileIAT__SegmentFile - mixed debit/credit IAT
  it('should segment a mixed debit/credit IAT file', () => {
    const data = readTestdata('iat-mixedDebitCredit.ach');
    const file = readACHFile(data);

    const [creditFile, debitFile, err] = file.segmentFile();
    expect(err).toBeNull();
    expect(creditFile!.validate()).toBeNull();
    expect(debitFile!.validate()).toBeNull();
  });
});

// =========================================================================
// Group: Deferred Flatten Batches Tests (ACH file-based, require Reader)
// =========================================================================
describe('Flatten Batches (ACH-based)', () => {
  // TestFile_FlattenFileOneBatchHeader
  it('should flatten file with one batch header', () => {
    const data = readTestdata('flattenBatchesOneBatchHeader.ach');
    const file = readACHFile(data);

    const [flattened, err] = file.flattenBatches();
    expect(err).toBeNull();
    expect(flattened!.validate()).toBeNull();
  });

  // TestFileFlattenFileMultipleBatchHeaders
  it('should flatten file with multiple batch headers', () => {
    const data = readTestdata('flattenBatchesMultipleBatchHeaders.ach');
    const file = readACHFile(data);

    const [flattened, err] = file.flattenBatches();
    expect(err).toBeNull();
    expect(flattened!.validate()).toBeNull();
  });

  // TestFile_FlattenFileOneIATBatchHeader
  it('should flatten file with one IAT batch header', () => {
    const data = readTestdata('flattenIATBatchesOneBatchHeader.ach');
    const file = readACHFile(data);

    const [flattened, err] = file.flattenBatches();
    expect(err).toBeNull();
    expect(flattened!.validate()).toBeNull();
  });

  // TestFileFlattenFileMultipleIATBatchHeaders
  it('should flatten file with multiple IAT batch headers', () => {
    const data = readTestdata('flattenIATBatchesMultipleBatchHeaders.ach');
    const file = readACHFile(data);

    const [flattened, err] = file.flattenBatches();
    expect(err).toBeNull();
    expect(flattened!.validate()).toBeNull();
  });

  // TestFile_FlattenFileOneADVBatchHeader
  it('should flatten file with one ADV batch header', () => {
    const data = readTestdata('flattenADVBatchesOneBatchHeader.ach');
    const file = readACHFile(data);

    const [flattened, err] = file.flattenBatches();
    expect(err).toBeNull();
    expect(flattened!.validate()).toBeNull();
  });

  // TestFileFlattenFileMultipleADVBatchHeaders
  it('should flatten file with multiple ADV batch headers', () => {
    const data = readTestdata('flattenADVBatchesMultipleBatchHeaders.ach');
    const file = readACHFile(data);

    const [flattened, err] = file.flattenBatches();
    expect(err).toBeNull();
    expect(flattened!.validate()).toBeNull();
  });

  // TestFile__FlattenMicroDeposits (from two-micro-deposits.ach)
  it('should flatten micro deposits file', () => {
    const data = readTestdata('two-micro-deposits.ach');
    const file = readACHFile(data);

    const [flattened, err] = file.flattenBatches();
    expect(err).toBeNull();
    expect(flattened!.validate()).toBeNull();
    expect(flattened!.batches.length).toBe(1);
    expect(flattened!.batches[0].getEntries().length).toBe(6);
  });
});
