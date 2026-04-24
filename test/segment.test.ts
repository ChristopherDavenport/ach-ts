import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  readACHFile, fileFromJSON,
  File, newFile, newFileHeader,
  newBatchHeader, newEntryDetail,
  newBatch,
  PPD,
  MixedDebitsAndCredits, CreditsOnly, DebitsOnly,
  CheckingCredit, CheckingDebit, SavingsCredit, SavingsDebit,
} from '../src/index.js';
import '../src/batches/index.js';

const testdataDir = path.join(__dirname, 'testdata');

function readFixture(filename: string): string {
  return fs.readFileSync(path.join(testdataDir, filename), 'utf-8');
}

function parseFixture(filename: string): File {
  return readACHFile(readFixture(filename));
}

describe('SegmentFile', () => {
  it('segments mixed debit/credit PPD file', () => {
    const file = parseFixture('ppd-mixedDebitCredit.ach');

    const [creditFile, debitFile, err] = file.segmentFile();
    expect(err).toBeNull();

    // Credit file should have credit entries
    expect(creditFile).not.toBeNull();
    if (creditFile && creditFile.batches.length > 0) {
      for (const batch of creditFile.batches) {
        expect(batch.getHeader().serviceClassCode).toBe(CreditsOnly);
      }
    }

    // Debit file should have debit entries
    expect(debitFile).not.toBeNull();
    if (debitFile && debitFile.batches.length > 0) {
      for (const batch of debitFile.batches) {
        expect(batch.getHeader().serviceClassCode).toBe(DebitsOnly);
      }
    }
  });

  it('credit-only file segments to credit file only', () => {
    const file = parseFixture('ppd-credit.ach');

    const [creditFile, debitFile, err] = file.segmentFile();
    expect(err).toBeNull();

    expect(creditFile).not.toBeNull();
    expect(creditFile!.batches.length).toBeGreaterThan(0);
    // Debit file should be empty
    expect(debitFile!.batches.length).toBe(0);
  });

  it('debit-only file segments to debit file only', () => {
    const file = parseFixture('ppd-debit.ach');

    const [creditFile, debitFile, err] = file.segmentFile();
    expect(err).toBeNull();

    // Credit file should be empty
    expect(creditFile!.batches.length).toBe(0);
    // Debit file should have entries
    expect(debitFile).not.toBeNull();
    expect(debitFile!.batches.length).toBeGreaterThan(0);
  });

  it('preserves total entry count after segmentation', () => {
    const file = parseFixture('ppd-mixedDebitCredit.ach');

    let originalEntries = 0;
    for (const batch of file.batches) originalEntries += batch.getEntries().length;

    const [creditFile, debitFile, err] = file.segmentFile();
    expect(err).toBeNull();

    let creditEntries = 0;
    let debitEntries = 0;
    if (creditFile) {
      for (const batch of creditFile.batches) creditEntries += batch.getEntries().length;
    }
    if (debitFile) {
      for (const batch of debitFile.batches) debitEntries += batch.getEntries().length;
    }

    expect(creditEntries + debitEntries).toBe(originalEntries);
  });

  it('segments file from JSON', () => {
    const jsonData = readFixture('ppd-mixedDebitCredit-valid.json');
    const [file, parseErr] = fileFromJSON(jsonData);
    expect(parseErr).toBeNull();
    expect(file).not.toBeNull();

    const [creditFile, debitFile, err] = file!.segmentFile();
    expect(err).toBeNull();
  });

  it('segments IAT file', () => {
    const file = parseFixture('iat-mixedDebitCredit.ach');

    const [creditFile, debitFile, err] = file.segmentFile();
    expect(err).toBeNull();

    // At least one file should have IAT batches
    const totalIAT = (creditFile?.iatBatches.length ?? 0) + (debitFile?.iatBatches.length ?? 0);
    expect(totalIAT).toBeGreaterThan(0);
  });

  it('segments dedicated credit/debit test files', () => {
    const creditFile = parseFixture('segmentFile-ppd-credit.ach');
    const [credit, debit, err1] = creditFile.segmentFile();
    expect(err1).toBeNull();
    expect(credit!.batches.length).toBeGreaterThan(0);

    const debitFileInput = parseFixture('segmentFile-ppd-debit.ach');
    const [credit2, debit2, err2] = debitFileInput.segmentFile();
    expect(err2).toBeNull();
    expect(debit2!.batches.length).toBeGreaterThan(0);
  });

  it('segmented files validate successfully', () => {
    const file = parseFixture('ppd-mixedDebitCredit.ach');

    const [creditFile, debitFile, err] = file.segmentFile();
    expect(err).toBeNull();

    if (creditFile && creditFile.batches.length > 0) {
      const valErr = creditFile.validate();
      expect(valErr).toBeNull();
    }
    if (debitFile && debitFile.batches.length > 0) {
      const valErr = debitFile.validate();
      expect(valErr).toBeNull();
    }
  });
});
