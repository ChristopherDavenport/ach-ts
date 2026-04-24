import { describe, it, expect } from 'vitest';
import {
  File, newFile,
  FileHeader, newFileHeader, FileControl, newFileControl,
  BatchHeader, newBatchHeader, BatchControl, newBatchControl,
  EntryDetail, newEntryDetail,
  ADVEntryDetail, newADVEntryDetail,
  ADVBatchControl, newADVBatchControl,
  ADVFileControl, newADVFileControl,
  Addenda02, newAddenda02, Addenda05, newAddenda05,
  Addenda98, newAddenda98, Addenda99, newAddenda99,
  Batch, newBatch,
  IATBatch, IATBatchHeader, IATEntryDetail,
  PPD, CCD, WEB, IAT, ADV,
  MixedDebitsAndCredits, CreditsOnly,
  AutomatedAccountingAdvices,
  CheckingCredit, CheckingDebit,
  CreditForDebitsOriginated,
  CategoryForward,
} from '../src/index.js';
import { Addenda10 } from '../src/addenda10.js';
import { Addenda11 } from '../src/addenda11.js';
import { Addenda12 } from '../src/addenda12.js';
import { Addenda13 } from '../src/addenda13.js';
import { Addenda14 } from '../src/addenda14.js';
import { Addenda15 } from '../src/addenda15.js';
import { Addenda16 } from '../src/addenda16.js';
import '../src/batches/index.js';

// =========================================================================
// Helpers
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

function mockBatchPPD(): Batch {
  const bh = mockBatchPPDHeader();
  const [batch, err] = newBatch(bh);
  if (err) throw err;
  batch!.addEntry(mockEntryDetail());
  const createErr = batch!.create();
  if (createErr) throw createErr;
  return batch as Batch;
}

function mockFilePPD(): File {
  const file = newFile();
  file.id = 'fileId';
  file.setHeader(mockFileHeader());
  file.header.id = file.id;
  file.control = newFileControl();
  file.control.id = file.id;
  file.addBatch(mockBatchPPD());
  const err = file.create();
  if (err) throw err;
  return file;
}

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
// Record-level validateAll() tests
// =========================================================================
describe('validateAll — record level', () => {
  describe('FileHeader', () => {
    it('returns empty array for valid header', () => {
      const fh = mockFileHeader();
      expect(fh.validateAll()).toEqual([]);
    });

    it('returns multiple errors for invalid header', () => {
      const fh = newFileHeader();
      // leave all fields at defaults — should trigger multiple field-inclusion errors
      const errors = fh.validateAll();
      expect(errors.length).toBeGreaterThan(1);
      // validate() should return only the first
      const single = fh.validate();
      expect(single).not.toBeNull();
      // first error from validateAll should match validate
      expect(errors[0].message).toEqual(single!.message);
    });
  });

  describe('BatchHeader', () => {
    it('returns empty array for valid header', () => {
      const bh = mockBatchPPDHeader();
      expect(bh.validateAll()).toEqual([]);
    });

    it('returns multiple errors for empty header', () => {
      const bh = newBatchHeader();
      const errors = bh.validateAll();
      expect(errors.length).toBeGreaterThan(1);
    });
  });

  describe('EntryDetail', () => {
    it('returns empty array for valid entry', () => {
      const ed = mockEntryDetail();
      expect(ed.validateAll()).toEqual([]);
    });

    it('returns multiple errors for empty entry', () => {
      const ed = newEntryDetail();
      const errors = ed.validateAll();
      expect(errors.length).toBeGreaterThan(1);
    });
  });

  describe('BatchControl', () => {
    it('returns empty array for valid control', () => {
      const batch = mockBatchPPD();
      const bc = batch.getControl();
      expect(bc.validateAll()).toEqual([]);
    });
  });

  describe('FileControl', () => {
    it('returns empty array for valid control', () => {
      const file = mockFilePPD();
      expect(file.control.validateAll()).toEqual([]);
    });
  });

  describe('Addenda05', () => {
    it('returns empty array for valid addenda', () => {
      const a = newAddenda05();
      a.typeCode = '05';
      a.paymentRelatedInformation = 'Payment info';
      a.sequenceNumber = 1;
      a.entryDetailSequenceNumber = 1;
      expect(a.validateAll()).toEqual([]);
    });

    it('returns errors for invalid addenda', () => {
      const a = newAddenda05();
      // missing required fields
      const errors = a.validateAll();
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});

// =========================================================================
// Batch-level validateAll() tests
// =========================================================================
describe('validateAll — batch level', () => {
  it('returns empty array for valid PPD batch', () => {
    const batch = mockBatchPPD();
    expect(batch.validateAll()).toEqual([]);
  });

  it('returns errors for batch with wrong SEC code', () => {
    const bh = mockBatchPPDHeader();
    bh.standardEntryClassCode = WEB; // will become BatchWEB after newBatch
    const [batch, err] = newBatch(bh);
    if (err) throw err;
    batch!.addEntry(mockEntryDetail());
    const createErr = batch!.create();
    // Manually override SEC code to cause mismatch
    batch!.getHeader().standardEntryClassCode = CCD;
    const errors = batch!.validateAll();
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.message.includes('StandardEntryClassCode'))).toBe(true);
  });

  it('returns multiple errors for invalid entries', () => {
    const bh = mockBatchPPDHeader();
    const [batch, err] = newBatch(bh);
    if (err) throw err;
    // Add entry with invalid data
    const ed = newEntryDetail();
    ed.transactionCode = CheckingCredit;
    ed.rdfiIdentification = '23138010';
    ed.checkDigit = '4';
    ed.dfiAccountNumber = '123456789';
    ed.amount = 100000000;
    ed.individualName = 'Wade Arnold';
    ed.traceNumber = '121042880000001';
    batch!.addEntry(ed);
    batch!.create();

    // Now corrupt the batch
    batch!.getHeader().serviceClassCode = 0;
    const errors = batch!.validateAll();
    expect(errors.length).toBeGreaterThan(0);
  });

  it('collects all errors instead of stopping at first', () => {
    // Create a batch with multiple problems
    const bh = mockBatchPPDHeader();
    const [batch, err] = newBatch(bh);
    if (err) throw err;
    const ed = mockEntryDetail();
    batch!.addEntry(ed);
    batch!.create();

    // Corrupt multiple fields
    batch!.getHeader().standardEntryClassCode = CCD; // wrong SEC
    batch!.getControl().entryAddendaCount = 999; // wrong count
    batch!.getControl().totalDebitEntryDollarAmount = 999; // wrong amount

    const errors = batch!.validateAll();
    // Should have at least SEC + count + amount errors
    expect(errors.length).toBeGreaterThanOrEqual(2);
  });
});

// =========================================================================
// IAT Batch validateAll() tests
// =========================================================================
describe('validateAll — IAT batch', () => {
  it('returns empty array for valid IAT batch', () => {
    const batch = mockIATBatch();
    expect(batch.validateAll()).toEqual([]);
  });

  it('returns errors for invalid IAT batch', () => {
    const bh = mockIATBatchHeader();
    const batch = new IATBatch(bh);
    const ed = mockIATEntry();
    batch.addEntry(ed);
    batch.create();

    // Corrupt
    batch.header.serviceClassCode = 0;
    const errors = batch.validateAll();
    expect(errors.length).toBeGreaterThan(0);
  });
});

// =========================================================================
// File-level validateAll() tests
// =========================================================================
describe('validateAll — file level', () => {
  it('returns empty array for valid file', () => {
    const file = mockFilePPD();
    expect(file.validateAll()).toEqual([]);
  });

  it('returns errors for file with no batches', () => {
    const file = newFile();
    file.setHeader(mockFileHeader());
    const errors = file.validateAll();
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('collects errors from header, batches, and control', () => {
    const file = mockFilePPD();
    // Corrupt header and control
    file.header.immediateDestination = '';
    file.control.batchCount = 999;

    const errors = file.validateAll();
    // Should have at least header + control errors
    expect(errors.length).toBeGreaterThanOrEqual(2);
  });

  it('validate() still returns single error', () => {
    const file = mockFilePPD();
    file.header.immediateDestination = '';
    file.control.batchCount = 999;

    const single = file.validate();
    expect(single).not.toBeNull();
    // validate returns only one
    expect(single).toBeInstanceOf(Error);
  });

  it('validateAll with skipAll returns empty', () => {
    const file = mockFilePPD();
    file.header.immediateDestination = '';
    const errors = file.validateAllWith({ skipAll: true });
    expect(errors).toEqual([]);
  });
});

// =========================================================================
// Backward compatibility: validate() unchanged
// =========================================================================
describe('backward compatibility', () => {
  it('validate() returns null for valid data', () => {
    const file = mockFilePPD();
    expect(file.validate()).toBeNull();
  });

  it('validate() returns Error for invalid data', () => {
    const fh = newFileHeader();
    expect(fh.validate()).toBeInstanceOf(Error);
  });

  it('validate() returns first error only', () => {
    const fh = newFileHeader();
    const single = fh.validate();
    const all = fh.validateAll();
    expect(single).not.toBeNull();
    expect(all.length).toBeGreaterThan(1);
    expect(single!.message).toEqual(all[0].message);
  });
});
