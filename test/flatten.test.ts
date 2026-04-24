import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  readACHFile,
  File, newFile, newFileHeader,
  newBatchHeader, newEntryDetail,
  newBatch,
  PPD, WEB,
  MixedDebitsAndCredits, CreditsOnly,
  CheckingCredit,
} from '../src/index.js';
import '../src/batches/index.js';

const testdataDir = path.join(__dirname, 'testdata');

function readFixture(filename: string): string {
  return fs.readFileSync(path.join(testdataDir, filename), 'utf-8');
}

function parseFixture(filename: string): File {
  return readACHFile(readFixture(filename));
}

/** Extract structure: array of batches, each being an array of trace numbers (or amounts for ADV). */
function getFileStructure(file: File): string[][] {
  const structure: string[][] = [];
  for (const batcher of file.batches) {
    const batch: string[] = [];
    for (const entry of batcher.getEntries()) {
      batch.push(entry.traceNumber);
    }
    for (const entry of batcher.getADVEntries()) {
      batch.push(String(entry.amount));
    }
    structure.push(batch);
  }
  for (const iatBatch of file.iatBatches) {
    const batch: string[] = [];
    for (const entry of iatBatch.entries) {
      batch.push(entry.traceNumber);
    }
    structure.push(batch);
  }
  return structure;
}

describe('FlattenBatches', () => {
  const testCases = [
    {
      label: 'Single batch',
      fixture: 'flattenBatchesOneBatchHeader.ach',
      inputStructure: [
        ['121042880000001', '121042880000002', '121042880000003'],
      ],
      flattenedStructure: [
        ['121042880000001', '121042880000002', '121042880000003'],
      ],
    },
    {
      label: 'Multiple batches (no trace collision)',
      fixture: 'flattenBatchesMultipleBatchHeaders.ach',
      inputStructure: [
        ['121042880000001', '121042880000002', '121042880000003'],
        ['121042880000004', '121042880000005', '121042880000006'],
        ['121042880000007', '121042880000008', '121042880000009'],
        ['121042880000010', '121042880000011', '121042880000012'],
      ],
      flattenedStructure: [
        ['121042880000001', '121042880000002', '121042880000003', '121042880000004', '121042880000005', '121042880000006'],
        ['121042880000007', '121042880000008', '121042880000009'],
        ['121042880000010', '121042880000011', '121042880000012'],
      ],
    },
    {
      label: 'Trace number collision',
      fixture: 'flattenBatchesTraceNumberCollision.ach',
      inputStructure: [
        ['121042880000001', '121042880000002', '121042880000022'],
        ['121042880000001', '121042880000002', '121042880000003'],
        ['121042880000004', '121042880000005', '121042880000006'],
        ['121042880000007', '121042880000008', '121042880000009'],
        ['121042880000010', '121042880000011', '121042880000012'],
      ],
      flattenedStructure: [
        ['121042880000001', '121042880000002', '121042880000004', '121042880000005', '121042880000006', '121042880000022'],
        ['121042880000001', '121042880000002', '121042880000003'],
        ['121042880000007', '121042880000008', '121042880000009'],
        ['121042880000010', '121042880000011', '121042880000012'],
      ],
    },
    {
      label: 'IAT batches',
      fixture: 'flattenIATBatchesMultipleBatchHeaders.ach',
      inputStructure: [
        ['231380100000001', '231380100000002', '231380100000003'],
        ['231380100000004', '231380100000005', '231380100000006'],
        ['231380100000007', '231380100000008', '231380100000009'],
        ['231380100000010', '231380100000011', '231380100000012'],
      ],
      flattenedStructure: [
        ['231380100000001', '231380100000002', '231380100000003', '231380100000004', '231380100000005', '231380100000006'],
        ['231380100000007', '231380100000008', '231380100000009', '231380100000010', '231380100000011', '231380100000012'],
      ],
    },
    {
      label: 'ADV batches',
      fixture: 'flattenADVBatchesMultipleBatchHeaders.ach',
      inputStructure: [
        ['50001', '50002', '50003'],
        ['50004', '50005', '50006'],
        ['50007', '50008', '50009'],
        ['50010', '50011', '50012'],
      ],
      flattenedStructure: [
        ['50001', '50002', '50003', '50004', '50005', '50006'],
        ['50007', '50008', '50009', '50010', '50011', '50012'],
      ],
    },
    {
      label: 'Micro deposits',
      fixture: 'two-micro-deposits.ach',
      inputStructure: [
        ['121042886829038', '121042886829039', '121042886829040'],
        ['121042889211556', '121042889211557', '121042889211558'],
      ],
      flattenedStructure: [
        ['121042886829038', '121042886829039', '121042886829040', '121042889211556', '121042889211557', '121042889211558'],
      ],
    },
  ];

  for (const tc of testCases) {
    it(tc.label, () => {
      const inputFile = parseFixture(tc.fixture);

      // Verify input structure
      expect(getFileStructure(inputFile)).toEqual(tc.inputStructure);

      // Flatten
      const [flattenedFile, err] = inputFile.flattenBatches();
      expect(err).toBeNull();
      expect(flattenedFile).not.toBeNull();

      // Verify flattened structure
      expect(getFileStructure(flattenedFile!)).toEqual(tc.flattenedStructure);
    });
  }

  it('single batch (one batch header)', () => {
    const inputFile = parseFixture('flattenBatchesOneBatchHeader.ach');
    const [flattenedFile, err] = inputFile.flattenBatches();
    expect(err).toBeNull();
    expect(flattenedFile).not.toBeNull();
    // Single batch should remain single
    expect(flattenedFile!.batches.length).toBe(1);
    expect(flattenedFile!.batches[0].getEntries().length).toBe(3);
  });

  it('single IAT batch (one batch header)', () => {
    const inputFile = parseFixture('flattenIATBatchesOneBatchHeader.ach');
    const [flattenedFile, err] = inputFile.flattenBatches();
    expect(err).toBeNull();
    expect(flattenedFile).not.toBeNull();
    // Single IAT batch should remain; check it exists in either batches or iatBatches
    const totalBatches = flattenedFile!.batches.length + flattenedFile!.iatBatches.length;
    expect(totalBatches).toBeGreaterThanOrEqual(1);
  });

  it('single ADV batch (one batch header)', () => {
    const inputFile = parseFixture('flattenADVBatchesOneBatchHeader.ach');
    const [flattenedFile, err] = inputFile.flattenBatches();
    expect(err).toBeNull();
    expect(flattenedFile).not.toBeNull();
    expect(flattenedFile!.batches.length).toBe(1);
  });

  it('preserves entry count after flatten', () => {
    const inputFile = parseFixture('flattenBatchesMultipleBatchHeaders.ach');
    let totalEntries = 0;
    for (const b of inputFile.batches) totalEntries += b.getEntries().length;

    const [flattenedFile, err] = inputFile.flattenBatches();
    expect(err).toBeNull();
    let flattenedEntries = 0;
    for (const b of flattenedFile!.batches) flattenedEntries += b.getEntries().length;

    expect(flattenedEntries).toBe(totalEntries);
  });

  it('preserves debit/credit totals after flatten', () => {
    const inputFile = parseFixture('flattenBatchesMultipleBatchHeaders.ach');
    const origDebits = inputFile.control.totalDebitEntryDollarAmountInFile;
    const origCredits = inputFile.control.totalCreditEntryDollarAmountInFile;

    const [flattenedFile, err] = inputFile.flattenBatches();
    expect(err).toBeNull();

    const flatFile = flattenedFile!;
    const createErr = flatFile.create();
    expect(createErr).toBeNull();

    expect(flatFile.control.totalDebitEntryDollarAmountInFile).toBe(origDebits);
    expect(flatFile.control.totalCreditEntryDollarAmountInFile).toBe(origCredits);
  });

  it('preserves ValidateOpts through flatten', () => {
    const inputFile = parseFixture('ppd-debit.ach');
    inputFile.setValidation({ skipAll: true });

    const [flattenedFile, err] = inputFile.flattenBatches();
    expect(err).toBeNull();
    expect(flattenedFile).not.toBeNull();

    const opts = flattenedFile!.getValidation();
    expect(opts).toBeDefined();
    expect(opts?.skipAll).toBe(true);
  });

  it('propagates AllowEmptyIndividualName to batches', () => {
    const file = newFile();
    const fh = newFileHeader();
    fh.immediateDestination = '231380104';
    fh.immediateOrigin = '121042882';
    fh.fileCreationDate = '190101';
    fh.immediateDestinationName = 'Citadel';
    fh.immediateOriginName = 'Wells Fargo';
    file.header = fh;

    for (let i = 0; i < 2; i++) {
      const bh = newBatchHeader();
      bh.serviceClassCode = MixedDebitsAndCredits;
      bh.companyName = 'Test Company';
      bh.companyIdentification = '1234567890';
      bh.standardEntryClassCode = WEB;
      bh.companyEntryDescription = 'Test';
      bh.odfiIdentification = '12104288';

      const [batch, err] = newBatch(bh);
      expect(err).toBeNull();

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

    const [flattenedFile, err] = file.flattenBatches();
    expect(err).toBeNull();
    expect(flattenedFile).not.toBeNull();
    expect(flattenedFile!.batches.length).toBe(1);
    expect(flattenedFile!.batches[0].getEntries().length).toBe(2);

    const opts = flattenedFile!.getValidation();
    expect(opts?.allowEmptyIndividualName).toBe(true);
  });
});
