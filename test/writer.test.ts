import { describe, it, expect } from 'vitest';
import {
  File, newFile,
  FileHeader, newFileHeader, FileControl,
  BatchHeader, newBatchHeader, BatchControl,
  EntryDetail, newEntryDetail,
  ADVEntryDetail, newADVEntryDetail,
  Addenda02, newAddenda02,
  Addenda05, newAddenda05,
  Addenda98, newAddenda98,
  Addenda99, newAddenda99,
  Addenda99Dishonored, newAddenda99Dishonored,
  Batch, newBatch,
  IATBatch, IATBatchHeader, IATEntryDetail,
  Writer, writeFile, Reader, readACHFile,
  newAddenda10, newAddenda11, newAddenda12, newAddenda13,
  newAddenda14, newAddenda15, newAddenda16,
  newAddenda17, newAddenda18,
  PPD, CCD, COR, ADV, POS, WEB,
  CreditsOnly, DebitsOnly, AutomatedAccountingAdvices,
  CheckingCredit, CheckingDebit, CheckingReturnNOCCredit,
  CreditForDebitsOriginated,
  CategoryReturn, CategoryNOC, CategoryDishonoredReturn,
} from '../src/index.js';
import type { Batcher } from '../src/index.js';
import '../src/batches/index.js';

// =========================================================================
// Mock factories (matching Go test patterns)
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

function mockAddenda05(): Addenda05 {
  const a = newAddenda05();
  a.sequenceNumber = 1;
  a.paymentRelatedInformation = 'This is an Addenda05';
  a.entryDetailSequenceNumber = 1;
  return a;
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

function mockAddenda10() { const a = newAddenda10(); a.transactionTypeCode = 'ANN'; a.foreignPaymentAmount = 100000; a.foreignTraceNumber = '928383-23938'; a.name = 'BEK Enterprises'; a.entryDetailSequenceNumber = 1; return a; }
function mockAddenda11() { const a = newAddenda11(); a.originatorName = 'BEK Solutions'; a.originatorStreetAddress = '15 West Place Street'; a.entryDetailSequenceNumber = 1; return a; }
function mockAddenda12() { const a = newAddenda12(); a.originatorCityStateProvince = 'JacobsTown*PA\\'; a.originatorCountryPostalCode = 'US*19305\\'; a.entryDetailSequenceNumber = 1; return a; }
function mockAddenda13() { const a = newAddenda13(); a.odfiName = 'Wells Fargo'; a.odfiIDNumberQualifier = '01'; a.odfiIdentification = '121042882'; a.odfiBranchCountryCode = 'US'; a.entryDetailSequenceNumber = 1; return a; }
function mockAddenda14() { const a = newAddenda14(); a.rdfiName = 'Citadel Bank'; a.rdfiIDNumberQualifier = '01'; a.rdfiIdentification = '231380104'; a.rdfiBranchCountryCode = 'US'; a.entryDetailSequenceNumber = 1; return a; }
function mockAddenda15() { const a = newAddenda15(); a.receiverIDNumber = '987465493213987'; a.receiverStreetAddress = '2121 Front Street'; a.entryDetailSequenceNumber = 1; return a; }
function mockAddenda16() { const a = newAddenda16(); a.receiverCityStateProvince = 'LetterTown*AB\\'; a.receiverCountryPostalCode = 'CA*80014\\'; a.entryDetailSequenceNumber = 1; return a; }
function mockAddenda17() { const a = newAddenda17(); a.paymentRelatedInformation = 'This is an international payment'; a.sequenceNumber = 1; a.entryDetailSequenceNumber = 1; return a; }
function mockAddenda17B() { const a = newAddenda17(); a.paymentRelatedInformation = 'Transfer of money from one country to another'; a.sequenceNumber = 2; a.entryDetailSequenceNumber = 1; return a; }
function mockAddenda18() { const a = newAddenda18(); a.foreignCorrespondentBankName = 'Bank of Germany'; a.foreignCorrespondentBankIDNumberQualifier = '01'; a.foreignCorrespondentBankIDNumber = '987987987654654'; a.foreignCorrespondentBankBranchCountryCode = 'DE'; a.sequenceNumber = 1; a.entryDetailSequenceNumber = 1; return a; }
function mockAddenda18B() { const a = newAddenda18(); a.foreignCorrespondentBankName = 'Bank of Spain'; a.foreignCorrespondentBankIDNumberQualifier = '01'; a.foreignCorrespondentBankIDNumber = '987987987123123'; a.foreignCorrespondentBankBranchCountryCode = 'ES'; a.sequenceNumber = 2; a.entryDetailSequenceNumber = 1; return a; }
function mockAddenda18C() { const a = newAddenda18(); a.foreignCorrespondentBankName = 'Bank of France'; a.foreignCorrespondentBankIDNumberQualifier = '01'; a.foreignCorrespondentBankIDNumber = '456456456987987'; a.foreignCorrespondentBankBranchCountryCode = 'FR'; a.sequenceNumber = 3; a.entryDetailSequenceNumber = 1; return a; }
function mockAddenda18D() { const a = newAddenda18(); a.foreignCorrespondentBankName = 'Bank of Turkey'; a.foreignCorrespondentBankIDNumberQualifier = '01'; a.foreignCorrespondentBankIDNumber = '12312345678910'; a.foreignCorrespondentBankBranchCountryCode = 'TR'; a.sequenceNumber = 4; a.entryDetailSequenceNumber = 1; return a; }
function mockAddenda18E() { const a = newAddenda18(); a.foreignCorrespondentBankName = 'Bank of United Kingdom'; a.foreignCorrespondentBankIDNumberQualifier = '01'; a.foreignCorrespondentBankIDNumber = '1234567890123456789012345678901234'; a.foreignCorrespondentBankBranchCountryCode = 'GB'; a.sequenceNumber = 5; a.entryDetailSequenceNumber = 1; return a; }

function mockIATAddenda99() {
  const a = newAddenda99();
  a.returnCode = 'R07';
  a.originalTrace = '231380100000001';
  a.originalDFI = '12104288';
  a.addendaInformation = 'Authorization Revoked';
  a.traceNumber = '231380100000001';
  return a;
}

function mockIATAddenda98() {
  const a = newAddenda98();
  a.changeCode = 'C01';
  a.originalTrace = '231380100000001';
  a.originalDFI = '12104288';
  a.correctedData = '89722-C3';
  a.traceNumber = '121042880000001';
  return a;
}

function mockFilePPD(): File {
  const file = newFile();
  file.id = 'fileId';
  file.setHeader(mockFileHeader());
  const entry = mockEntryDetail();
  entry.addendaRecordIndicator = 1;
  entry.addAddenda05(mockAddenda05());
  const bh = mockBatchPPDHeader();
  const [batch, err] = newBatch(bh);
  if (err) throw err;
  batch!.setHeader(mockBatchHeader());
  batch!.addEntry(entry);
  const cErr = batch!.create();
  if (cErr) throw cErr;
  file.addBatch(batch!);
  const fErr = file.create();
  if (fErr) throw fErr;
  return file;
}

// =========================================================================
// Tests
// =========================================================================

describe('Writer', () => {
  it('TestPPDWrite - writes a PPD ACH file', () => {
    const file = newFile();
    file.setHeader(mockFileHeader());
    const entry = mockEntryDetail();
    entry.addendaRecordIndicator = 1;
    entry.addAddenda05(mockAddenda05());
    const bh = mockBatchPPDHeader();
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    batch!.setHeader(mockBatchHeader());
    batch!.addEntry(entry);
    const cErr = batch!.create();
    expect(cErr).toBeNull();
    file.addBatch(batch!);

    const fErr = file.create();
    expect(fErr).toBeNull();
    const vErr = file.validate();
    expect(vErr).toBeNull();

    const w = new Writer();
    const output = w.write(file);

    // Verify we output the expected number of lines (10 lines with padding)
    const lineCount = output.split('\n').filter(l => l.length > 0).length;
    expect(lineCount).toBe(10);

    // Round-trip: read back and validate
    const file2 = readACHFile(output);
    const v2 = file2.validate();
    expect(v2).toBeNull();
  });

  it('TestFileWriteErr - validates error for file write', () => {
    const file = newFile();
    file.setHeader(mockFileHeader());
    const entry = mockEntryDetail();
    entry.addendaRecordIndicator = 1;
    entry.addAddenda05(mockAddenda05());
    const bh = mockBatchPPDHeader();
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    batch!.setHeader(mockBatchHeader());
    batch!.addEntry(entry);
    const cErr = batch!.create();
    expect(cErr).toBeNull();
    file.addBatch(batch!);

    const fErr = file.create();
    expect(fErr).toBeNull();
    const vErr = file.validate();
    expect(vErr).toBeNull();

    // Corrupt the batch control
    file.batches[0].getControl().entryAddendaCount = 10;

    const w = new Writer();
    expect(() => w.write(file)).toThrow();
  });

  it('TestIATWrite - writes an IAT ACH file', () => {
    const file = newFile();
    file.setHeader(mockFileHeader());

    const iatBatch = new IATBatch(mockIATBatchHeaderFF());
    iatBatch.addEntry(mockIATEntryDetail());
    iatBatch.entries[0].addenda10 = mockAddenda10();
    iatBatch.entries[0].addenda11 = mockAddenda11();
    iatBatch.entries[0].addenda12 = mockAddenda12();
    iatBatch.entries[0].addenda13 = mockAddenda13();
    iatBatch.entries[0].addenda14 = mockAddenda14();
    iatBatch.entries[0].addenda15 = mockAddenda15();
    iatBatch.entries[0].addenda16 = mockAddenda16();
    iatBatch.entries[0].addenda17.push(mockAddenda17());
    iatBatch.entries[0].addenda17.push(mockAddenda17B());
    iatBatch.entries[0].addenda18.push(mockAddenda18());
    iatBatch.entries[0].addenda18.push(mockAddenda18B());
    iatBatch.entries[0].addenda18.push(mockAddenda18C());
    iatBatch.entries[0].addenda18.push(mockAddenda18D());
    iatBatch.entries[0].addenda18.push(mockAddenda18E());
    const cErr1 = iatBatch.create();
    expect(cErr1).toBeNull();
    file.addIATBatch(iatBatch);

    const iatBatch2 = new IATBatch(mockIATBatchHeaderFF());
    iatBatch2.addEntry(mockIATEntryDetail());
    iatBatch2.entries[0].transactionCode = CheckingDebit;
    iatBatch2.entries[0].amount = 2000;
    iatBatch2.entries[0].addenda10 = mockAddenda10();
    iatBatch2.entries[0].addenda11 = mockAddenda11();
    iatBatch2.entries[0].addenda12 = mockAddenda12();
    iatBatch2.entries[0].addenda13 = mockAddenda13();
    iatBatch2.entries[0].addenda14 = mockAddenda14();
    iatBatch2.entries[0].addenda15 = mockAddenda15();
    iatBatch2.entries[0].addenda16 = mockAddenda16();
    iatBatch2.entries[0].addenda17.push(mockAddenda17());
    iatBatch2.entries[0].addenda17.push(mockAddenda17B());
    iatBatch2.entries[0].addenda18.push(mockAddenda18());
    iatBatch2.entries[0].addenda18.push(mockAddenda18B());
    iatBatch2.entries[0].addenda18.push(mockAddenda18C());
    iatBatch2.entries[0].addenda18.push(mockAddenda18D());
    iatBatch2.entries[0].addenda18.push(mockAddenda18E());
    const cErr2 = iatBatch2.create();
    expect(cErr2).toBeNull();
    file.addIATBatch(iatBatch2);

    const fErr = file.create();
    expect(fErr).toBeNull();
    const vErr = file.validate();
    expect(vErr).toBeNull();

    const w = new Writer();
    const output = w.write(file);

    // Round-trip read back
    const file2 = readACHFile(output);
    const v2 = file2.validate();
    expect(v2).toBeNull();
  });

  it('TestPPDIATWrite - writes PPD and IAT batches', () => {
    const file = newFile();
    file.setHeader(mockFileHeader());

    // PPD batch
    const entry = mockEntryDetail();
    entry.addendaRecordIndicator = 1;
    entry.addAddenda05(mockAddenda05());
    const bh = mockBatchPPDHeader();
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    batch!.setHeader(mockBatchHeader());
    batch!.addEntry(entry);
    const cErr = batch!.create();
    expect(cErr).toBeNull();
    file.addBatch(batch!);

    // IAT batches
    const iatBatch = new IATBatch(mockIATBatchHeaderFF());
    iatBatch.addEntry(mockIATEntryDetail());
    iatBatch.entries[0].addenda10 = mockAddenda10();
    iatBatch.entries[0].addenda11 = mockAddenda11();
    iatBatch.entries[0].addenda12 = mockAddenda12();
    iatBatch.entries[0].addenda13 = mockAddenda13();
    iatBatch.entries[0].addenda14 = mockAddenda14();
    iatBatch.entries[0].addenda15 = mockAddenda15();
    iatBatch.entries[0].addenda16 = mockAddenda16();
    iatBatch.entries[0].addenda17.push(mockAddenda17());
    iatBatch.entries[0].addenda17.push(mockAddenda17B());
    iatBatch.entries[0].addenda18.push(mockAddenda18());
    iatBatch.entries[0].addenda18.push(mockAddenda18B());
    iatBatch.entries[0].addenda18.push(mockAddenda18C());
    iatBatch.entries[0].addenda18.push(mockAddenda18D());
    iatBatch.entries[0].addenda18.push(mockAddenda18E());
    const cErr1 = iatBatch.create();
    expect(cErr1).toBeNull();
    file.addIATBatch(iatBatch);

    const iatBatch2 = new IATBatch(mockIATBatchHeaderFF());
    iatBatch2.addEntry(mockIATEntryDetail());
    iatBatch2.entries[0].transactionCode = CheckingDebit;
    iatBatch2.entries[0].amount = 2000;
    iatBatch2.entries[0].addenda10 = mockAddenda10();
    iatBatch2.entries[0].addenda11 = mockAddenda11();
    iatBatch2.entries[0].addenda12 = mockAddenda12();
    iatBatch2.entries[0].addenda13 = mockAddenda13();
    iatBatch2.entries[0].addenda14 = mockAddenda14();
    iatBatch2.entries[0].addenda15 = mockAddenda15();
    iatBatch2.entries[0].addenda16 = mockAddenda16();
    iatBatch2.entries[0].addenda17.push(mockAddenda17());
    iatBatch2.entries[0].addenda17.push(mockAddenda17B());
    iatBatch2.entries[0].addenda18.push(mockAddenda18());
    iatBatch2.entries[0].addenda18.push(mockAddenda18B());
    iatBatch2.entries[0].addenda18.push(mockAddenda18C());
    iatBatch2.entries[0].addenda18.push(mockAddenda18D());
    iatBatch2.entries[0].addenda18.push(mockAddenda18E());
    const cErr2 = iatBatch2.create();
    expect(cErr2).toBeNull();
    file.addIATBatch(iatBatch2);

    const fErr = file.create();
    expect(fErr).toBeNull();
    const vErr = file.validate();
    expect(vErr).toBeNull();

    const w = new Writer();
    const output = w.write(file);

    // Round-trip read back
    const file2 = readACHFile(output);
    const v2 = file2.validate();
    expect(v2).toBeNull();
  });

  it('TestIATReturn - writes IAT ACH Return file', () => {
    const file = newFile();
    file.setHeader(mockFileHeader());
    const iatBatch = new IATBatch(mockIATBatchHeaderFF());
    iatBatch.addEntry(mockIATEntryDetail());
    iatBatch.entries[0].addenda10 = mockAddenda10();
    iatBatch.entries[0].addenda11 = mockAddenda11();
    iatBatch.entries[0].addenda12 = mockAddenda12();
    iatBatch.entries[0].addenda13 = mockAddenda13();
    iatBatch.entries[0].addenda14 = mockAddenda14();
    iatBatch.entries[0].addenda15 = mockAddenda15();
    iatBatch.entries[0].addenda16 = mockAddenda16();
    iatBatch.entries[0].addenda99 = mockIATAddenda99();
    iatBatch.entries[0].category = CategoryReturn;
    const cErr = iatBatch.create();
    expect(cErr).toBeNull();
    file.addIATBatch(iatBatch);

    const fErr = file.create();
    expect(fErr).toBeNull();
    const vErr = file.validate();
    expect(vErr).toBeNull();

    const w = new Writer();
    const output = w.write(file);

    const file2 = readACHFile(output);
    const v2 = file2.validate();
    expect(v2).toBeNull();
  });

  it('TestIATNOC - writes and reads IAT ACH NOC file', () => {
    const file = newFile();
    file.setHeader(mockFileHeader());
    const bh = mockIATBatchHeaderFF();
    bh.iatIndicator = 'IATCOR';
    bh.standardEntryClassCode = 'COR';
    const iatBatch = new IATBatch(bh);
    iatBatch.addEntry(mockIATEntryDetail());
    iatBatch.entries[0].transactionCode = CheckingReturnNOCCredit;
    iatBatch.entries[0].addenda10 = mockAddenda10();
    iatBatch.entries[0].addenda11 = mockAddenda11();
    iatBatch.entries[0].addenda12 = mockAddenda12();
    iatBatch.entries[0].addenda13 = mockAddenda13();
    iatBatch.entries[0].addenda14 = mockAddenda14();
    iatBatch.entries[0].addenda15 = mockAddenda15();
    iatBatch.entries[0].addenda16 = mockAddenda16();
    iatBatch.entries[0].addenda98 = mockIATAddenda98();
    iatBatch.entries[0].category = CategoryNOC;
    const cErr = iatBatch.create();
    expect(cErr).toBeNull();
    file.addIATBatch(iatBatch);

    const fErr = file.create();
    expect(fErr).toBeNull();
    const vErr = file.validate();
    expect(vErr).toBeNull();

    const w = new Writer();
    const output = w.write(file);

    const file2 = readACHFile(output);
    const v2 = file2.validate();
    expect(v2).toBeNull();
  });

  it('TestADVWrite - writes an ADV ACH file', () => {
    const file = newFile();
    file.setHeader(mockFileHeader());
    const entry = mockADVEntryDetail();
    entry.addendaRecordIndicator = 0;
    const advHeader = mockBatchADVHeader();
    const [batch, err] = newBatch(advHeader);
    expect(err).toBeNull();
    batch!.setHeader(advHeader);
    batch!.addADVEntry(entry);
    const cErr = batch!.create();
    expect(cErr).toBeNull();
    file.addBatch(batch!);

    const fErr = file.create();
    expect(fErr).toBeNull();
    const vErr = file.validate();
    expect(vErr).toBeNull();

    const w = new Writer();
    const output = w.write(file);

    const file2 = readACHFile(output);
    const v2 = file2.validate();
    expect(v2).toBeNull();
  });

  it('TestPOSWrite - writes a POS ACH file', () => {
    const file = newFile();
    file.setHeader(mockFileHeader());
    const entry = mockPOSEntryDetail();
    entry.addendaRecordIndicator = 1;
    entry.addenda02 = mockAddenda02();
    const posHeader = mockBatchPOSHeader();
    const [batch, err] = newBatch(posHeader);
    expect(err).toBeNull();
    batch!.setHeader(posHeader);
    batch!.addEntry(entry);
    const cErr = batch!.create();
    expect(cErr).toBeNull();
    file.addBatch(batch!);

    const fErr = file.create();
    expect(fErr).toBeNull();
    const vErr = file.validate();
    expect(vErr).toBeNull();

    const w = new Writer();
    const output = w.write(file);

    const file2 = readACHFile(output);
    const v2 = file2.validate();
    expect(v2).toBeNull();
  });

  it('TestPOSReturnWrite - writes a POS Return ACH file', () => {
    const file = newFile();
    file.setHeader(mockFileHeader());
    const entry = mockPOSEntryDetail();
    entry.addendaRecordIndicator = 1;
    entry.addenda99 = mockAddenda99();
    entry.category = CategoryReturn;
    const posHeader = mockBatchPOSHeader();
    const [batch, err] = newBatch(posHeader);
    expect(err).toBeNull();
    batch!.setHeader(posHeader);
    batch!.addEntry(entry);
    const cErr = batch!.create();
    expect(cErr).toBeNull();
    file.addBatch(batch!);

    const fErr = file.create();
    expect(fErr).toBeNull();
    const vErr = file.validate();
    expect(vErr).toBeNull();

    const w = new Writer();
    const output = w.write(file);

    const file2 = readACHFile(output);
    const v2 = file2.validate();
    expect(v2).toBeNull();
  });

  it('TestPOSDishonoredReturnWrite - writes a POS Dishonored Return ACH file', () => {
    const file = newFile();
    file.setHeader(mockFileHeader());
    const entry = newEntryDetail();
    entry.transactionCode = CheckingDebit;
    entry.rdfiIdentification = '12104288';
    entry.checkDigit = '2';
    entry.dfiAccountNumber = '744-5678-99';
    entry.amount = 25000;
    entry.identificationNumber = '45689033';
    entry.individualName = 'Wade Arnold';
    entry.traceNumber = '231380100000001';
    entry.discretionaryData = '01';
    entry.addendaRecordIndicator = 1;
    entry.category = CategoryDishonoredReturn;
    entry.addenda99Dishonored = mockAddenda99Dishonored();

    const posHeader = newBatchHeader();
    posHeader.serviceClassCode = DebitsOnly;
    posHeader.standardEntryClassCode = POS;
    posHeader.companyName = 'Payee Name';
    posHeader.companyIdentification = '231380104';
    posHeader.companyEntryDescription = 'ACH POS';
    posHeader.odfiIdentification = '23138010';

    const [batch, err] = newBatch(posHeader);
    expect(err).toBeNull();
    batch!.setHeader(posHeader);
    batch!.addEntry(entry);
    const cErr = batch!.create();
    expect(cErr).toBeNull();
    file.addBatch(batch!);

    const fErr = file.create();
    expect(fErr).toBeNull();
    const vErr = file.validate();
    expect(vErr).toBeNull();

    const w = new Writer();
    const output = w.write(file);

    const file2 = readACHFile(output);
    const v2 = file2.validate();
    expect(v2).toBeNull();
  });

  it('TestNOCWrite - writes a COR NOC ACH file', () => {
    const file = newFile();
    file.setHeader(mockFileHeader());
    const entry = mockCOREntryDetail();
    entry.addendaRecordIndicator = 1;
    entry.addenda98 = mockAddenda98();
    entry.category = CategoryNOC;
    const corHeader = mockBatchCORHeader();
    const [batch, err] = newBatch(corHeader);
    expect(err).toBeNull();
    batch!.setHeader(corHeader);
    batch!.addEntry(entry);
    const cErr = batch!.create();
    expect(cErr).toBeNull();
    file.addBatch(batch!);

    const fErr = file.create();
    expect(fErr).toBeNull();
    const vErr = file.validate();
    expect(vErr).toBeNull();

    const w = new Writer();
    const output = w.write(file);

    const file2 = readACHFile(output);
    const v2 = file2.validate();
    expect(v2).toBeNull();
  });

  it('TestADVReturnWrite - writes an ADV Return ACH file', () => {
    const file = newFile();
    file.setHeader(mockFileHeader());
    const entry = mockADVEntryDetail();
    entry.addendaRecordIndicator = 1;
    entry.addenda99 = mockAddenda99();
    entry.category = CategoryReturn;
    const advHeader = mockBatchADVHeader();
    const [batch, err] = newBatch(advHeader);
    expect(err).toBeNull();
    batch!.setHeader(advHeader);
    batch!.addADVEntry(entry);
    const cErr = batch!.create();
    expect(cErr).toBeNull();
    file.addBatch(batch!);

    const fErr = file.create();
    expect(fErr).toBeNull();
    const vErr = file.validate();
    expect(vErr).toBeNull();

    const w = new Writer();
    const output = w.write(file);
    expect(output.length).toBeGreaterThan(0);
  });

  it('TestWriteWithCustomLineEnding - writes with CRLF', () => {
    const file = newFile();
    file.setHeader(mockFileHeader());
    const entry = mockEntryDetail();
    entry.addendaRecordIndicator = 1;
    entry.addAddenda05(mockAddenda05());
    const bh = mockBatchPPDHeader();
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    batch!.setHeader(mockBatchHeader());
    batch!.addEntry(entry);
    const cErr = batch!.create();
    expect(cErr).toBeNull();
    file.addBatch(batch!);

    const fErr = file.create();
    expect(fErr).toBeNull();
    const vErr = file.validate();
    expect(vErr).toBeNull();

    const w = new Writer({ lineEnding: '\r\n' });
    const output = w.write(file);

    // Verify the output uses CRLF
    expect(output).toContain('\r\n');

    // Round-trip read back (reader handles \r\n)
    const file2 = readACHFile(output);
    const v2 = file2.validate();
    expect(v2).toBeNull();
  });

  it('TestWriteBypassValidation - writes file with invalid data when bypass is set', () => {
    const file = mockFilePPD();
    file.header.fileCreationDate = 'abc'; // invalid date

    const w = new Writer();
    w.bypassValidation = true;
    const output = w.write(file);
    expect(output.length).toBeGreaterThan(0);
  });
});
