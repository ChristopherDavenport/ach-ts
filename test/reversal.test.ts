import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  Reader, readACHFile,
  fileFromJSON,
  CheckingCredit, CheckingDebit,
  GLCredit, GLDebit,
  LoanCredit, LoanDebit,
} from '../src/index.js';
import '../src/batches/index.js';

const testdataDir = path.join(__dirname, 'testdata');

function readTestdata(filename: string): string {
  return fs.readFileSync(path.join(testdataDir, filename), 'utf-8');
}

describe('Reversal', () => {
  it('credit reversal (PPD credit → debit)', () => {
    const jsonData = readTestdata('ppd-valid.json');
    const [file, err] = fileFromJSON(jsonData);
    expect(err).toBeNull();
    expect(file).not.toBeNull();

    const effectiveEntryDate = new Date();
    const revErr = file!.reversal(effectiveEntryDate);
    expect(revErr).toBeNull();

    const b1 = file!.batches[0];
    expect(b1.getHeader().companyEntryDescription).toBe('REVERSAL');

    const entries = b1.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].transactionCode).toBe(CheckingDebit);
  });

  it('debit reversal (PPD debit → credit)', () => {
    const achData = readTestdata('ppd-debit.ach');
    const file = readACHFile(achData);

    const effectiveEntryDate = new Date();
    const err = file.reversal(effectiveEntryDate);
    expect(err).toBeNull();

    const b1 = file.batches[0];
    expect(b1.getHeader().companyEntryDescription).toBe('REVERSAL');

    const entries = b1.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].transactionCode).toBe(CheckingCredit);
  });

  it('GL debit reversal + double reversal', () => {
    const achData = readTestdata('gl-debit.ach');
    const file = readACHFile(achData);

    // Verify original
    let b1 = file.batches[0];
    let entries = b1.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].transactionCode).toBe(GLDebit);

    // Reverse
    const effectiveEntryDate = new Date();
    let err = file.reversal(effectiveEntryDate);
    expect(err).toBeNull();

    b1 = file.batches[0];
    expect(b1.getHeader().companyEntryDescription).toBe('REVERSAL');
    entries = b1.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].transactionCode).toBe(GLCredit);

    // Reverse the reversal
    err = file.reversal(effectiveEntryDate);
    expect(err).toBeNull();

    b1 = file.batches[0];
    expect(b1.getHeader().companyEntryDescription).toBe('REVERSAL');
    entries = b1.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].transactionCode).toBe(GLDebit);
  });

  it('loan credit reversal + double reversal', () => {
    const achData = readTestdata('loan-credit.ach');
    const file = readACHFile(achData);

    // Verify original
    let b1 = file.batches[0];
    let entries = b1.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].transactionCode).toBe(LoanCredit);

    // Reverse
    const effectiveEntryDate = new Date();
    let err = file.reversal(effectiveEntryDate);
    expect(err).toBeNull();

    b1 = file.batches[0];
    expect(b1.getHeader().companyEntryDescription).toBe('REVERSAL');
    entries = b1.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].transactionCode).toBe(LoanDebit);

    // Reverse the reversal
    err = file.reversal(effectiveEntryDate);
    expect(err).toBeNull();

    b1 = file.batches[0];
    expect(b1.getHeader().companyEntryDescription).toBe('REVERSAL');
    entries = b1.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].transactionCode).toBe(LoanCredit);
  });
});
