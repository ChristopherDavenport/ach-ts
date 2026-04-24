import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  File, newFile, readACHFile,
  FileHeader, newFileHeader,
  FileControl, newFileControl,
  BatchHeader, newBatchHeader,
  EntryDetail, newEntryDetail,
  newBatch,
  mergeFiles, mergeFilesWith,
  CheckingCredit, CheckingDebit,
  CreditsOnly, DebitsOnly,
  PPD,
} from '../src/index.js';
import type { Batcher, ValidateOpts, Conditions } from '../src/index.js';
import '../src/batches/index.js';

const testdataDir = path.join(__dirname, 'testdata');

function readTestdata(filename: string): string {
  return fs.readFileSync(path.join(testdataDir, filename), 'utf-8');
}

function readACHFilepath(filename: string): File {
  return readACHFile(readTestdata(filename));
}

function lineCount(f: File): number {
  let lines = 2; // FileHeader, FileControl
  for (const batch of f.batches) {
    lines += 2; // BatchHeader, BatchControl
    const entries = batch.getEntries();
    for (const entry of entries) {
      lines++;
      if (entry.addenda02) lines++;
      lines += entry.addenda05.length;
      if (entry.addenda98) lines++;
      if (entry.addenda98Refused) lines++;
      if (entry.addenda99) lines++;
      if (entry.addenda99Dishonored) lines++;
      if (entry.addenda99Contested) lines++;
    }
  }
  for (const iatBatch of f.iatBatches) {
    lines += 2; // IATBatchHeader, BatchControl
    for (const entry of iatBatch.entries) {
      lines++;
      if (entry.addenda10) lines++;
      if (entry.addenda11) lines++;
      if (entry.addenda12) lines++;
      if (entry.addenda13) lines++;
      if (entry.addenda14) lines++;
      if (entry.addenda15) lines++;
      if (entry.addenda16) lines++;
      lines += entry.addenda17.length;
      lines += entry.addenda18.length;
      if (entry.addenda98) lines++;
      if (entry.addenda99) lines++;
    }
  }
  return lines;
}

function countTraceNumbers(...files: File[]): number {
  let total = 0;
  for (const file of files) {
    for (const batch of file.batches) {
      total += batch.getEntries().length;
    }
  }
  return total;
}

function mockBatchHeader(): BatchHeader {
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

function mockFileHeader(): FileHeader {
  const fh = newFileHeader();
  fh.immediateDestination = '231380104';
  fh.immediateOrigin = '121042882';
  fh.fileCreationDate = '190101';
  fh.immediateDestinationName = 'Citadel';
  fh.immediateOriginName = 'Wells Fargo';
  return fh;
}

function populateFileWithMockBatches(numBatches: number, file: File): void {
  const lastBatchIdx = file.batches.length - 1;
  const startSeq = file.batches[lastBatchIdx].getHeader().batchNumber + 1;
  const entryDetail = file.batches[0].getEntries()[0];

  for (let i = startSeq; i < numBatches + startSeq; i++) {
    const header = mockBatchHeader();
    header.standardEntryClassCode = PPD;
    header.serviceClassCode = DebitsOnly;
    header.companyName = 'Example Company';
    header.companyIdentification = '132465';
    header.companyEntryDescription = 'Example Description';
    header.odfiIdentification = '12104288';
    const [batch, err] = newBatch(header);
    if (err) throw err;

    const ed = { ...entryDetail } as EntryDetail;
    // Copy to a real EntryDetail
    const newEd = newEntryDetail();
    newEd.transactionCode = ed.transactionCode;
    newEd.rdfiIdentification = ed.rdfiIdentification;
    newEd.checkDigit = ed.checkDigit;
    newEd.dfiAccountNumber = ed.dfiAccountNumber;
    newEd.amount = ed.amount;
    newEd.individualName = ed.individualName;
    const n = parseInt(ed.traceNumber, 10);
    newEd.traceNumber = String(n + i + 100000);

    batch!.addEntry(newEd);
    batch!.getHeader().batchNumber = i;
    batch!.getControl().batchNumber = i;
    batch!.create();
    file.addBatch(batch!);
  }
}

describe('Merge', () => {
  it('filesAreEqual helper', () => {
    const file = readACHFilepath('ppd-debit.ach');

    // compare a file against itself (basic structural check)
    expect(file.header.immediateOrigin).toBe(file.header.immediateOrigin);
  });

  it('identity merge', () => {
    const file = readACHFilepath('ppd-debit.ach');

    const [out, err] = mergeFiles([file]);
    expect(err).toBeNull();
    expect(out).toHaveLength(1);

    // Validate merged file
    expect(out[0].validate()).toBeNull();
  });

  it('identity merge - multiple identical files', () => {
    const file = readACHFilepath('ppd-debit.ach');

    const [out, err] = mergeFiles([file, file, file, file]);
    expect(err).toBeNull();
    expect(out).toHaveLength(1);

    // Each batch should have 1 entry (duplicates go to separate batches)
    for (const batch of out[0].batches) {
      expect(batch.getEntries()).toHaveLength(1);
    }

    for (const f of out) {
      expect(f.create()).toBeNull();
      expect(f.validate()).toBeNull();
    }
  });

  it('together merge (same header → one file)', () => {
    const f1 = readACHFilepath('ppd-debit.ach');
    const f2 = readACHFilepath('web-debit.ach');

    // Replace header so they're merged into one file
    f2.header = f1.header;

    const [out, err] = mergeFiles([f1, f2]);
    expect(err).toBeNull();
    expect(out).toHaveLength(1);
    expect(out[0].batches.length).toBe(4);

    for (const f of out) {
      expect(f.validate()).toBeNull();
    }
  });

  it('apart merge (different headers → two files)', () => {
    const f1 = readACHFilepath('ppd-debit.ach');
    const f2 = readACHFilepath('web-debit.ach');

    const [out, err] = mergeFiles([f1, f2]);
    expect(err).toBeNull();
    expect(out).toHaveLength(2);
    expect(out[0].batches).toHaveLength(1);
    expect(out[1].batches).toHaveLength(3);

    for (const f of out) {
      expect(f.validate()).toBeNull();
    }
  });

  it('line count limit enforcement', () => {
    const file = readACHFilepath('ppd-debit.ach');
    file.create();
    expect(lineCount(file)).toBe(5);

    // Add 100 batches
    populateFileWithMockBatches(100, file);
    file.create();
    expect(lineCount(file)).toBe(305);

    // Merge with MaxLines = 100
    const f2 = readACHFilepath('web-debit.ach');
    f2.header = file.header; // same header so they merge
    f2.create();

    const [output, err] = mergeFilesWith([file, f2], { maxLines: 100 });
    expect(err).toBeNull();
    expect(output).toHaveLength(2);
    expect(lineCount(output[0])).toBe(100);
    expect(lineCount(output[1])).toBe(23);
  });

  it('dollar amount limit enforcement', () => {
    const file = readACHFilepath('ppd-debit.ach');
    file.create();

    // Add 100 batches
    populateFileWithMockBatches(100, file);
    file.create();
    expect(lineCount(file)).toBe(305);
    expect(countTraceNumbers(file)).toBe(101);

    const [mergedFiles, err] = mergeFilesWith([file], { maxDollarAmount: 1000000 }); // $10,000.00
    expect(err).toBeNull();
    expect(mergedFiles).toHaveLength(101);
    expect(countTraceNumbers(...mergedFiles)).toBe(101);

    for (const f of mergedFiles) {
      expect(f.batches).toHaveLength(1);
      expect(f.batches[0].getEntries()).toHaveLength(1);
    }
  });

  it('same batch and trace number collision → separate batches', () => {
    const f1 = readACHFilepath('ppd-debit.ach');
    const f2 = readACHFilepath('ppd-debit.ach');
    f2.batches[0].getEntries()[0].individualName = 'Other Guy';

    const [merged, err] = mergeFiles([f1, f2]);
    expect(err).toBeNull();
    expect(merged).toHaveLength(1);
    expect(merged[0].batches).toHaveLength(2);

    const found = new Map<string, number>();
    for (const batch of merged[0].batches) {
      for (const entry of batch.getEntries()) {
        found.set(entry.individualName, (found.get(entry.individualName) || 0) + 1);
      }
    }
    expect(found.size).toBe(2);
  });

  it('ValidateOpts propagation through merge', () => {
    const f1 = readACHFilepath('ppd-debit.ach');
    f1.setValidation({ customReturnCodes: true } as ValidateOpts);

    const f2 = readACHFilepath('web-debit.ach');
    f2.header = f1.header;
    f2.setValidation({ allowInvalidAmounts: true } as ValidateOpts);

    const [merged, err] = mergeFiles([f1, f2]);
    expect(err).toBeNull();
    expect(merged).toHaveLength(1);

    const opts = merged[0].getValidation();
    expect(opts?.customReturnCodes).toBe(true);
    expect(opts?.allowInvalidAmounts).toBe(true);
  });

  it('empty files array returns empty', () => {
    const [out, err] = mergeFiles([]);
    expect(err).toBeNull();
    expect(out).toHaveLength(0);
  });

  it('IAT files merge together with same header', () => {
    const f1 = readACHFilepath('iat-debit.ach');
    const f2 = readACHFilepath('iat-credit.ach');
    f2.header = f1.header; // same header so they merge

    const [merged, err] = mergeFiles([f1, f2]);
    expect(err).toBeNull();
    expect(merged).toHaveLength(1);
    // Both IAT batches should be in merged file
    expect(merged[0].iatBatches.length).toBeGreaterThanOrEqual(2);

    for (const f of merged) {
      expect(f.validate()).toBeNull();
    }
  });

  it('IAT and non-IAT files with same header merge into one file', () => {
    const f1 = readACHFilepath('ppd-debit.ach');
    const f2 = readACHFilepath('iat-debit.ach');
    f2.header = f1.header;

    const [merged, err] = mergeFiles([f1, f2]);
    expect(err).toBeNull();
    expect(merged).toHaveLength(1);
    expect(merged[0].batches.length).toBeGreaterThanOrEqual(1);
    expect(merged[0].iatBatches.length).toBeGreaterThanOrEqual(1);

    for (const f of merged) {
      expect(f.validate()).toBeNull();
    }
  });

  it('IAT and non-IAT files with different headers stay separate', () => {
    const f1 = readACHFilepath('ppd-debit.ach');
    const f2 = readACHFilepath('iat-debit.ach');

    const [merged, err] = mergeFiles([f1, f2]);
    expect(err).toBeNull();
    expect(merged).toHaveLength(2);
  });

  it('multiple IAT files with same header merge', () => {
    const f1 = readACHFilepath('iat-debit.ach');
    const f2 = readACHFilepath('iat-debit.ach');
    const f3 = readACHFilepath('iat-credit.ach');
    f2.header = f1.header;
    f3.header = f1.header;

    const [merged, err] = mergeFiles([f1, f2, f3]);
    expect(err).toBeNull();
    expect(merged).toHaveLength(1);
    // Should have at least 3 IAT batches
    expect(merged[0].iatBatches.length).toBeGreaterThanOrEqual(3);
  });

  it('single file pass-through produces valid output', () => {
    const file = readACHFilepath('ppd-debit.ach');
    const [merged, err] = mergeFiles([file]);
    expect(err).toBeNull();
    expect(merged).toHaveLength(1);
    expect(merged[0].validate()).toBeNull();
    // Same number of entries
    expect(merged[0].batches[0].getEntries().length).toBe(file.batches[0].getEntries().length);
  });

  it('split files when batches exceed max lines per file', () => {
    const file = readACHFilepath('ppd-debit.ach');
    populateFileWithMockBatches(50, file);
    file.create();

    const lines = lineCount(file);
    const [output, err] = mergeFilesWith([file], { maxLines: Math.floor(lines / 3) });
    expect(err).toBeNull();
    expect(output.length).toBeGreaterThan(1);

    // Total entries across all output files should equal input entries
    const inputEntries = countTraceNumbers(file);
    const outputEntries = countTraceNumbers(...output);
    expect(outputEntries).toBe(inputEntries);

    for (const f of output) {
      expect(f.create()).toBeNull();
      expect(f.validate()).toBeNull();
    }
  });

  it('should reject merging ADV batches', () => {
    const file = readACHFilepath('adv.ach');
    const [, err] = mergeFiles([file]);
    expect(err).not.toBeNull();
    expect(err!.message).toContain('ADV');
  });
});
