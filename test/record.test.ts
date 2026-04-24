import { describe, it, expect } from 'vitest';
import {
  File, newFile,
  FileHeader, newFileHeader,
  BatchHeader, newBatchHeader,
  EntryDetail, newEntryDetail,
  Addenda05, newAddenda05,
  Batch, newBatch,
  Writer,
  PPD, WEB,
  CreditsOnly,
  CheckingCredit, CheckingDebit,
} from '../src/index.js';
import '../src/batches/index.js';

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

function mockBatchWEBHeader(): BatchHeader {
  const bh = newBatchHeader();
  bh.serviceClassCode = CreditsOnly;
  bh.standardEntryClassCode = WEB;
  bh.companyName = 'Your Company, inc';
  bh.companyIdentification = '121042882';
  bh.companyEntryDescription = 'Online Order';
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

function mockWEBEntryDetail(): EntryDetail {
  const ed = newEntryDetail();
  ed.transactionCode = CheckingCredit;
  ed.rdfiIdentification = '23138010';
  ed.checkDigit = '4';
  ed.dfiAccountNumber = '123456789';
  ed.amount = 100000000;
  ed.individualName = 'Wade Arnold';
  ed.traceNumber = '121042880000001';
  ed.discretionaryData = 'S';
  return ed;
}

// =========================================================================
// Tests
// =========================================================================

describe('Record', () => {
  it('TestFileRecord - validates a file record', () => {
    const file = newFile();
    file.setHeader(mockFileHeader());
    expect(file.header.validate()).toBeNull();
    expect(file.header.immediateOriginName).toBe('Wells Fargo');
  });

  it('TestBatchRecord - validates a batch record', () => {
    const [batch, err] = newBatch(mockBatchHeader());
    expect(err).toBeNull();
    const bh = batch!.getHeader();
    expect(bh.validate()).toBeNull();
    expect(bh.companyName).toBe('ACME Corporation');
  });

  it('TestEntryDetail - validates an entry detail record', () => {
    const entry = mockEntryDetail();
    entry.transactionCode = CheckingDebit;
    expect(entry.validate()).toBeNull();
  });

  it('TestEntryDetailPaymentType - validates payment type', () => {
    const entry = mockEntryDetail();
    entry.transactionCode = CheckingDebit;
    entry.discretionaryData = 'R';
    expect(entry.validate()).toBeNull();
  });

  it('TestEntryDetailReceivingCompany - validates receiving company', () => {
    const entry = mockEntryDetail();
    entry.transactionCode = CheckingDebit;
    entry.identificationNumber = 'location #23';
    entry.individualName = 'Best Co. #23';
    expect(entry.validate()).toBeNull();
  });

  it('TestAddendaRecord - validates an addenda record', () => {
    const addenda05 = newAddenda05();
    addenda05.paymentRelatedInformation = 'Currently string needs ASC X12 Interchange Control Structures';
    addenda05.sequenceNumber = 1;
    addenda05.entryDetailSequenceNumber = 1234567;
    expect(addenda05.validate()).toBeNull();
  });

  it('TestBuildFile - builds a complete file with PPD and WEB batches', () => {
    // Create file
    const file = newFile();
    file.setHeader(mockFileHeader());

    // Create PPD batch
    const [batch1, err1] = newBatch(mockBatchHeader());
    expect(err1).toBeNull();

    const entry1 = mockEntryDetail();
    entry1.addendaRecordIndicator = 1;
    const addendaPPD = newAddenda05();
    addendaPPD.paymentRelatedInformation = 'Currently string needs ASC X12 Interchange Control Structures';
    entry1.addAddenda05(addendaPPD);
    batch1!.addEntry(entry1);
    const cErr1 = batch1!.create();
    expect(cErr1).toBeNull();
    file.addBatch(batch1!);

    // Create WEB batch
    const [batch2, err2] = newBatch(mockBatchWEBHeader());
    expect(err2).toBeNull();

    const entry2 = mockWEBEntryDetail();
    entry2.addendaRecordIndicator = 1;
    const addendaWEB = newAddenda05();
    addendaWEB.paymentRelatedInformation = 'Monthly Membership Subscription';
    entry2.addAddenda05(addendaWEB);
    batch2!.addEntry(entry2);
    const cErr2 = batch2!.create();
    expect(cErr2).toBeNull();
    file.addBatch(batch2!);

    // Build file
    const fErr = file.create();
    expect(fErr).toBeNull();

    // Write file
    const w = new Writer();
    const output = w.write(file);
    expect(output.length).toBeGreaterThan(0);

    // Verify the output has the right number of lines (padded to block of 10)
    const lineCount = output.split('\n').filter(l => l.length > 0).length;
    expect(lineCount % 10).toBe(0);
  });
});
