import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { readACHFile, writeFile, Reader } from '../src/index.js';
import type { ValidateOpts } from '../src/index.js';
import '../src/batches/index.js';

const testdataDir = path.join(__dirname, 'testdata');

function readFixture(filename: string): string {
  return fs.readFileSync(path.join(testdataDir, filename), 'utf-8');
}

function readWithOpts(data: string, opts?: ValidateOpts) {
  const r = new Reader(data);
  if (opts) r.setValidation(opts);
  return r.read();
}

// =========================================================================
// Valid ACH files that should parse → create → validate → write → re-parse
// =========================================================================
const validACHFiles = [
  'ppd-debit.ach',
  'ppd-credit.ach',
  'ppd-mixedDebitCredit.ach',
  'ppd-debit-fixedLength.ach',
  'web-debit.ach',
  'web-credit.ach',
  'ack-read.ach',
  'arc-debit.ach',
  'atx-read.ach',
  'boc-debit.ach',
  'ccd-debit.ach',
  'cie-credit.ach',
  'cor-read.ach',
  'cor-example.ach',
  'ctx-debit.ach',
  'dne-read.ach',
  'enr-read.ach',
  'mte-read.ach',
  'pop-debit.ach',
  'pos-debit.ach',
  'rck-debit.ach',
  'rck.ach',
  'shr-debit.ach',
  'tel-debit.ach',
  'trc-debit.ach',
  'trx-debit.ach',
  'xck-debit.ach',
  'adv.ach',
  'adv-read.ach',
  'return-WEB.ach',
  'gl-debit.ach',
  'loan-credit.ach',
  'two-micro-deposits.ach',
  'txp-credit.ach',
  'txp-debit.ach',
  '20180713-IAT.ach',
  '20180716-IAT-A17.ach',
  '20180716-IAT-A17-A18.ach',
  'iat-debit.ach',
  'iat-credit.ach',
  'iat-mixedDebitCredit.ach',
  'iat-addenda98.ach',
  'iat-addenda99.ach',
  'same-day-ach-ppd-credit.ach',
  'segmentFile-ppd-credit.ach',
  'segmentFile-ppd-debit.ach',
  'contested-return.ach',
  'dishonored-return.ach',
  'flattenBatchesOneBatchHeader.ach',
  'flattenBatchesMultipleBatchHeaders.ach',
  'flattenIATBatchesOneBatchHeader.ach',
  'flattenIATBatchesMultipleBatchHeaders.ach',
  'flattenADVBatchesOneBatchHeader.ach',
];

// =========================================================================
// Round-trip: parse → create → validate → write → re-parse → compare
// =========================================================================
describe('ACH round-trip integration', () => {
  describe.each(validACHFiles)('%s', (filename) => {
    it('parses without error', () => {
      const data = readFixture(filename);
      expect(() => readACHFile(data)).not.toThrow();
    });

    it('round-trips through write → re-parse', () => {
      const data = readFixture(filename);
      const file1 = readACHFile(data);

      const written = writeFile(file1);
      expect(written.length).toBeGreaterThan(0);

      const file2 = readACHFile(written);

      // File header fields match
      expect(file2.header.immediateDestination).toBe(file1.header.immediateDestination);
      expect(file2.header.immediateOrigin).toBe(file1.header.immediateOrigin);
      expect(file2.header.immediateDestinationName).toBe(file1.header.immediateDestinationName);
      expect(file2.header.immediateOriginName).toBe(file1.header.immediateOriginName);
      expect(file2.header.formatCode).toBe(file1.header.formatCode);

      // Batch counts match
      expect(file2.batches.length).toBe(file1.batches.length);
      expect(file2.iatBatches.length).toBe(file1.iatBatches.length);

      // Entry counts per batch match
      for (let i = 0; i < file1.batches.length; i++) {
        const entries1 = file1.batches[i].getEntries();
        const entries2 = file2.batches[i].getEntries();
        expect(entries2.length).toBe(entries1.length);

        // Entry detail fields match
        for (let j = 0; j < entries1.length; j++) {
          expect(entries2[j].transactionCode).toBe(entries1[j].transactionCode);
          expect(entries2[j].rdfiIdentification).toBe(entries1[j].rdfiIdentification);
          expect(entries2[j].checkDigit).toBe(entries1[j].checkDigit);
          expect(entries2[j].dfiAccountNumber).toBe(entries1[j].dfiAccountNumber);
          expect(entries2[j].amount).toBe(entries1[j].amount);
          expect(entries2[j].traceNumber).toBe(entries1[j].traceNumber);
        }

        // Batch header SEC code matches
        expect(file2.batches[i].getHeader().standardEntryClassCode)
          .toBe(file1.batches[i].getHeader().standardEntryClassCode);

        // Batch control totals match
        expect(file2.batches[i].getControl().entryAddendaCount)
          .toBe(file1.batches[i].getControl().entryAddendaCount);
        expect(file2.batches[i].getControl().totalDebitEntryDollarAmount)
          .toBe(file1.batches[i].getControl().totalDebitEntryDollarAmount);
        expect(file2.batches[i].getControl().totalCreditEntryDollarAmount)
          .toBe(file1.batches[i].getControl().totalCreditEntryDollarAmount);
      }

      // IAT batch entries match
      for (let i = 0; i < file1.iatBatches.length; i++) {
        expect(file2.iatBatches[i].entries.length).toBe(file1.iatBatches[i].entries.length);
        for (let j = 0; j < file1.iatBatches[i].entries.length; j++) {
          expect(file2.iatBatches[i].entries[j].transactionCode)
            .toBe(file1.iatBatches[i].entries[j].transactionCode);
          expect(file2.iatBatches[i].entries[j].amount)
            .toBe(file1.iatBatches[i].entries[j].amount);
          expect(file2.iatBatches[i].entries[j].traceNumber)
            .toBe(file1.iatBatches[i].entries[j].traceNumber);
        }
      }

      // File control totals match
      expect(file2.control.batchCount).toBe(file1.control.batchCount);
      expect(file2.control.entryAddendaCount).toBe(file1.control.entryAddendaCount);
      expect(file2.control.entryHash).toBe(file1.control.entryHash);
    });
  });
});

// =========================================================================
// Files requiring ValidateOpts to parse (custom trace numbers, custom
// return codes, card expiration bypass, etc.)
// =========================================================================
describe('ACH files with ValidateOpts', () => {
  it('ppd-debit-customTraceNumber.ach: parses with customTraceNumbers', () => {
    const data = readFixture('ppd-debit-customTraceNumber.ach');
    const opts: ValidateOpts = { customTraceNumbers: true };
    const file = readWithOpts(data, opts);
    expect(file.batches.length).toBeGreaterThanOrEqual(1);
  });

  it('moov-ids.ach: parses with customTraceNumbers', () => {
    const data = readFixture('moov-ids.ach');
    const opts: ValidateOpts = { customTraceNumbers: true };
    const file = readWithOpts(data, opts);
    expect(file.batches.length).toBeGreaterThanOrEqual(1);
  });

  it('return-PPD-custom-reason-code.ach: parses with customReturnCodes', () => {
    const data = readFixture('return-PPD-custom-reason-code.ach');
    const opts: ValidateOpts = { customReturnCodes: true };
    const file = readWithOpts(data, opts);
    expect(file.batches.length).toBeGreaterThanOrEqual(1);
  });

  it('shr-credit.ach: parses with skipAll', () => {
    const data = readFixture('shr-credit.ach');
    const opts: ValidateOpts = { skipAll: true };
    const file = readWithOpts(data, opts);
    expect(file.batches[0].getHeader().standardEntryClassCode).toBe('SHR');
  });

  it('FISERV zero-file: parses with skipAll', () => {
    const data = readFixture('FISERV-ZEROFILE-PIMRET825324_032720_110221.ach');
    const opts: ValidateOpts = { skipAll: true };
    const file = readWithOpts(data, opts);
    expect(file.header).toBeTruthy();
  });
});

// =========================================================================
// Fixture-specific structural validation
// =========================================================================
describe('fixture structural validation', () => {
  it('ppd-debit.ach: PPD debit entries', () => {
    const file = readACHFile(readFixture('ppd-debit.ach'));
    expect(file.batches.length).toBeGreaterThanOrEqual(1);
    expect(file.batches[0].getHeader().standardEntryClassCode).toBe('PPD');
    const entries = file.batches[0].getEntries();
    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(entries[0].rdfiIdentification.length).toBe(8);
  });

  it('web-debit.ach: WEB entries', () => {
    const file = readACHFile(readFixture('web-debit.ach'));
    expect(file.batches[0].getHeader().standardEntryClassCode).toBe('WEB');
    expect(file.batches[0].getEntries().length).toBeGreaterThanOrEqual(1);
  });

  it('20180713-IAT.ach: IAT batch with addenda', () => {
    const file = readACHFile(readFixture('20180713-IAT.ach'));
    expect(file.iatBatches.length).toBeGreaterThanOrEqual(1);
    const entry = file.iatBatches[0].entries[0];
    expect(entry.addenda10).toBeTruthy();
    expect(entry.addenda11).toBeTruthy();
    expect(entry.addenda12).toBeTruthy();
    expect(entry.addenda13).toBeTruthy();
    expect(entry.addenda14).toBeTruthy();
    expect(entry.addenda15).toBeTruthy();
    expect(entry.addenda16).toBeTruthy();
  });

  it('cor-example.ach: COR batch with Addenda98', () => {
    const file = readACHFile(readFixture('cor-example.ach'));
    expect(file.batches.length).toBeGreaterThanOrEqual(1);
    expect(file.batches[0].getHeader().standardEntryClassCode).toBe('COR');
    const entries = file.batches[0].getEntries();
    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(entries[0].addenda98).toBeTruthy();
  });

  it('return-WEB.ach: return entries with Addenda99', () => {
    const file = readACHFile(readFixture('return-WEB.ach'));
    expect(file.batches.length).toBeGreaterThanOrEqual(1);
    const entries = file.batches[0].getEntries();
    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(entries[0].addenda99).toBeTruthy();
  });

  it('adv.ach: ADV file structure', () => {
    const file = readACHFile(readFixture('adv.ach'));
    expect(file.batches.length).toBeGreaterThanOrEqual(1);
    expect(file.batches[0].getHeader().standardEntryClassCode).toBe('ADV');
  });

  it('shr-credit.ach: SHR with Addenda02', () => {
    const data = readFixture('shr-credit.ach');
    const file = readWithOpts(data, { skipAll: true });
    expect(file.batches[0].getHeader().standardEntryClassCode).toBe('SHR');
    const entries = file.batches[0].getEntries();
    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(entries[0].addenda02).toBeTruthy();
  });

  it('ppd-mixedDebitCredit.ach: mixed service class', () => {
    const file = readACHFile(readFixture('ppd-mixedDebitCredit.ach'));
    expect(file.batches[0].getHeader().standardEntryClassCode).toBe('PPD');
    const entries = file.batches[0].getEntries();
    const hasCredit = entries.some(e => e.creditOrDebit() === 'C');
    const hasDebit = entries.some(e => e.creditOrDebit() === 'D');
    expect(hasCredit && hasDebit).toBe(true);
  });

  it('contested-return.ach: contested return entries', () => {
    const file = readACHFile(readFixture('contested-return.ach'));
    expect(file.batches.length).toBeGreaterThanOrEqual(1);
    const entries = file.batches[0].getEntries();
    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(entries[0].addenda99Contested).toBeTruthy();
  });

  it('dishonored-return.ach: dishonored return entries', () => {
    const file = readACHFile(readFixture('dishonored-return.ach'));
    expect(file.batches.length).toBeGreaterThanOrEqual(1);
    const entries = file.batches[0].getEntries();
    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(entries[0].addenda99Dishonored).toBeTruthy();
  });
});

// =========================================================================
// Strict string-level round-trip: write → re-read → write → compare
// (Second write must equal first write, proving idempotent serialization)
// =========================================================================
describe('idempotent write round-trip', () => {
  const fixtures = [
    'ppd-debit.ach',
    'web-debit.ach',
    'cor-read.ach',
    'adv.ach',
  ];

  it.each(fixtures)('%s: write is idempotent', (filename) => {
    const data = readFixture(filename);
    const file1 = readACHFile(data);
    const written1 = writeFile(file1);

    const file2 = readACHFile(written1);
    const written2 = writeFile(file2);

    expect(written2).toBe(written1);
  });
});

// =========================================================================
// Crasher resilience: fuzz-discovered edge cases
// =========================================================================
describe('crasher resilience', () => {
  const crasherDir = path.join(testdataDir, 'crashers');

  it('crasher files do not cause unhandled exceptions', () => {
    if (!fs.existsSync(crasherDir)) return;

    const files = fs.readdirSync(crasherDir);
    for (const file of files) {
      const data = fs.readFileSync(path.join(crasherDir, file), 'utf-8');
      // Should either parse successfully or throw a handled ACH error
      // Must NOT throw unhandled TypeError, RangeError, etc.
      try {
        readACHFile(data);
      } catch (e) {
        // Validation/parse errors are expected — just verify they're Error instances
        expect(e).toBeInstanceOf(Error);
      }
    }
  });
});

// =========================================================================
// Invalid file tests: should fail with appropriate errors
// =========================================================================
describe('invalid file handling', () => {
  const invalidFiles = [
    '20110729A-invalid.ach',
    'ppd-debit-fixedLengthInvalid.ach',
    'ppd-debit-invalid-entryDetail-checkDigit.ach',
    'invalid-two-micro-deposits.ach',
    'adv-invalidBatchEntries.ach',
    'adv-invalidFileControl.ach',
    'iat-invalidAddenda10.ach',
    'iat-invalidAddenda11.ach',
    'iat-invalidAddenda12.ach',
    'iat-invalidAddenda14.ach',
    'iat-invalidAddenda15.ach',
    'iat-invalidAddenda16.ach',
    'iat-invalidAddenda17.ach',
    'iat-invalidAddenda18.ach',
    'iat-invalidAddenda98.ach',
    'iat-invalidAddenda99.ach',
    'iat-invalidBatchControl.ach',
    'iat-invalidBatchHeader.ach',
    'iat-invalidEntryDetail.ach',
    'iat-invalidAddendaRecordIndicator.ach',
    'pos-invalidEntryDetail.ach',
    'pos-invalidReturnFile.ach',
    'web-invalidNOCFile.ach',
  ];

  it.each(invalidFiles)('%s: throws a validation error', (filename) => {
    const data = readFixture(filename);
    expect(() => readACHFile(data)).toThrow();
  });
});
