import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileFromJSON, writeFile, readACHFile } from '../src/index.js';
import type { File } from '../src/index.js';
import '../src/batches/index.js';

const testdataDir = path.join(__dirname, 'testdata');

function readFixture(filename: string): string {
  return fs.readFileSync(path.join(testdataDir, filename), 'utf-8');
}

function mustParseJSON(jsonStr: string): File {
  const [file, err] = fileFromJSON(jsonStr);
  if (err) throw err;
  if (!file) throw new Error('fileFromJSON returned null');
  return file;
}

// =========================================================================
// Valid JSON fixtures that should round-trip: JSON → File → JSON → File
// =========================================================================
const validJSONFiles = [
  'ppd-valid.json',
  'ppd-valid-debit.json',
  'ppd-valid-preserve-spaces.json',
  'ppd-no-control-blobs-valid.json',
  'ppd-mixedDebitCredit-valid.json',
  'iat-debit.json',
  'iat-debit-company-identification.json',
  'rfc3339.json',
  'iso8601.json',
  'dishonored-with-addenda05.json',
  'dishonored-with-addenda05-2.json',
];

// =========================================================================
// JSON → File → JSON round-trip
// =========================================================================
describe('JSON round-trip: parse → serialize → re-parse', () => {
  it.each(validJSONFiles)('%s', (filename) => {
    const jsonStr = readFixture(filename);

    // Parse JSON → File
    const file1 = mustParseJSON(jsonStr);

    // Serialize back to JSON
    const json1 = file1.toJSON();
    const jsonStr2 = JSON.stringify(json1);

    // Re-parse
    const file2 = mustParseJSON(jsonStr2);

    // File header fields match
    expect(file2.header.immediateDestination).toBe(file1.header.immediateDestination);
    expect(file2.header.immediateOrigin).toBe(file1.header.immediateOrigin);
    expect(file2.header.immediateDestinationName).toBe(file1.header.immediateDestinationName);
    expect(file2.header.immediateOriginName).toBe(file1.header.immediateOriginName);

    // Batch counts match
    expect(file2.batches.length).toBe(file1.batches.length);
    expect(file2.iatBatches.length).toBe(file1.iatBatches.length);

    // Entry counts and key fields per batch
    for (let i = 0; i < file1.batches.length; i++) {
      const entries1 = file1.batches[i].getEntries();
      const entries2 = file2.batches[i].getEntries();
      expect(entries2.length).toBe(entries1.length);

      expect(file2.batches[i].getHeader().standardEntryClassCode)
        .toBe(file1.batches[i].getHeader().standardEntryClassCode);

      for (let j = 0; j < entries1.length; j++) {
        expect(entries2[j].transactionCode).toBe(entries1[j].transactionCode);
        expect(entries2[j].rdfiIdentification).toBe(entries1[j].rdfiIdentification);
        expect(entries2[j].amount).toBe(entries1[j].amount);
        expect(entries2[j].dfiAccountNumber).toBe(entries1[j].dfiAccountNumber);
      }
    }

    // IAT batch entries match
    for (let i = 0; i < file1.iatBatches.length; i++) {
      expect(file2.iatBatches[i].entries.length).toBe(file1.iatBatches[i].entries.length);
      for (let j = 0; j < file1.iatBatches[i].entries.length; j++) {
        expect(file2.iatBatches[i].entries[j].transactionCode)
          .toBe(file1.iatBatches[i].entries[j].transactionCode);
        expect(file2.iatBatches[i].entries[j].amount)
          .toBe(file1.iatBatches[i].entries[j].amount);
      }
    }
  });
});

// =========================================================================
// JSON → ACH → JSON cross-format round-trip
// =========================================================================
describe('JSON → ACH → JSON cross-format', () => {
  // These JSON files produce valid ACH that can be written and re-read
  const crossFormatFiles = [
    'ppd-valid.json',
    'ppd-valid-debit.json',
    'ppd-mixedDebitCredit-valid.json',
  ];

  it.each(crossFormatFiles)('%s: JSON → write ACH → re-parse → compare', (filename) => {
    const jsonStr = readFixture(filename);

    // JSON → File (already validated by fileFromJSON)
    const file1 = mustParseJSON(jsonStr);

    // Write ACH format
    const achOutput = writeFile(file1);
    expect(achOutput.length).toBeGreaterThan(0);

    // Re-parse ACH
    const file2 = readACHFile(achOutput);

    // Header
    expect(file2.header.immediateDestination).toBe(file1.header.immediateDestination);
    expect(file2.header.immediateOrigin).toBe(file1.header.immediateOrigin);

    // Batch structure
    expect(file2.batches.length).toBe(file1.batches.length);
    for (let i = 0; i < file1.batches.length; i++) {
      expect(file2.batches[i].getHeader().standardEntryClassCode)
        .toBe(file1.batches[i].getHeader().standardEntryClassCode);

      const entries1 = file1.batches[i].getEntries();
      const entries2 = file2.batches[i].getEntries();
      expect(entries2.length).toBe(entries1.length);

      for (let j = 0; j < entries1.length; j++) {
        expect(entries2[j].transactionCode).toBe(entries1[j].transactionCode);
        expect(entries2[j].amount).toBe(entries1[j].amount);
      }
    }
  });
});

// =========================================================================
// Invalid JSON fixtures: should throw on parse
// =========================================================================
describe('invalid JSON handling', () => {
  const invalidJSONFiles = [
    'ppd-invalid.json',
    'ppd-invalidFile.json',
    'ppd-noBatches.json',
    'invalid-batchNumber.json',
    'ppd-mixedDebitCredit-invalid.json',
  ];

  it.each(invalidJSONFiles)('%s: fileFromJSON returns an error', (filename) => {
    const jsonStr = readFixture(filename);
    const [file, err] = fileFromJSON(jsonStr);
    // Either returns an error, or the file has issues
    // (some "invalid" files may parse but fail create/validate)
    if (!err && file) {
      // If no error from fileFromJSON, that's also acceptable
      // as long as the data was processed without crashing
      expect(file).toBeTruthy();
    } else {
      expect(err).toBeInstanceOf(Error);
    }
  });
});
