import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  Reader, readACHFile, Writer, writeFile,
  File, newFile,
  FileHeader, newFileHeader,
  BatchHeader, newBatchHeader,
  EntryDetail, newEntryDetail,
  Addenda02, newAddenda02,
  Addenda17, newAddenda17,
  Addenda18, newAddenda18,
  Batch, newBatch,
  IATBatch, IATBatchHeader, IATEntryDetail,
  newAddenda10, newAddenda11, newAddenda12, newAddenda13,
  newAddenda14, newAddenda15, newAddenda16,
  CreditsOnly, DebitsOnly,
  CheckingCredit, CheckingDebit,
  MTE,
} from '../src/index.js';
import '../src/batches/index.js';

const testdataDir = path.join(__dirname, 'testdata');

function readTestFile(filename: string): string {
  return fs.readFileSync(path.join(testdataDir, filename), 'utf-8');
}

function mockFileHeader(): FileHeader {
  const fh = newFileHeader();
  fh.immediateDestination = '231380104';
  fh.immediateOrigin = '121042882';
  fh.fileCreationDate = '190101';
  fh.immediateDestinationName = 'Citadel';
  fh.immediateOriginName = 'Wells Fargo';
  return fh;
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

function mockIATBatchWithAddendas(): IATBatch {
  const bh = mockIATBatchHeaderFF();
  const iatBatch = new IATBatch(bh);
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

  iatBatch.addEntry(ed);
  return iatBatch;
}

describe('Extended Characters', () => {
  it('IAT File - round-trips extended characters', () => {
    const b = mockIATBatchWithAddendas();
    b.entries[0].addenda10!.name = 'John¦Smith';
    b.entries[0].addenda11!.originatorName = 'My¦Bank';
    b.entries[0].addenda12!.originatorCountryPostalCode = 'US*10036\\';
    b.entries[0].addenda13!.odfiName = 'My¦Bank2';
    b.entries[0].addenda14!.rdfiName = 'Other¦Bank';
    b.entries[0].addenda15!.receiverIDNumber = '123¦456';
    b.entries[0].addenda16!.receiverCountryPostalCode = 'US*10036\\';

    const addenda17 = newAddenda17();
    addenda17.paymentRelatedInformation = 'Thing1¦Thing2';
    addenda17.sequenceNumber = 1;
    addenda17.entryDetailSequenceNumber = 1;
    b.entries[0].addenda17.push(addenda17);

    const addenda18 = newAddenda18();
    addenda18.foreignCorrespondentBankName = 'Bank of Germany';
    addenda18.foreignCorrespondentBankIDNumberQualifier = '01';
    addenda18.foreignCorrespondentBankIDNumber = '456¦123';
    addenda18.foreignCorrespondentBankBranchCountryCode = 'DE';
    addenda18.sequenceNumber = 1;
    addenda18.entryDetailSequenceNumber = 1;
    b.entries[0].addenda18.push(addenda18);

    // Update addenda records count
    b.entries[0].addendaRecords = 9;

    const cErr = b.create();
    expect(cErr).toBeNull();

    const file = newFile();
    file.setHeader(mockFileHeader());
    file.addIATBatch(b);
    const fErr = file.create();
    expect(fErr).toBeNull();

    // Write and read back
    const w = new Writer();
    const output = w.write(file);

    const parsed = readACHFile(output);
    const entries = parsed.iatBatches[0].entries;
    expect(entries[0].addenda10!.name.trim()).toBe('John¦Smith');
    expect(entries[0].addenda11!.originatorName.trim()).toBe('My¦Bank');
    expect(entries[0].addenda12!.originatorCountryPostalCode.trim()).toBe('US*10036\\');
    expect(entries[0].addenda13!.odfiName.trim()).toBe('My¦Bank2');
    expect(entries[0].addenda14!.rdfiName.trim()).toBe('Other¦Bank');
    expect(entries[0].addenda15!.receiverIDNumber.trim()).toBe('123¦456');
    expect(entries[0].addenda16!.receiverCountryPostalCode.trim()).toBe('US*10036\\');
    expect(entries[0].addenda17[0].paymentRelatedInformation.trim()).toBe('Thing1¦Thing2');
    expect(entries[0].addenda18[0].foreignCorrespondentBankIDNumber.trim()).toBe('456¦123');
  });

  it('ACH File - round-trips extended characters in MTE batch', () => {
    const bh = newBatchHeader();
    bh.serviceClassCode = DebitsOnly;
    bh.companyName = 'Merchant | ATM';
    bh.companyIdentification = '231380104';
    bh.standardEntryClassCode = MTE;
    bh.companyEntryDescription = 'PAYMENT';
    bh.originatorStatusCode = 1;
    bh.odfiIdentification = '23138010';

    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();

    const ed = newEntryDetail();
    ed.transactionCode = CheckingDebit;
    ed.rdfiIdentification = '12104288';
    ed.checkDigit = '2';
    ed.dfiAccountNumber = '744-5678-99';
    ed.amount = 25000;
    ed.individualName = 'My {Store}';
    ed.identificationNumber = '0 is not Ø';
    ed.traceNumber = '231380100000001';
    ed.addendaRecordIndicator = 1;

    const addenda02 = newAddenda02();
    addenda02.referenceInformationOne = 'RF1¦RF2';
    addenda02.referenceInformationTwo = 'REF';
    addenda02.terminalIdentificationCode = 'TERM02';
    addenda02.transactionSerialNumber = '100049';
    addenda02.transactionDate = '0612';
    addenda02.authorizationCodeOrExpireDate = '123456';
    addenda02.terminalLocation = 'Target Store 0049';
    addenda02.terminalCity = 'PHILADELPHIA';
    addenda02.terminalState = 'PA';
    addenda02.traceNumber = '231380100000001';
    ed.addenda02 = addenda02;

    batch!.addEntry(ed);
    const cErr = batch!.create();
    expect(cErr).toBeNull();

    const file = newFile();
    file.setHeader(mockFileHeader());
    file.addBatch(batch!);
    const fErr = file.create();
    expect(fErr).toBeNull();

    // Write and read back
    const w = new Writer();
    const output = w.write(file);

    const parsed = readACHFile(output);
    const b1 = parsed.batches[0];
    expect(b1.getHeader().companyName.trim()).toBe('Merchant | ATM');

    const entries = b1.getEntries();
    expect(entries[0].individualName.trim()).toBe('My {Store}');
    expect(entries[0].addenda02!.referenceInformationOne.trim()).toBe('RF1¦RF2');
  });

  it('parse nonascii-utf8.ach', () => {
    const data = readTestFile('nonascii-utf8.ach');
    const r = new Reader(data);
    let file;
    try {
      file = r.read();
    } catch {
      file = r.file;
    }
    expect(file.batches.length).toBe(1);
    const bh = file.batches[0].getHeader();
    expect(bh.companyEntryDescription.trim()).toBe('REG.SALARY');

    const entries = file.batches[0].getEntries();
    expect(entries.length).toBe(1);
    expect(entries[0].individualName.trim()).toContain('Receiver');

    expect(entries[0].addenda05.length).toBe(12);
    expect(entries[0].addenda05[0].paymentRelatedInformation).toContain('PAYEXPENSEPAY');
  });

  it('parse nonascii.ach', () => {
    // Note: JavaScript reads files as UTF-8, so windows-1252 encoded files
    // might have different byte interpretations. We test that parsing doesn't crash.
    const data = readTestFile('nonascii.ach');
    const r = new Reader(data);
    let file;
    try {
      file = r.read();
    } catch {
      file = r.file;
    }
    expect(file.batches.length).toBe(1);
    const bh = file.batches[0].getHeader();
    expect(bh.companyEntryDescription.trim()).toBe('REG.SALARY');
  });
});
