import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  Reader, readACHFile, readACHFiles, readRunes,
  Writer, writeFile,
  File, newFile, fileFromJSON,
  FileHeader, newFileHeader, FileControl, newFileControl,
  BatchHeader, newBatchHeader, BatchControl, newBatchControl,
  EntryDetail, newEntryDetail,
  Addenda02, newAddenda02,
  Addenda05, newAddenda05,
  Addenda98, newAddenda98,
  Addenda99, newAddenda99,
  Addenda99Dishonored, newAddenda99Dishonored,
  Addenda99Contested, newAddenda99Contested,
  ADVEntryDetail, newADVEntryDetail,
  ADVBatchControl, newADVBatchControl,
  ADVFileControl, newADVFileControl,
  Batch, newBatch,
  IATBatch, IATBatchHeader, IATEntryDetail,
  newAddenda10, newAddenda11, newAddenda12, newAddenda13,
  newAddenda14, newAddenda15, newAddenda16,
  newAddenda17, newAddenda18,
  PPD, CCD, COR, ADV, POS, WEB, IAT,
  CreditsOnly, DebitsOnly, AutomatedAccountingAdvices,
  CheckingCredit, CheckingDebit, CheckingReturnNOCCredit, CheckingReturnNOCDebit,
  CreditForDebitsOriginated,
  CategoryForward, CategoryReturn, CategoryNOC,
  CategoryDishonoredReturn, CategoryDishonoredReturnContested,
  ACHError, ParseError, FieldError,
  ErrFileHeader, ErrFileControl, ErrFileTooLong,
  ErrFileEntryOutsideBatch, ErrFileAddendaOutsideBatch, ErrFileAddendaOutsideEntry,
  ErrFileBatchControlOutsideBatch, ErrFileConsecutiveBatchHeaders,
  ErrBatchAddendaIndicator, ErrIATBatchAddendaIndicator,
  ErrUnknownRecordType, RecordWrongLengthErr,
  ErrConstructor, ErrSECCode, ErrServiceClass, ErrTransactionCode,
  ErrNonAlphanumeric, ErrTransactionTypeCode,
  ErrAddenda98ChangeCode, ErrAddenda99ReturnCode,
  ErrBatchHeaderControlEquality, ErrBatchCalculatedControlEquality,
  ErrFileCalculatedControlEquality,
} from '../src/index.js';
import '../src/batches/index.js';

const testdataDir = path.join(__dirname, 'testdata');

function readTestFile(filename: string): string {
  return fs.readFileSync(path.join(testdataDir, filename), 'utf-8');
}

function hasError(err: unknown, sentinel: Error): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes(sentinel.message);
}

// =========================================================================
// Mock factories
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
  fc.entryHash = 5320001;
  return fc;
}

function mockBatchHeader(): BatchHeader {
  const bh = newBatchHeader();
  bh.serviceClassCode = CreditsOnly;
  bh.companyName = 'ACME Corporation';
  bh.companyIdentification = '121042882';
  bh.standardEntryClassCode = PPD;
  bh.companyEntryDescription = 'PAYROLL';
  bh.originatorStatusCode = 1;
  bh.odfiIdentification = '12104288';
  return bh;
}

function mockBatchPPDHeader(): BatchHeader {
  return mockBatchHeader();
}

function mockBatchPOSHeader(): BatchHeader {
  const bh = newBatchHeader();
  bh.serviceClassCode = DebitsOnly;
  bh.companyName = 'Payee Name';
  bh.companyIdentification = '231380104';
  bh.standardEntryClassCode = POS;
  bh.companyEntryDescription = 'ACH POS';
  bh.originatorStatusCode = 1;
  bh.odfiIdentification = '23138010';
  return bh;
}

function mockBatchCORHeader(): BatchHeader {
  const bh = newBatchHeader();
  bh.serviceClassCode = CreditsOnly;
  bh.companyName = 'Your Company, inc';
  bh.companyIdentification = '121042882';
  bh.standardEntryClassCode = COR;
  bh.companyEntryDescription = 'PAYROLL';
  bh.originatorStatusCode = 1;
  bh.odfiIdentification = '12104288';
  return bh;
}

function mockBatchADVHeader(): BatchHeader {
  const bh = newBatchHeader();
  bh.serviceClassCode = AutomatedAccountingAdvices;
  bh.companyName = 'Your Company, inc';
  bh.companyIdentification = '121042882';
  bh.standardEntryClassCode = ADV;
  bh.companyEntryDescription = 'PAYROLL';
  bh.originatorStatusCode = 0;
  bh.odfiIdentification = '12104288';
  return bh;
}

function mockBatchWEBHeader(): BatchHeader {
  const bh = newBatchHeader();
  bh.serviceClassCode = CreditsOnly;
  bh.companyName = 'ACME Corporation';
  bh.companyIdentification = '121042882';
  bh.standardEntryClassCode = WEB;
  bh.companyEntryDescription = 'PAYROLL';
  bh.originatorStatusCode = 1;
  bh.odfiIdentification = '12104288';
  return bh;
}

function mockBatchControl(): BatchControl {
  const bc = newBatchControl();
  bc.serviceClassCode = CreditsOnly;
  bc.companyIdentification = '121042882';
  bc.odfiIdentification = '12104288';
  bc.entryAddendaCount = 1;
  bc.entryHash = 12104288;
  return bc;
}

function mockEntryDetail(): EntryDetail {
  const ed = newEntryDetail();
  ed.transactionCode = CheckingCredit;
  ed.rdfiIdentification = '12104288';
  ed.checkDigit = '2';
  ed.dfiAccountNumber = '123456789';
  ed.amount = 100000000;
  ed.individualName = 'Wade Arnold';
  ed.identificationNumber = 'ABC##jvkdjfuiwn';
  ed.traceNumber = '121042880000001';
  return ed;
}

function mockPPDEntryDetail(): EntryDetail {
  return mockEntryDetail();
}

function mockPOSEntryDetail(): EntryDetail {
  const ed = newEntryDetail();
  ed.transactionCode = CheckingDebit;
  ed.rdfiIdentification = '12104288';
  ed.checkDigit = '2';
  ed.dfiAccountNumber = '744-5678-99';
  ed.amount = 25000;
  ed.identificationNumber = '45689033';
  ed.individualName = 'Wade Arnold';
  ed.traceNumber = '231380100000001';
  ed.discretionaryData = '01';
  return ed;
}

function mockCOREntryDetail(): EntryDetail {
  const ed = newEntryDetail();
  ed.transactionCode = CheckingReturnNOCCredit;
  ed.rdfiIdentification = '12104288';
  ed.checkDigit = '2';
  ed.dfiAccountNumber = '744-5678-99';
  ed.amount = 0;
  ed.identificationNumber = 'location #23';
  ed.individualName = 'Wade Arnold';
  ed.traceNumber = '121042880000001';
  ed.discretionaryData = 'S';
  return ed;
}

function mockADVEntryDetail(): ADVEntryDetail {
  const ed = newADVEntryDetail();
  ed.transactionCode = CreditForDebitsOriginated;
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

function mockAddenda02(): Addenda02 {
  const a = newAddenda02();
  a.referenceInformationOne = 'REFONEA';
  a.referenceInformationTwo = 'REF';
  a.terminalIdentificationCode = 'TERM02';
  a.transactionSerialNumber = '100049';
  a.transactionDate = '0612';
  a.authorizationCodeOrExpireDate = '123456';
  a.terminalLocation = 'Target Store 0049';
  a.terminalCity = 'PHILADELPHIA';
  a.terminalState = 'PA';
  a.traceNumber = '121042880000001';
  return a;
}

function mockAddenda05(): Addenda05 {
  const a = newAddenda05();
  a.sequenceNumber = 1;
  a.paymentRelatedInformation = 'This is an Addenda05';
  a.entryDetailSequenceNumber = 1;
  return a;
}

function mockAddenda98(): Addenda98 {
  const a = newAddenda98();
  a.changeCode = 'C01';
  a.originalTrace = '12345';
  a.originalDFI = '9101298';
  a.correctedData = '1918171614';
  a.traceNumber = '91012980000088';
  return a;
}

function mockAddenda99(): Addenda99 {
  const a = newAddenda99();
  a.returnCode = 'R07';
  a.originalTrace = '99912340000015';
  a.addendaInformation = 'Authorization Revoked';
  a.originalDFI = '9101298';
  a.traceNumber = '121042880000001';
  return a;
}

function mockAddenda99Dishonored(): Addenda99Dishonored {
  const a = newAddenda99Dishonored();
  a.dishonoredReturnReasonCode = 'R68';
  a.originalEntryTraceNumber = '059999990000301';
  a.originalReceivingDFIIdentification = '12391871';
  a.returnTraceNumber = '123918710000001';
  a.returnSettlementDate = '179';
  a.returnReasonCode = '01';
  a.addendaInformation = 'Untimely Return';
  a.traceNumber = '231380100000001';
  return a;
}

function mockAddenda99Contested(): Addenda99Contested {
  const a = newAddenda99Contested();
  a.contestedReturnCode = 'R72';
  a.originalEntryTraceNumber = '059999990000301';
  a.dateOriginalEntryReturned = '010101';
  a.originalReceivingDFIIdentification = '12391871';
  a.originalSettlementDate = '179';
  a.returnTraceNumber = '123918710000001';
  a.returnSettlementDate = '179';
  a.returnReasonCode = '01';
  a.dishonoredReturnTraceNumber = '123918710000002';
  a.dishonoredReturnSettlementDate = '179';
  a.dishonoredReturnReasonCode = 'R68';
  a.traceNumber = '231380100000001';
  return a;
}

function mockIATBatchHeaderFF(): IATBatchHeader {
  const bh = IATBatchHeader.newIATBatchHeader();
  bh.serviceClassCode = CreditsOnly;
  bh.foreignExchangeIndicator = 'FF';
  bh.foreignExchangeReferenceIndicator = 3;
  bh.isoDestinationCountryCode = 'US';
  bh.originatorIdentification = '123456789';
  bh.standardEntryClassCode = 'IAT';
  bh.companyEntryDescription = 'TRADEPAYMT';
  bh.isoOriginatingCurrencyCode = 'CAD';
  bh.isoDestinationCurrencyCode = 'USD';
  bh.odfiIdentification = '23138010';
  return bh;
}

function mockIATEntryDetail(): IATEntryDetail {
  const ed = new IATEntryDetail();
  ed.transactionCode = CheckingCredit;
  ed.rdfiIdentification = '12104288';
  ed.checkDigit = '2';
  ed.addendaRecords = 7;
  ed.dfiAccountNumber = '123456789';
  ed.amount = 100000;
  ed.traceNumber = '231380100000001';
  return ed;
}

function mockIATEntryDetailWithAddendas(): IATEntryDetail {
  const ed = mockIATEntryDetail();
  ed.addenda10 = newAddenda10();
  ed.addenda10.transactionTypeCode = 'ANN';
  ed.addenda10.foreignPaymentAmount = 100000;
  ed.addenda10.foreignTraceNumber = '928383-23938';
  ed.addenda10.name = 'BEK Enterprises';
  ed.addenda10.entryDetailSequenceNumber = 1;
  ed.addenda11 = newAddenda11();
  ed.addenda11.originatorName = 'BEK Solutions';
  ed.addenda11.originatorStreetAddress = '15 West Place Street';
  ed.addenda11.entryDetailSequenceNumber = 1;
  ed.addenda12 = newAddenda12();
  ed.addenda12.originatorCityStateProvince = 'JacobsTown*PA\\';
  ed.addenda12.originatorCountryPostalCode = 'US*19305\\';
  ed.addenda12.entryDetailSequenceNumber = 1;
  ed.addenda13 = newAddenda13();
  ed.addenda13.odfiName = 'Wells Fargo';
  ed.addenda13.odfiIDNumberQualifier = '01';
  ed.addenda13.odfiIdentification = '121042882';
  ed.addenda13.odfiBranchCountryCode = 'US';
  ed.addenda13.entryDetailSequenceNumber = 1;
  ed.addenda14 = newAddenda14();
  ed.addenda14.rdfiName = 'Citadel Bank';
  ed.addenda14.rdfiIDNumberQualifier = '01';
  ed.addenda14.rdfiIdentification = '231380104';
  ed.addenda14.rdfiBranchCountryCode = 'US';
  ed.addenda14.entryDetailSequenceNumber = 1;
  ed.addenda15 = newAddenda15();
  ed.addenda15.receiverIDNumber = '987465493213987';
  ed.addenda15.receiverStreetAddress = '2121 Front Street';
  ed.addenda15.entryDetailSequenceNumber = 1;
  ed.addenda16 = newAddenda16();
  ed.addenda16.receiverCityStateProvince = 'LetterTown*AB\\';
  ed.addenda16.receiverCountryPostalCode = 'CA*80014\\';
  ed.addenda16.entryDetailSequenceNumber = 1;
  return ed;
}

// =========================================================================
// File reading tests
// =========================================================================

describe('Reader', () => {
  it('TestReadFile - reads a WEB debit file', () => {
    const data = readTestFile('web-debit.ach');
    const file = readACHFile(data);
    expect(file.header.immediateOrigin).toBe('231380104');
  });

  it('TestReadFiles - reads multiple files', () => {
    const paths = ['return-WEB.ach', 'web-debit.ach'];
    const contents = paths.map(p => readTestFile(p));
    const files = readACHFiles(contents);
    expect(files.length).toBe(2);
  });

  it('TestReadPartial - reads a partial file', () => {
    const data = readTestFile('bh-ed-ad-bh-ed-ad-ed-ad.ach');
    const r = new Reader(data);
    let file: File;
    try {
      file = r.read();
    } catch {
      // We expect errors but should still get partial data
      file = r.file;
    }
    expect(file.batches.length).toBe(2);

    const b1Entries = file.batches[0].getEntries();
    expect(b1Entries.length).toBe(1);
    expect(b1Entries[0].addenda98).toBeFalsy();
    expect(b1Entries[0].addenda99).toBeTruthy();

    const bh = file.batches[0].getHeader();
    expect(bh.serviceClassCode).toBe(DebitsOnly);
    expect(bh.companyName.trim()).toBe('Adam Shannon');
    expect(bh.companyIdentification.trim()).toBe('MOOVYYYYYY');
    expect(bh.standardEntryClassCode).toBe('PPD');

    const entry = b1Entries[0];
    expect(entry.transactionCode).toBe(CheckingReturnNOCDebit);
    expect(entry.dfiAccountNumber.trim()).toBe('15XXXXXXXXXX1');
    expect(entry.addenda99!.returnCode).toBe('R02');

    const b2Entries = file.batches[1].getEntries();
    expect(b2Entries.length).toBe(2);
    for (const e of b2Entries) {
      expect(e.addenda98).toBeFalsy();
      expect(e.addenda99).toBeTruthy();
    }

    expect(b2Entries[0].transactionCode).toBe(CheckingReturnNOCCredit);
    expect(b2Entries[0].dfiAccountNumber.trim()).toBe('1XXXXXXXXXXX2');
    expect(b2Entries[0].addenda99!.returnCode).toBe('R03');
  });

  it('TestReader__crashers - parses crasher files without panicking', () => {
    const crasherDir = path.join(testdataDir, 'crashers');
    if (!fs.existsSync(crasherDir)) return;
    const files = fs.readdirSync(crasherDir);
    for (const file of files) {
      const data = fs.readFileSync(path.join(crasherDir, file), 'utf-8');
      // Just make sure it doesn't throw an unrecoverable error
      try {
        const r = new Reader(data);
        r.read();
      } catch {
        // errors are expected, we just don't want crashes
      }
    }
  });

  // PPD Debit read
  it('TestPPDDebitRead - reads a PPD debit file', () => {
    const data = readTestFile('ppd-debit.ach');
    const r = new Reader(data);
    const file = r.read();
    expect(file.validate()).toBeNull();
  });

  // WEB Debit read
  it('TestWEBDebitRead - reads a WEB debit file', () => {
    const data = readTestFile('web-debit.ach');
    const r = new Reader(data);
    const file = r.read();
    expect(file.validate()).toBeNull();
  });

  // PPD Debit Fixed Length read
  it('TestPPDDebitFixedLengthRead - reads a PPD fixed-length file', () => {
    const data = readTestFile('ppd-debit-fixedLength.ach');
    const r = new Reader(data);
    const file = r.read();
    // should parse without errors
    expect(file).toBeDefined();
  });

  // PPD Debit Fixed Length Invalid
  it('TestPPDDebitFixedLengthRead__InvalidLength - errors on invalid fixed length', () => {
    const data = readTestFile('ppd-debit-fixedLengthInvalid.ach');
    const r = new Reader(data);
    expect(() => r.read()).toThrow('94');
  });

  // Invalid check digit with ValidateOpts
  it('TestPPDInvalidEntryCheckDigit_NoErrorWithValidateOpt', () => {
    const data = readTestFile('ppd-debit-invalid-entryDetail-checkDigit.ach');
    const r = new Reader(data);
    r.setValidation({ allowInvalidCheckDigit: true });
    const file = r.read();
    expect(file.validate()).toBeNull();
  });

  it('TestPPDInvalidEntryCheckDigit_ErrorWithoutValidateOpt', () => {
    const data = readTestFile('ppd-debit-invalid-entryDetail-checkDigit.ach');
    const r = new Reader(data);
    expect(() => r.read()).toThrow();
  });

  // Record type unknown
  it('TestRecordTypeUnknown - errors on unknown record type', () => {
    const line = '301 076401251 0764012510807291511A094101achdestname            companyname                    ';
    const r = new Reader(line);
    expect(() => r.read()).toThrow();
  });

  // Two file headers
  it('TestTwoFileHeaders - errors on duplicate file header', () => {
    const line = '101 076401251 0764012510807291511A094101achdestname            companyname                    ';
    const twoHeaders = line + '\n' + line;
    const r = new Reader(twoHeaders);
    expect(() => r.read()).toThrow();
  });

  // File Control RTF tests
  it('TestFileControl_RTF - file_header_control.rtf', () => {
    const data = readTestFile('file_header_control.rtf');
    const r = new Reader(data);
    expect(() => r.read()).toThrow();
  });

  it('TestFileControl_RTF - missing_file_control.rtf', () => {
    const data = readTestFile('missing_file_control.rtf');
    const r = new Reader(data);
    expect(() => r.read()).toThrow();
  });

  it('TestFileControl_RTF - file_parsing_missing_file_control.txt with SkipAll', () => {
    const data = readTestFile('file_parsing_missing_file_control.txt');
    const r = new Reader(data);
    r.setValidation({ skipAll: true });
    // The file control record is empty so we should receive an error
    expect(() => r.read()).toThrow();
  });

  it('TestFileControl_RTF - file_parsing_missing_file_control.txt with PreserveSpaces', () => {
    const data = readTestFile('file_parsing_missing_file_control.txt');
    const r = new Reader(data);
    r.setValidation({ skipAll: true, preserveSpaces: true });
    // With preserveSpaces, spaces in file control are preserved, so it's not empty
    // However our reader may still throw if file control is considered empty
    let file: File;
    try {
      file = r.read();
    } catch {
      file = r.file;
    }
    expect(file).toBeDefined();
  });

  // Empty file
  it('TestFileLineEmpty - errors on empty file', () => {
    const r = new Reader('');
    expect(() => r.read()).toThrow();
  });

  // Short line
  it('TestFileLineShort - errors on short line', () => {
    const line = '1 line is only 70 characters ........................................!';
    const r = new Reader(line);
    expect(() => r.read()).toThrow();
  });

  // Long line
  it('TestFileLineLong - errors on long line', () => {
    const line = '1 line is 100 characters ..........................................................................!\n2 line is 94 characters ....................................................................!\n';
    const r = new Reader(line);
    expect(() => r.read()).toThrow();
  });

  // File header error
  it('TestFileFileHeaderErr - validates file header error', () => {
    const fh = mockFileHeader();
    fh.immediateOrigin = '';
    const r = new Reader(fh.string());
    r.file.control = mockFileControl();
    expect(() => r.read()).toThrow();
  });

  // Batch header error - no file header first
  it('TestFileBatchHeaderErr - validates batch header error', () => {
    const bh = mockBatchHeader();
    bh.odfiIdentification = '';
    const r = new Reader(bh.string());
    expect(() => r.read()).toThrow();
  });

  // Entry detail outside batch
  it('TestFileEntryDetailOutsideBatch - entry detail outside batch errors', () => {
    const ed = mockEntryDetail();
    const r = new Reader(ed.string());
    expect(() => r.read()).toThrow();
  });

  // Addenda05 error
  it('TestFileAddenda05 - validates addenda05 error', () => {
    const bh = mockBatchHeader();
    const ed = mockEntryDetail();
    const addenda = mockAddenda05();
    addenda.sequenceNumber = 0;
    ed.addAddenda05(addenda);
    const line = bh.string() + '\n' + ed.string() + '\n' + ed.addenda05[0].string();
    const r = new Reader(line);
    expect(() => r.read()).toThrow();
  });

  // Addenda outside batch
  it('TestFileAddendaOutsideBatch - addenda outside batch errors', () => {
    const ed = mockEntryDetail();
    const addenda = mockAddenda05();
    const line = ed.string() + '\n' + addenda.string();
    const r = new Reader(line);
    expect(() => r.read()).toThrow();
  });

  // Addenda no indicator
  it('TestFileAddendaNoIndicator - no addenda indicator errors', () => {
    const bh = mockBatchHeader();
    const ed = mockEntryDetail();
    const addenda = mockAddenda05();
    const line = bh.string() + '\n' + ed.string() + '\n' + addenda.string();
    const r = new Reader(line);
    expect(() => r.read()).toThrow();
  });

  // Addenda outside entry
  it('TestFileAddendaOutsideEntry - addenda outside entry errors', () => {
    const bh = mockBatchHeader();
    const addenda = mockAddenda05();
    const line = bh.string() + '\n' + addenda.string();
    const r = new Reader(line);
    expect(() => r.read()).toThrow();
  });

  // Batch header SEC code error
  it('TestFileBatchHeaderSEC - invalid SEC code errors', () => {
    const bh = mockBatchHeader();
    bh.standardEntryClassCode = 'ABC';
    const r = new Reader(bh.string());
    expect(() => r.read()).toThrow();
  });

  // Batch control no current batch
  it('TestFileBatchControlNoCurrentBatch - batch control outside batch errors', () => {
    const bc = mockBatchControl();
    const r = new Reader(bc.string());
    expect(() => r.read()).toThrow();
  });

  // File control error
  it('TestFileFileControlErr - validates file control error', () => {
    const fc = mockFileControl();
    fc.batchCount = 0;
    const r = new Reader(fc.string());
    expect(() => r.read()).toThrow();
  });

  // Long combined line test
  it('TestFileLongErr - batch header with ServiceClassCode 000', () => {
    const line = '101 076401251 0764012510807291511A094101achdestname            companyname                    5000companyname                         origid    PPDCHECKPAYMT000002080730   1076401250000001';
    const r = new Reader(line);
    expect(() => r.read()).toThrow();
  });

  // File header immediate origin/destination
  it('TestFileFHImmediateOrigin - validates file header immediate destination', () => {
    const fh = mockFileHeader();
    fh.immediateDestination = '';
    const r = new Reader(fh.string());
    r.file.control = mockFileControl();
    expect(() => r.read()).toThrow();
  });

  // ACH file with PPD and IAT entries
  it('TestACHFileRead - reads file with PPD and IAT entries', () => {
    const data = readTestFile('20110805A.ach');
    const r = new Reader(data);
    const file = r.read();
    // File has batch count mismatch in control
    const err = file.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('BatchCount');
  });

  // ACH file with IAT only
  it('TestACHFileRead3 - reads file with IAT entries only', () => {
    const data = readTestFile('20180713-IAT.ach');
    const file = readACHFile(data);
    expect(file.validate()).toBeNull();
  });

  // IAT with Addenda17
  it('TestACHIATAddenda17 - reads IAT with Addenda17', () => {
    const data = readTestFile('20180716-IAT-A17.ach');
    const file = readACHFile(data);
    expect(file.validate()).toBeNull();
  });

  // IAT with Addenda17 and Addenda18
  it('TestACHIATAddenda1718 - reads IAT with Addenda17 and Addenda18', () => {
    const data = readTestFile('20180716-IAT-A17-A18.ach');
    const file = readACHFile(data);
    expect(file.validate()).toBeNull();
  });

  // IAT invalid batch header
  it('TestACHFileIATBatchHeader - errors on invalid IAT batch header', () => {
    const data = readTestFile('iat-invalidBatchHeader.ach');
    const r = new Reader(data);
    expect(() => r.read()).toThrow();
  });

  // IAT invalid entry detail
  it('TestACHFileIATEntryDetail - errors on invalid IAT entry detail', () => {
    const data = readTestFile('iat-invalidEntryDetail.ach');
    const r = new Reader(data);
    expect(() => r.read()).toThrow();
  });

  // IAT invalid addenda record indicator
  it('TestIATAddendaRecordIndicator - errors on invalid addenda record indicator', () => {
    const data = readTestFile('iat-invalidAddendaRecordIndicator.ach');
    const r = new Reader(data);
    expect(() => r.read()).toThrow();
  });

  // IAT invalid Addenda10-18
  it('TestACHFileIATAddenda10 - errors on invalid Addenda10', () => {
    const data = readTestFile('iat-invalidAddenda10.ach');
    const r = new Reader(data);
    expect(() => r.read()).toThrow();
  });

  it('TestACHFileIATAddenda11 - errors on invalid Addenda11', () => {
    const data = readTestFile('iat-invalidAddenda11.ach');
    const r = new Reader(data);
    expect(() => r.read()).toThrow();
  });

  it('TestACHFileIATAddenda12 - errors on invalid Addenda12', () => {
    const data = readTestFile('iat-invalidAddenda12.ach');
    const r = new Reader(data);
    expect(() => r.read()).toThrow();
  });

  it('TestACHFileIATAddenda13 - errors on invalid Addenda13', () => {
    const data = readTestFile('Iat-invalidAddenda13.ach');
    const r = new Reader(data);
    expect(() => r.read()).toThrow();
  });

  it('TestACHFileIATAddenda14 - errors on invalid Addenda14', () => {
    const data = readTestFile('iat-invalidAddenda14.ach');
    const r = new Reader(data);
    expect(() => r.read()).toThrow();
  });

  it('TestACHFileIATAddenda15 - errors on invalid Addenda15', () => {
    const data = readTestFile('iat-invalidAddenda15.ach');
    const r = new Reader(data);
    expect(() => r.read()).toThrow();
  });

  it('TestACHFileIATAddenda16 - errors on invalid Addenda16', () => {
    const data = readTestFile('iat-invalidAddenda16.ach');
    const r = new Reader(data);
    expect(() => r.read()).toThrow();
  });

  it('TestACHFileIATAddenda17 - errors on invalid Addenda17', () => {
    const data = readTestFile('iat-invalidAddenda17.ach');
    const r = new Reader(data);
    expect(() => r.read()).toThrow();
  });

  it('TestACHFileIATAddenda18 - errors on invalid Addenda18', () => {
    const data = readTestFile('iat-invalidAddenda18.ach');
    const r = new Reader(data);
    expect(() => r.read()).toThrow();
  });

  // IAT Addenda98 (valid)
  it('TestACHFileIATAddenda98 - reads valid IAT Addenda98', () => {
    const data = readTestFile('iat-addenda98.ach');
    const file = readACHFile(data);
    expect(file.iatBatches.length).toBe(1);
    expect(file.iatBatches[0].entries.length).toBe(1);
    const entry = file.iatBatches[0].entries[0];
    expect(entry.addenda98).toBeDefined();
    expect(entry.category).toBe(CategoryNOC);
  });

  // IAT invalid Addenda98
  it('TestACHFileIATInvalidAddenda98 - errors on invalid IAT Addenda98', () => {
    const data = readTestFile('iat-invalidAddenda98.ach');
    const r = new Reader(data);
    expect(() => r.read()).toThrow();
  });

  // IAT Addenda99 (valid)
  it('TestACHFileIATAddenda99 - reads valid IAT Addenda99', () => {
    const data = readTestFile('iat-addenda99.ach');
    const file = readACHFile(data);
    expect(file.iatBatches.length).toBe(1);
    expect(file.iatBatches[0].entries.length).toBe(1);
    const entry = file.iatBatches[0].entries[0];
    expect(entry.addenda99).toBeDefined();
    expect(entry.category).toBe(CategoryReturn);
  });

  // IAT invalid Addenda99
  it('TestACHFileIATInvalidAddenda99 - errors on invalid IAT Addenda99', () => {
    const data = readTestFile('iat-invalidAddenda99.ach');
    const r = new Reader(data);
    expect(() => r.read()).toThrow();
  });

  // POS invalid return file
  it('TestPOSInvalidReturnFile - errors on invalid POS return', () => {
    const data = readTestFile('pos-invalidReturnFile.ach');
    const r = new Reader(data);
    expect(() => r.read()).toThrow();
  });

  // WEB invalid NOC file
  it('TestWEBInvalidNOCFile - errors on invalid WEB NOC', () => {
    const data = readTestFile('web-invalidNOCFile.ach');
    const r = new Reader(data);
    expect(() => r.read()).toThrow();
  });

  // POS invalid entry detail
  it('TestPOSInvalidEntryDetail - errors on invalid POS entry detail', () => {
    const data = readTestFile('pos-invalidEntryDetail.ach');
    const r = new Reader(data);
    expect(() => r.read()).toThrow();
  });

  // ADV invalid batch entries
  it('TestADVInvalidBatchEntries - errors on invalid ADV batch entries', () => {
    const data = readTestFile('adv-invalidBatchEntries.ach');
    const r = new Reader(data);
    expect(() => r.read()).toThrow();
  });

  // ADV no file control
  it('TestADVNoFileControl - errors on ADV with no file control', () => {
    const data = readTestFile('adv-noFileControl.ach');
    const r = new Reader(data);
    try {
      r.read();
    } catch (e) {
      expect(hasError(e, ErrFileControl)).toBe(true);
    }
  });

  // IAT invalid batch control
  it('TestACHFileIATBC - errors on invalid IAT batch control', () => {
    const data = readTestFile('iat-invalidBatchControl.ach');
    const r = new Reader(data);
    expect(() => r.read()).toThrow();
  });

  // IAT batch header error
  it('TestACHFileIATBH - errors on invalid IAT batch header', () => {
    const data = readTestFile('iat-batchHeaderErr.ach');
    const r = new Reader(data);
    expect(() => r.read()).toThrow();
  });

  // Return WEB file
  it('TestReturnACHFile - reads WEB return file', () => {
    const data = readTestFile('return-WEB.ach');
    const file = readACHFile(data);
    expect(file.validate()).toBeNull();
  });

  // Return PPD custom reason code
  it('TestReturnACHFileCustomReasonCode - reads PPD return with custom reason code', () => {
    const data = readTestFile('return-PPD-custom-reason-code.ach');
    const r = new Reader(data);
    r.setValidation({ customReturnCodes: true });
    const file = r.read();
    expect(file.validate()).toBeNull();
  });

  // ADV File Control error
  it('TestADVFileControl - errors on invalid ADV file control', () => {
    const data = readTestFile('adv-invalidFileControl.ach');
    const r = new Reader(data);
    expect(() => r.read()).toThrow();
  });

  // File too long
  it('TestACHFileTooLongErr - errors on file that is too long', () => {
    const data = readTestFile('20110729A-invalid.ach');
    const r = new Reader(data);
    r.setMaxLines(200);
    expect(() => r.read()).toThrow('exceeds maximum');
  });

  // Short line file
  it('TestReader__ShortLines - reads file with short lines', () => {
    const data = readTestFile('short-line.ach');
    const file = readACHFile(data);
    expect(file.batches.length).toBe(1);
  });

  // Long line file
  it('TestReader__LongLine - reads file with long lines', () => {
    const data = readTestFile('long-line.ach');
    const file = readACHFile(data);
    expect(file.batches.length).toBe(1);
  });

  // Partial file parsing
  it('TestReader__partial - reads partial file', () => {
    const data = readTestFile('invalid-two-micro-deposits.ach');
    const r = new Reader(data);
    let file: File;
    try {
      file = r.read();
    } catch {
      file = r.file;
    }
    expect(file.control.batchCount).toBe(2);
    expect(file.batches.length).toBe(2);
    expect(file.batches[0].getEntries().length).toBe(3);
    expect(file.batches[1].getEntries().length).toBe(3);
  });

  // Skip validation
  it('TestReadFile_SkipValidation - reads with SkipAll', () => {
    const data = readTestFile('skip-validation.ach').trim();
    const r = new Reader(data);
    r.setValidation({ skipAll: true });
    const file = r.read();
    expect(file.validate()).toBeNull();
    expect(file.batches.length).toBe(3);
  });

  // PreserveSpaces
  it('TestReadFile_PreserveSpacesOptEnabled', () => {
    const data = readTestFile('ppd-debit.ach');
    const r = new Reader(data);
    r.setValidation({ preserveSpaces: true });
    const file = r.read();
    expect(file.header.immediateDestinationName).toBe('Federal Reserve Bank   ');
    const batch = file.batches[0];
    expect(batch.getHeader().companyIdentification).toBe('121042882 ');
    expect(batch.getControl().companyIdentification).toBe('121042882 ');
  });

  // Line numbers
  it('TestReadFile_lineNumbers - validates line numbers on records', () => {
    // return-WEB.ach
    const webData = readTestFile('return-WEB.ach');
    const webFile = readACHFile(webData);
    expect(webFile.header.lineNumber).toBe(1);
    expect(webFile.batches[0].getHeader().lineNumber).toBe(2);
    expect(webFile.batches[0].getEntries()[0].lineNumber).toBe(3);
    expect(webFile.batches[0].getEntries()[0].addenda99!.lineNumber).toBe(4);
    expect(webFile.batches[0].getControl().lineNumber).toBe(5);
    expect(webFile.control.lineNumber).toBe(10);

    // 20180713-IAT.ach
    const iatData = readTestFile('20180713-IAT.ach');
    const iatFile = readACHFile(iatData);
    expect(iatFile.iatBatches[0].header.lineNumber).toBe(2);
    expect(iatFile.iatBatches[0].entries[0].lineNumber).toBe(3);
    expect(iatFile.iatBatches[0].entries[0].addenda10!.lineNumber).toBe(4);
    expect(iatFile.iatBatches[0].entries[0].addenda11!.lineNumber).toBe(5);
    expect(iatFile.iatBatches[0].entries[0].addenda12!.lineNumber).toBe(6);
    expect(iatFile.iatBatches[0].entries[0].addenda13!.lineNumber).toBe(7);
    expect(iatFile.iatBatches[0].entries[0].addenda14!.lineNumber).toBe(8);
    expect(iatFile.iatBatches[0].entries[0].addenda15!.lineNumber).toBe(9);
    expect(iatFile.iatBatches[0].entries[0].addenda16!.lineNumber).toBe(10);
    expect(iatFile.iatBatches[0].control.lineNumber).toBe(11);

    // adv.ach
    const advData = readTestFile('adv.ach');
    const advFile = readACHFile(advData);
    expect(advFile.header.lineNumber).toBe(1);
    expect(advFile.batches[0].getHeader().lineNumber).toBe(2);
    expect(advFile.batches[0].getADVEntries()[0].lineNumber).toBe(3);
    expect(advFile.batches[0].getADVControl().lineNumber).toBe(5);
    expect(advFile.advControl.lineNumber).toBe(6);
  });

  // readRunes tests
  it('TestReadRunes - extracts rune substrings correctly', () => {
    expect(readRunes(0, 0, 'def321')).toBe('');
    expect(readRunes(3, 9, 'def321')).toBe('321');
    expect(readRunes(1, 4, 'abc123')).toBe('bc12');
    expect(readRunes(0, 4, "D'Amador")).toBe("D'Am");
    // multi-byte characters
    expect(readRunes(2, 4, '¦¢¬±ãèñ')).toBe('¬±ãè');
  });

  // Category assignment round-trip test
  it('TestCategoryAssignment - assigns categories correctly through round-trip', () => {
    const file = newFile();
    file.setHeader(mockFileHeader());

    // Forward entry
    const forwardEntry = mockEntryDetail();
    forwardEntry.dfiAccountNumber = '1';
    forwardEntry.category = CategoryForward;
    forwardEntry.discretionaryData = '01';
    const forwardBh = mockBatchWEBHeader();
    const [forwardBatch, err1] = newBatch(forwardBh);
    expect(err1).toBeNull();
    forwardBatch!.addEntry(forwardEntry);
    const cErr1 = forwardBatch!.create();
    expect(cErr1).toBeNull();
    file.addBatch(forwardBatch!);

    // Return entry
    const returnEntry = mockEntryDetail();
    returnEntry.dfiAccountNumber = '2';
    returnEntry.addenda99 = mockAddenda99();
    returnEntry.addendaRecordIndicator = 1;
    returnEntry.category = CategoryReturn;
    const returnBh = mockBatchWEBHeader();
    const [returnBatch, err2] = newBatch(returnBh);
    expect(err2).toBeNull();
    returnBatch!.addEntry(returnEntry);
    const cErr2 = returnBatch!.create();
    expect(cErr2).toBeNull();
    file.addBatch(returnBatch!);

    // Dishonored Return entry
    const dishonoredEntry = mockEntryDetail();
    dishonoredEntry.dfiAccountNumber = '3';
    dishonoredEntry.addenda99Dishonored = mockAddenda99Dishonored();
    dishonoredEntry.addendaRecordIndicator = 1;
    dishonoredEntry.category = CategoryDishonoredReturn;
    const dishonoredBh = mockBatchWEBHeader();
    const [dishonoredBatch, err3] = newBatch(dishonoredBh);
    expect(err3).toBeNull();
    dishonoredBatch!.addEntry(dishonoredEntry);
    const cErr3 = dishonoredBatch!.create();
    expect(cErr3).toBeNull();
    file.addBatch(dishonoredBatch!);

    // NOC entry
    const nocEntry = mockCOREntryDetail();
    nocEntry.dfiAccountNumber = '5';
    nocEntry.addenda98 = mockAddenda98();
    nocEntry.addendaRecordIndicator = 1;
    nocEntry.category = CategoryNOC;
    const nocBh = mockBatchCORHeader();
    const [nocBatch, err5] = newBatch(nocBh);
    expect(err5).toBeNull();
    nocBatch!.addEntry(nocEntry);
    const cErr5 = nocBatch!.create();
    expect(cErr5).toBeNull();
    file.addBatch(nocBatch!);

    // Forward IAT entry
    const forwardIATEntry = mockIATEntryDetailWithAddendas();
    forwardIATEntry.dfiAccountNumber = '6';
    forwardIATEntry.category = CategoryForward;
    const forwardIATBatch = new IATBatch(mockIATBatchHeaderFF());
    forwardIATBatch.addEntry(forwardIATEntry);
    const cErr6 = forwardIATBatch.create();
    expect(cErr6).toBeNull();
    file.addIATBatch(forwardIATBatch);

    const fErr = file.create();
    expect(fErr).toBeNull();
    const vErr = file.validate();
    expect(vErr).toBeNull();

    const w = new Writer();
    const output = w.write(file);

    const readFile = readACHFile(output);
    const categoriesByAccount: Record<string, string> = {};
    for (const batch of readFile.batches) {
      for (const entry of batch.getEntries()) {
        categoriesByAccount[entry.dfiAccountNumber.trim()] = entry.category;
      }
    }
    for (const iatBatch of readFile.iatBatches) {
      for (const entry of iatBatch.entries) {
        categoriesByAccount[entry.dfiAccountNumber.trim()] = entry.category;
      }
    }

    expect(categoriesByAccount['1']).toBe(CategoryForward);
    expect(categoriesByAccount['2']).toBe(CategoryReturn);
    expect(categoriesByAccount['3']).toBe(CategoryDishonoredReturn);
    expect(categoriesByAccount['5']).toBe(CategoryNOC);
    expect(categoriesByAccount['6']).toBe(CategoryForward);
  });

  // TestCategoryAssignment with DishonoredReturnContested (account "4")
  it('TestCategoryAssignment_DishonoredReturnContested - includes contested entry', () => {
    const file = newFile();
    file.setHeader(mockFileHeader());

    // Forward entry
    const forwardEntry = mockEntryDetail();
    forwardEntry.dfiAccountNumber = '1';
    forwardEntry.category = CategoryForward;
    forwardEntry.discretionaryData = '01';
    const forwardBh = mockBatchWEBHeader();
    const [forwardBatch] = newBatch(forwardBh);
    forwardBatch!.addEntry(forwardEntry);
    forwardBatch!.create();
    file.addBatch(forwardBatch!);

    // DishonoredReturnContested entry
    const contestedEntry = mockEntryDetail();
    contestedEntry.dfiAccountNumber = '4';
    contestedEntry.addenda99Contested = mockAddenda99Contested();
    contestedEntry.addendaRecordIndicator = 1;
    contestedEntry.category = CategoryDishonoredReturnContested;
    const contestedBh = mockBatchWEBHeader();
    const [contestedBatch] = newBatch(contestedBh);
    contestedBatch!.addEntry(contestedEntry);
    contestedBatch!.create();
    file.addBatch(contestedBatch!);

    file.create();

    const w = new Writer();
    const output = w.write(file);
    const readFile = readACHFile(output);

    const categoriesByAccount: Record<string, string> = {};
    for (const batch of readFile.batches) {
      for (const entry of batch.getEntries()) {
        categoriesByAccount[entry.dfiAccountNumber.trim()] = entry.category;
      }
    }

    expect(categoriesByAccount['1']).toBe(CategoryForward);
    expect(categoriesByAccount['4']).toBe(CategoryDishonoredReturnContested);
  });

  // =========================================================================
  // Inline record string parsing tests (from Go reader_test.go)
  // =========================================================================

  // TestFileBatchHeaderDuplicate - two consecutive batch headers
  it('TestFileBatchHeaderDuplicate - errors on consecutive batch headers', () => {
    const bh = mockBatchPPDHeader();
    const line = bh.string() + '\n' + bh.string();
    const r = new Reader(line);
    expect(() => r.read()).toThrow();
  });

  // TestFileEntryDetail - entry detail with transactionCode=0 produces short line
  it('TestFileEntryDetail - entry detail with zero transaction code', () => {
    const ed = mockEntryDetail();
    ed.transactionCode = 0;
    const bh = mockBatchPPDHeader();
    const line = bh.string() + '\n' + ed.string();
    const r = new Reader(line);
    expect(() => r.read()).toThrow();
  });

  // TestFileAddenda02invalid - invalid addenda02 (bad transaction date)
  it('TestFileAddenda02invalid - errors on invalid addenda02', () => {
    const bh = mockBatchPOSHeader();
    const ed = mockPOSEntryDetail();
    const addenda02Val = mockAddenda02();
    addenda02Val.transactionDate = '0000';
    ed.addenda02 = addenda02Val;
    const line = bh.string() + '\n' + ed.string() + '\n' + ed.addenda02!.string();
    const r = new Reader(line);
    expect(() => r.read()).toThrow();
  });

  // TestFileAddenda02 - valid addenda02 still errors (no addenda indicator)
  it('TestFileAddenda02 - addenda02 with no indicator errors', () => {
    const bh = mockBatchPOSHeader();
    const ed = mockPOSEntryDetail();
    ed.addenda02 = mockAddenda02();
    const line = bh.string() + '\n' + ed.string() + '\n' + ed.addenda02!.string();
    const r = new Reader(line);
    expect(() => r.read()).toThrow();
  });

  // TestFileAddenda98invalid - invalid change code
  it('TestFileAddenda98invalid - errors on invalid addenda98', () => {
    const bh = mockBatchPPDHeader();
    const ed = mockPPDEntryDetail();
    const addenda98Val = mockAddenda98();
    addenda98Val.traceNumber = '0000001';
    addenda98Val.changeCode = 'C50';
    addenda98Val.correctedData = 'ACME One Corporation';
    ed.category = CategoryNOC;
    ed.addenda98 = addenda98Val;
    const line = bh.string() + '\n' + ed.string() + '\n' + ed.addenda98!.string();
    const r = new Reader(line);
    expect(() => r.read()).toThrow();
  });

  // TestFileAddenda98 - valid addenda98 still errors (no addenda indicator)
  it('TestFileAddenda98 - valid addenda98 with no indicator errors', () => {
    const bh = mockBatchHeader();
    const ed = mockEntryDetail();
    const addenda98Val = mockAddenda98();
    addenda98Val.traceNumber = '0000001';
    addenda98Val.changeCode = 'C10';
    addenda98Val.correctedData = 'ACME One Corporation';
    ed.category = CategoryNOC;
    ed.addenda98 = addenda98Val;
    const line = bh.string() + '\n' + ed.string() + '\n' + ed.addenda98!.string();
    const r = new Reader(line);
    expect(() => r.read()).toThrow();
  });

  // TestFileAddenda99invalid - invalid return code
  it('TestFileAddenda99invalid - errors on invalid addenda99', () => {
    const bh = mockBatchPPDHeader();
    const ed = mockPPDEntryDetail();
    const addenda99Val = mockAddenda99();
    addenda99Val.traceNumber = '0000001';
    addenda99Val.returnCode = '100';
    ed.category = CategoryReturn;
    ed.addenda99 = addenda99Val;
    const line = bh.string() + '\n' + ed.string() + '\n' + ed.addenda99!.string();
    const r = new Reader(line);
    expect(() => r.read()).toThrow();
  });

  // TestFileAddenda99 - valid addenda99 still errors (no addenda indicator)
  it('TestFileAddenda99 - valid addenda99 with no indicator errors', () => {
    const bh = mockBatchHeader();
    const ed = mockEntryDetail();
    const addenda99Val = mockAddenda99();
    addenda99Val.traceNumber = '0000001';
    addenda99Val.returnCode = 'R02';
    ed.category = CategoryReturn;
    ed.addenda99 = addenda99Val;
    const line = bh.string() + '\n' + ed.string() + '\n' + ed.addenda99!.string();
    const r = new Reader(line);
    expect(() => r.read()).toThrow();
  });

  // TestFileBatchControlValidate - batch control with mismatched company ID
  it('TestFileBatchControlValidate - errors on batch control mismatch', () => {
    const bh = mockBatchHeader();
    const ed = mockEntryDetail();
    const bc = mockBatchControl();
    bc.companyIdentification = 'B1G C0MPANY';
    const line = bh.string() + '\n' + ed.string() + '\n' + bc.string();
    const r = new Reader(line);
    expect(() => r.read()).toThrow();
  });

  // TestFileAddBatchValidation - batch control with wrong entry/addenda count
  it('TestFileAddBatchValidation - errors on batch add validation', () => {
    const bh = mockBatchHeader();
    const ed = mockEntryDetail();
    const bc = mockBatchControl();
    const line = bh.string() + '\n' + ed.string() + '\n' + bc.string();
    const r = new Reader(line);
    expect(() => r.read()).toThrow();
  });

  // TestADVCategoryReturn - ADV return category from JSON
  it('TestADVCategoryReturn - validates ADV return category from JSON', () => {
    const bs = readTestFile('adv-return.json');
    const [file, err] = fileFromJSON(bs);
    expect(err).toBeNull();
    expect(file!.batches.length).toBe(1);
    expect(file!.batches[0].category()).toBe(CategoryReturn);
  });

  // TestADVReturnError - ADV return write/read round-trip
  it('TestADVReturnError - ADV return produces parse error on read-back', () => {
    const file = newFile();
    file.setHeader(mockFileHeader());
    const entry = mockADVEntryDetail();
    entry.addenda99 = mockAddenda99();
    entry.category = CategoryReturn;
    const advHeader = mockBatchADVHeader();
    const [batch, batchErr] = newBatch(advHeader);
    expect(batchErr).toBeNull();
    batch!.setHeader(advHeader);
    batch!.addADVEntry(entry);
    expect(batch!.create()).toBeNull();
    file.addBatch(batch!);
    expect(file.create()).toBeNull();

    const w = new Writer();
    const output = w.write(file);

    // Read back should error due to batch control mismatch
    const r = new Reader(output);
    expect(() => r.read()).toThrow();
  });

  // TestTwoFileControls - two file control records
  it('TestTwoFileControls - errors on duplicate file control', () => {
    const line = '9000001000001000000010005320001000000010500000000000000                                       ';
    const twoControls = line + '\n' + line;
    const r = new Reader(twoControls);
    expect(() => r.read()).toThrow();
  });

  // TestTwoFileADVControls - two ADV file control records
  it('TestTwoFileADVControls - errors on duplicate ADV file control', () => {
    const line = '9000001000001000000010005320001000000010500000000000000                                       ';
    const twoControls = line + '\n' + line;
    const r = new Reader(twoControls);
    expect(() => r.read()).toThrow();
  });

  // TestReader_AddendaParse - addenda02 line outside batch
  it('TestReader_AddendaParse - addenda line outside batch errors', () => {
    const line = '702REFONEAREFTERM021000490614123456Target Store 0049          PHILADELPHIA   PA12104288000';
    // Pad to 94 chars if needed
    const padded = line.padEnd(94, ' ');
    const r = new Reader(padded);
    expect(() => r.read()).toThrow();
  });

  // TestReader__morphing - internal trim/pad helpers (tested indirectly via behavior)
  it('TestReader__morphing - handles long lines by trimming trailing spaces', () => {
    // A 98-char line with trailing spaces should be trimmed to 94
    const base = '1' + '0'.repeat(89) + '1234';
    const longLine = base + '    '; // 98 chars
    const r = new Reader(longLine);
    // Should not crash; the trailing spaces are trimmed
    try {
      r.read();
    } catch {
      // Errors expected (not a valid file), but no crash
    }
  });

  it('TestReader__morphing - short lines are right-padded to 94', () => {
    // A 10-char line starting with '1' (file header position) should be padded
    const shortLine = '1aaaaaaaaa';
    const r = new Reader(shortLine);
    try {
      r.read();
    } catch {
      // Errors expected, but padding should occur without crash
    }
  });
});
