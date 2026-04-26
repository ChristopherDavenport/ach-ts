import { describe, it, expect } from 'vitest';
import {
  File, newFile, fileFromJSON,
  FileHeader, newFileHeader,
  BatchHeader, newBatchHeader,
  EntryDetail, newEntryDetail,
  Batch, newBatch,
  IATBatch, IATBatchHeader, IATEntryDetail,
  PPD, CCD, WEB, IAT,
  MixedDebitsAndCredits, CreditsOnly, DebitsOnly,
  CheckingCredit, CheckingDebit,
  SavingsCredit,
  mergeFiles,
} from '../src/index.js';
import { splitFile } from '../src/split.js';
import type { SplitOptions, SplitConditions } from '../src/split.js';
import { Addenda10 } from '../src/addenda/addenda10.js';
import { Addenda11 } from '../src/addenda/addenda11.js';
import { Addenda12 } from '../src/addenda/addenda12.js';
import { Addenda13 } from '../src/addenda/addenda13.js';
import { Addenda14 } from '../src/addenda/addenda14.js';
import { Addenda15 } from '../src/addenda/addenda15.js';
import { Addenda16 } from '../src/addenda/addenda16.js';
// Import batch types to trigger registration
import '../src/batches/index.js';

import * as fs from 'node:fs';
import * as path from 'node:path';

const testdataDir = path.join(__dirname, 'testdata');

function readTestdata(filename: string): string {
  return fs.readFileSync(path.join(testdataDir, filename), 'utf-8');
}

// ── Helpers ─────────────────────────────────────────────────────────

function mockFileHeader(): FileHeader {
  const fh = newFileHeader();
  fh.immediateDestination = '231380104';
  fh.immediateOrigin = '121042882';
  fh.fileCreationDate = '190101';
  fh.immediateDestinationName = 'Citadel';
  fh.immediateOriginName = 'Wells Fargo';
  return fh;
}

/** Check digit map for routing numbers used in tests */
const checkDigits: Record<string, string> = {
  '07100001': '3',
  '02100002': '1',
  '03100003': '7',
  '23138010': '4',
};

function mockEntry(rdfi: string, amount: number, txCode: number, account = '123456789'): EntryDetail {
  const checkDigit = checkDigits[rdfi] ?? '0';
  const ed = newEntryDetail();
  ed.transactionCode = txCode;
  ed.rdfiIdentification = rdfi;
  ed.checkDigit = checkDigit;
  ed.dfiAccountNumber = account;
  ed.amount = amount;
  ed.individualName = 'Test Person';
  ed.traceNumber = '';
  return ed;
}

function mockBatch(sec: string, entries: EntryDetail[]): [import('../src/index.js').Batcher, Error | null] {
  const bh = newBatchHeader();
  bh.serviceClassCode = MixedDebitsAndCredits;
  bh.companyName = 'ACME CORP';
  bh.companyIdentification = '1234567890';
  bh.standardEntryClassCode = sec;
  bh.companyEntryDescription = 'PAYROLL';
  bh.originatorStatusCode = 1;
  bh.odfiIdentification = '12104288';

  const [batch, err] = newBatch(bh);
  if (err || !batch) return [null as any, err];
  for (const entry of entries) {
    batch.addEntry(entry);
  }
  const createErr = batch.create();
  if (createErr) return [null as any, createErr];
  return [batch, null];
}

function mockFile(batches: import('../src/index.js').Batcher[]): File {
  const file = newFile();
  file.setHeader(mockFileHeader());
  for (const batch of batches) {
    file.addBatch(batch);
  }
  const err = file.create();
  if (err) throw err;
  return file;
}

/** Count all entries across all batches in all files in a group. */
function countEntries(files: File[]): number {
  let count = 0;
  for (const f of files) {
    for (const b of f.batches) {
      count += b.getEntries().length;
    }
  }
  return count;
}

/** Sum all amounts across all batches in all files. */
function sumAmounts(files: File[]): number {
  let total = 0;
  for (const f of files) {
    total += f.control.totalDebitEntryDollarAmountInFile;
    total += f.control.totalCreditEntryDollarAmountInFile;
  }
  return total;
}

// ── Tests ───────────────────────────────────────────────────────────

describe('splitFile', () => {
  describe('entry-level grouping', () => {
    it('should split by routing number (on-us splitting)', () => {
      const entries = [
        mockEntry('07100001', 50000, CheckingCredit),
        mockEntry('07100001', 30000, CheckingCredit),
        mockEntry('02100002', 20000, CheckingCredit),
        mockEntry('02100002', 10000, CheckingCredit),
      ];
      const [batch, err] = mockBatch(PPD, entries);
      expect(err).toBeNull();
      const file = mockFile([batch]);

      const [result, splitErr] = splitFile(file, {
        groupEntry: (entry) => entry.rdfiIdentification,
      });

      expect(splitErr).toBeNull();
      expect(result.size).toBe(2);
      expect(result.has('07100001')).toBe(true);
      expect(result.has('02100002')).toBe(true);

      const group1 = result.get('07100001')!;
      expect(countEntries(group1)).toBe(2);
      const group2 = result.get('02100002')!;
      expect(countEntries(group2)).toBe(2);

      // Amounts should match source
      const group1Amount = sumAmounts(group1);
      const group2Amount = sumAmounts(group2);
      expect(group1Amount).toBe(80000); // 50000 + 30000
      expect(group2Amount).toBe(30000); // 20000 + 10000
    });

    it('should split by account number (extract specific account)', () => {
      const entries = [
        mockEntry('07100001', 50000, CheckingCredit, 'ACCT-001'),
        mockEntry('07100001', 30000, CheckingCredit, 'ACCT-002'),
        mockEntry('07100001', 20000, CheckingDebit, 'ACCT-001'),
      ];
      const [batch, err] = mockBatch(PPD, entries);
      expect(err).toBeNull();
      const file = mockFile([batch]);

      const [result, splitErr] = splitFile(file, {
        groupEntry: (entry) =>
          entry.dfiAccountNumber.trim() === 'ACCT-001' ? 'target' : 'remainder',
      });

      expect(splitErr).toBeNull();
      expect(result.size).toBe(2);
      expect(countEntries(result.get('target')!)).toBe(2);
      expect(countEntries(result.get('remainder')!)).toBe(1);
    });

    it('should preserve entry count when splitting', () => {
      const entries = [
        mockEntry('07100001', 10000, CheckingCredit),
        mockEntry('07100001', 20000, CheckingDebit),
        mockEntry('02100002', 30000, CheckingCredit),
        mockEntry('03100003', 40000, CheckingDebit),
      ];
      const [batch, err] = mockBatch(PPD, entries);
      expect(err).toBeNull();
      const file = mockFile([batch]);

      const [result, splitErr] = splitFile(file, {
        groupEntry: (entry) => entry.rdfiIdentification,
      });

      expect(splitErr).toBeNull();
      // Total entries across all groups should equal original
      let totalEntries = 0;
      for (const [, files] of result) {
        totalEntries += countEntries(files);
      }
      expect(totalEntries).toBe(4);
    });

    it('should handle entries from multiple batches with same SEC', () => {
      const entries1 = [
        mockEntry('07100001', 10000, CheckingCredit),
        mockEntry('02100002', 20000, CheckingCredit),
      ];
      const entries2 = [
        mockEntry('07100001', 30000, CheckingCredit),
        mockEntry('02100002', 40000, CheckingCredit),
      ];
      const [batch1, err1] = mockBatch(PPD, entries1);
      expect(err1).toBeNull();
      const [batch2, err2] = mockBatch(PPD, entries2);
      expect(err2).toBeNull();
      const file = mockFile([batch1, batch2]);

      const [result, splitErr] = splitFile(file, {
        groupEntry: (entry) => entry.rdfiIdentification,
      });

      expect(splitErr).toBeNull();
      // Entries from same routing across batches should be grouped
      expect(countEntries(result.get('07100001')!)).toBe(2);
      expect(countEntries(result.get('02100002')!)).toBe(2);
    });

    it('should keep entries in same group when all have same routing', () => {
      const entries = [
        mockEntry('07100001', 10000, CheckingCredit),
        mockEntry('07100001', 20000, CheckingDebit),
      ];
      const [batch, err] = mockBatch(PPD, entries);
      expect(err).toBeNull();
      const file = mockFile([batch]);

      const [result, splitErr] = splitFile(file, {
        groupEntry: (entry) => entry.rdfiIdentification,
      });

      expect(splitErr).toBeNull();
      expect(result.size).toBe(1);
      expect(countEntries(result.get('07100001')!)).toBe(2);
    });
  });

  describe('batch-level grouping', () => {
    it('should split by company identification', () => {
      const bh1 = newBatchHeader();
      bh1.serviceClassCode = CreditsOnly;
      bh1.companyName = 'ACME CORP';
      bh1.companyIdentification = 'COMPANY-A';
      bh1.standardEntryClassCode = PPD;
      bh1.companyEntryDescription = 'PAYROLL';
      bh1.originatorStatusCode = 1;
      bh1.odfiIdentification = '12104288';

      const bh2 = newBatchHeader();
      bh2.serviceClassCode = CreditsOnly;
      bh2.companyName = 'BETA INC';
      bh2.companyIdentification = 'COMPANY-B';
      bh2.standardEntryClassCode = PPD;
      bh2.companyEntryDescription = 'PAYROLL';
      bh2.originatorStatusCode = 1;
      bh2.odfiIdentification = '12104288';

      const [batch1, err1] = newBatch(bh1);
      expect(err1).toBeNull();
      batch1!.addEntry(mockEntry('07100001', 50000, CheckingCredit));
      expect(batch1!.create()).toBeNull();

      const [batch2, err2] = newBatch(bh2);
      expect(err2).toBeNull();
      batch2!.addEntry(mockEntry('07100001', 30000, CheckingCredit));
      expect(batch2!.create()).toBeNull();

      const file = mockFile([batch1!, batch2!]);

      const [result, splitErr] = splitFile(file, {
        groupBatch: (header) => header.companyIdentification.trim(),
      });

      expect(splitErr).toBeNull();
      expect(result.size).toBe(2);
      expect(result.has('COMPANY-A')).toBe(true);
      expect(result.has('COMPANY-B')).toBe(true);
      expect(result.get('COMPANY-A')![0].batches.length).toBe(1);
      expect(result.get('COMPANY-B')![0].batches.length).toBe(1);
    });

    it('should split by company name', () => {
      const bh1 = newBatchHeader();
      bh1.serviceClassCode = CreditsOnly;
      bh1.companyName = 'ACME CORP';
      bh1.companyIdentification = '1234567890';
      bh1.standardEntryClassCode = PPD;
      bh1.companyEntryDescription = 'PAYROLL';
      bh1.originatorStatusCode = 1;
      bh1.odfiIdentification = '12104288';

      const bh2 = newBatchHeader();
      bh2.serviceClassCode = CreditsOnly;
      bh2.companyName = 'BETA INC';
      bh2.companyIdentification = '0987654321';
      bh2.standardEntryClassCode = PPD;
      bh2.companyEntryDescription = 'PAYROLL';
      bh2.originatorStatusCode = 1;
      bh2.odfiIdentification = '12104288';

      const [batch1, err1] = newBatch(bh1);
      expect(err1).toBeNull();
      batch1!.addEntry(mockEntry('07100001', 50000, CheckingCredit));
      expect(batch1!.create()).toBeNull();

      const [batch2, err2] = newBatch(bh2);
      expect(err2).toBeNull();
      batch2!.addEntry(mockEntry('07100001', 30000, CheckingCredit));
      expect(batch2!.create()).toBeNull();

      const file = mockFile([batch1!, batch2!]);

      const [result, splitErr] = splitFile(file, {
        groupBatch: (header) => header.companyName.trim(),
      });

      expect(splitErr).toBeNull();
      expect(result.size).toBe(2);
      expect(result.has('ACME CORP')).toBe(true);
      expect(result.has('BETA INC')).toBe(true);
    });
  });

  describe('validity splitting', () => {
    it('should separate valid and invalid entries', () => {
      const validEntry = mockEntry('07100001', 50000, CheckingCredit);
      const invalidEntry = mockEntry('07100001', 30000, CheckingCredit);

      const [batch, err] = mockBatch(PPD, [validEntry, invalidEntry]);
      expect(err).toBeNull();
      const file = mockFile([batch]);

      // Invalidate after file is built so create() doesn't reject it
      file.batches[0].getEntries()[1].individualName = '';

      const [result, splitErr] = splitFile(file, {
        validateEntry: true,
      });

      expect(splitErr).toBeNull();
      expect(result.has('valid')).toBe(true);
      expect(result.has('invalid')).toBe(true);
      expect(countEntries(result.get('valid')!)).toBe(1);
      expect(countEntries(result.get('invalid')!)).toBe(1);
    });

    it('should return only valid group when all entries are valid', () => {
      const entries = [
        mockEntry('07100001', 50000, CheckingCredit),
        mockEntry('07100001', 30000, CheckingCredit),
      ];
      const [batch, err] = mockBatch(PPD, entries);
      expect(err).toBeNull();
      const file = mockFile([batch]);

      const [result, splitErr] = splitFile(file, {
        validateEntry: true,
      });

      expect(splitErr).toBeNull();
      expect(result.has('valid')).toBe(true);
      expect(result.has('invalid')).toBe(false);
      expect(countEntries(result.get('valid')!)).toBe(2);
    });

    it('should return only invalid group when all entries are invalid', () => {
      const entry1 = mockEntry('07100001', 50000, CheckingCredit);
      const entry2 = mockEntry('07100001', 30000, CheckingCredit);

      const [batch, err] = mockBatch(PPD, [entry1, entry2]);
      expect(err).toBeNull();
      const file = mockFile([batch]);

      // Invalidate after file is built
      file.batches[0].getEntries()[0].individualName = '';
      file.batches[0].getEntries()[1].individualName = '';

      const [result, splitErr] = splitFile(file, {
        validateEntry: true,
      });

      expect(splitErr).toBeNull();
      expect(result.has('valid')).toBe(false);
      expect(result.has('invalid')).toBe(true);
      expect(countEntries(result.get('invalid')!)).toBe(2);
    });

    it('should support custom entry validator', () => {
      const entries = [
        mockEntry('07100001', 50000, CheckingCredit, 'GOOD-ACCT'),
        mockEntry('07100001', 30000, CheckingCredit, 'BAD-ACCT'),
        mockEntry('07100001', 20000, CheckingCredit, 'GOOD-ACCT'),
      ];
      const [batch, err] = mockBatch(PPD, entries);
      expect(err).toBeNull();
      const file = mockFile([batch]);

      const [result, splitErr] = splitFile(file, {
        validateEntry: true,
        entryValidator: (entry) => {
          if (entry.dfiAccountNumber.trim() === 'BAD-ACCT') {
            return new Error('bad account');
          }
          return null;
        },
      });

      expect(splitErr).toBeNull();
      expect(countEntries(result.get('valid')!)).toBe(2);
      expect(countEntries(result.get('invalid')!)).toBe(1);
    });
  });

  describe('size constraints', () => {
    it('should split by maxEntries', () => {
      const entries = [
        mockEntry('07100001', 10000, CheckingCredit),
        mockEntry('07100001', 20000, CheckingCredit),
        mockEntry('07100001', 30000, CheckingCredit),
        mockEntry('07100001', 40000, CheckingCredit),
      ];
      // Create 4 separate batches (one entry each) so batch-granular splitting works
      const batches = entries.map(e => {
        const [b, err] = mockBatch(PPD, [e]);
        expect(err).toBeNull();
        return b;
      });
      const file = mockFile(batches);

      const [result, splitErr] = splitFile(file, {
        conditions: { maxEntries: 2 },
      });

      expect(splitErr).toBeNull();
      const files = result.get('default')!;
      expect(files.length).toBe(2);
      expect(countEntries([files[0]])).toBe(2);
      expect(countEntries([files[1]])).toBe(2);
    });

    it('should split by maxBatches', () => {
      const batches = [];
      for (let i = 0; i < 6; i++) {
        const [b, err] = mockBatch(PPD, [
          mockEntry('07100001', 10000, CheckingCredit),
        ]);
        expect(err).toBeNull();
        batches.push(b);
      }
      const file = mockFile(batches);

      const [result, splitErr] = splitFile(file, {
        conditions: { maxBatches: 2 },
      });

      expect(splitErr).toBeNull();
      const files = result.get('default')!;
      expect(files.length).toBe(3);
      for (const f of files) {
        expect(f.batches.length).toBeLessThanOrEqual(2);
      }
    });

    it('should split by maxDollarAmount', () => {
      // Create batches with known amounts
      const [b1, e1] = mockBatch(PPD, [mockEntry('07100001', 500000, CheckingCredit)]);
      expect(e1).toBeNull();
      const [b2, e2] = mockBatch(PPD, [mockEntry('07100001', 600000, CheckingCredit)]);
      expect(e2).toBeNull();
      const [b3, e3] = mockBatch(PPD, [mockEntry('07100001', 400000, CheckingCredit)]);
      expect(e3).toBeNull();
      const file = mockFile([b1, b2, b3]);

      const [result, splitErr] = splitFile(file, {
        conditions: { maxDollarAmount: 1000000 },
      });

      expect(splitErr).toBeNull();
      const files = result.get('default')!;
      expect(files.length).toBeGreaterThanOrEqual(2);
      // Each file should not exceed the dollar limit
      for (const f of files) {
        expect(sumAmounts([f])).toBeLessThanOrEqual(1000000);
      }
    });
  });

  describe('File.split() method', () => {
    it('should delegate to splitFile', () => {
      const entries = [
        mockEntry('07100001', 50000, CheckingCredit),
        mockEntry('02100002', 30000, CheckingCredit),
      ];
      const [batch, err] = mockBatch(PPD, entries);
      expect(err).toBeNull();
      const file = mockFile([batch]);

      const [result, splitErr] = file.split({
        groupEntry: (entry) => entry.rdfiIdentification,
      });

      expect(splitErr).toBeNull();
      expect(result.size).toBe(2);
    });
  });

  describe('data integrity', () => {
    it('should preserve total dollar amounts across split files', () => {
      const entries = [
        mockEntry('07100001', 50000, CheckingCredit),
        mockEntry('07100001', 30000, CheckingDebit),
        mockEntry('02100002', 20000, CheckingCredit),
        mockEntry('02100002', 10000, CheckingDebit),
      ];
      const [batch, err] = mockBatch(PPD, entries);
      expect(err).toBeNull();
      const file = mockFile([batch]);

      const originalTotal = file.control.totalDebitEntryDollarAmountInFile
        + file.control.totalCreditEntryDollarAmountInFile;

      const [result, splitErr] = splitFile(file, {
        groupEntry: (entry) => entry.rdfiIdentification,
      });

      expect(splitErr).toBeNull();

      let splitTotal = 0;
      for (const [, files] of result) {
        splitTotal += sumAmounts(files);
      }

      expect(splitTotal).toBe(originalTotal);
    });

    it('should produce individually valid files', () => {
      const entries = [
        mockEntry('07100001', 50000, CheckingCredit),
        mockEntry('02100002', 30000, CheckingCredit),
      ];
      const [batch, err] = mockBatch(PPD, entries);
      expect(err).toBeNull();
      const file = mockFile([batch]);

      const [result, splitErr] = splitFile(file, {
        groupEntry: (entry) => entry.rdfiIdentification,
      });

      expect(splitErr).toBeNull();

      for (const [, files] of result) {
        for (const f of files) {
          expect(f.validate()).toBeNull();
        }
      }
    });
  });

  describe('edge cases', () => {
    it('should handle file with no batches', () => {
      const file = newFile();
      file.setHeader(mockFileHeader());
      file.setValidation({ allowZeroBatches: true });
      file.create();

      const [result, splitErr] = splitFile(file, {
        groupEntry: (entry) => entry.rdfiIdentification,
      });

      expect(splitErr).toBeNull();
      expect(result.size).toBe(0);
    });

    it('should handle single entry file', () => {
      const [batch, err] = mockBatch(PPD, [
        mockEntry('07100001', 50000, CheckingCredit),
      ]);
      expect(err).toBeNull();
      const file = mockFile([batch]);

      const [result, splitErr] = splitFile(file, {
        groupEntry: (entry) => entry.rdfiIdentification,
      });

      expect(splitErr).toBeNull();
      expect(result.size).toBe(1);
      expect(countEntries(result.get('07100001')!)).toBe(1);
    });

    it('should handle no options (pass-through)', () => {
      const [batch, err] = mockBatch(PPD, [
        mockEntry('07100001', 50000, CheckingCredit),
      ]);
      expect(err).toBeNull();
      const file = mockFile([batch]);

      const [result, splitErr] = splitFile(file, {});

      expect(splitErr).toBeNull();
      expect(result.size).toBe(1);
      expect(result.get('default')![0].batches.length).toBe(1);
    });

    it('should split from JSON-loaded file', () => {
      const bs = readTestdata('ppd-valid.json');
      const [file, parseErr] = fileFromJSON(bs);
      expect(parseErr).toBeNull();

      const [result, splitErr] = splitFile(file!, {
        groupBatch: (header) => header.companyName.trim(),
      });

      expect(splitErr).toBeNull();
      expect(result.size).toBeGreaterThanOrEqual(1);
    });
  });
});
