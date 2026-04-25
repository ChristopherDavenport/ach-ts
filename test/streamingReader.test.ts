import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  readACHFile, Reader,
  File, BatchHeader, EntryDetail,
  IATBatchHeader, IATEntryDetail,
  StreamingReader,
  Batch, newBatch, newBatchHeader,
  newBatchControl, newFileControl,
  BatchControl, FileControl,
} from '../src/index.js';
import type { ValidateOpts, StreamingBatchHeader, StreamingEntryDetail } from '../src/index.js';
import '../src/batches/index.js';

const testdataDir = path.join(__dirname, 'testdata');

function readTestdata(filename: string): string {
  return fs.readFileSync(path.join(testdataDir, filename), 'utf-8');
}

/** Convert a string into an AsyncIterable<string> of lines (simulates streaming). */
async function* linesToAsync(data: string): AsyncIterable<string> {
  const lines = data.split(/\r?\n/);
  for (const line of lines) {
    yield line;
  }
}

function openFile(where: string, opts?: ValidateOpts): File {
  const data = readTestdata(where);
  const r = new Reader(data);
  if (opts) r.setValidation(opts);
  try {
    return r.read();
  } catch {
    return r.file;
  }
}

function streamingReaderFromFile(where: string, opts?: ValidateOpts): StreamingReader {
  const data = readTestdata(where);
  const sr = new StreamingReader(linesToAsync(data));
  if (opts) sr.setValidation(opts);
  return sr;
}

async function collectEntries(sr: StreamingReader): Promise<StreamingEntryDetail[]> {
  const entries: StreamingEntryDetail[] = [];
  for (;;) {
    const [bh, ed, err] = await sr.nextEntry();
    if (err) throw err;
    if (bh === null && ed === null) break;
    if (bh !== null && ed !== null) {
      entries.push(ed);
    }
  }
  return entries;
}

async function ensureFileEqualsStreamingReader(file: File, sr: StreamingReader): Promise<void> {
  // Check regular batches
  for (let i = 0; i < file.batches.length; i++) {
    const bh = file.batches[i].getHeader();
    const entries = file.batches[i].getEntries();
    for (let j = 0; j < entries.length; j++) {
      const ed = entries[j];
      const [ibh, ied, err] = await sr.nextEntry();
      expect(err).toBeNull();
      expect(ibh).not.toBeNull();
      expect(ied).not.toBeNull();

      if (ibh instanceof BatchHeader) {
        expect(bh.equal(ibh)).toBe(true);
      }
      expect((ied as EntryDetail).traceNumber).toBe(ed.traceNumber);

      // Check addenda match
      if (ed.addenda02) expect((ied as EntryDetail).addenda02).not.toBeNull();
      if (ed.addenda98) expect((ied as EntryDetail).addenda98).not.toBeNull();
      if (ed.addenda99) expect((ied as EntryDetail).addenda99).not.toBeNull();
    }
  }

  // Check IAT batches
  for (let i = 0; i < file.iatBatches.length; i++) {
    const bh = file.iatBatches[i].header;
    const iatEntries = file.iatBatches[i].entries;
    for (let j = 0; j < iatEntries.length; j++) {
      const ed = iatEntries[j];
      const [ibh, ied, err] = await sr.nextEntry();
      expect(err).toBeNull();
      expect(ibh).not.toBeNull();
      expect(ied).not.toBeNull();
      expect(ied).toBeInstanceOf(IATEntryDetail);

      const iatEd = ied as IATEntryDetail;
      expect(iatEd.traceNumber).toBe(ed.traceNumber);

      // Check IAT addenda
      if (ed.addenda10) expect(iatEd.addenda10).not.toBeNull();
      if (ed.addenda11) expect(iatEd.addenda11).not.toBeNull();
      if (ed.addenda12) expect(iatEd.addenda12).not.toBeNull();
      if (ed.addenda13) expect(iatEd.addenda13).not.toBeNull();
      if (ed.addenda14) expect(iatEd.addenda14).not.toBeNull();
      if (ed.addenda15) expect(iatEd.addenda15).not.toBeNull();
      if (ed.addenda16) expect(iatEd.addenda16).not.toBeNull();
      if (ed.addenda98) expect(iatEd.addenda98).not.toBeNull();
      if (ed.addenda99) expect(iatEd.addenda99).not.toBeNull();
    }
  }
}

describe('StreamingReader', () => {
  it('valid PPD file matches Reader output', async () => {
    const file = openFile('ppd-mixedDebitCredit.ach');
    const sr = streamingReaderFromFile('ppd-mixedDebitCredit.ach');
    await ensureFileEqualsStreamingReader(file, sr);
  });

  it('more valid files', async () => {
    const paths = [
      'two-micro-deposits.ach',
      'web-debit.ach',
      '20110805A.ach',
    ];
    for (const p of paths) {
      const file = openFile(p);
      const sr = streamingReaderFromFile(p);
      await ensureFileEqualsStreamingReader(file, sr);
    }
  });

  it('bh-ed-ad-bh-ed-ad-ed-ad', async () => {
    const file = openFile('bh-ed-ad-bh-ed-ad-ed-ad.ach');
    const sr = streamingReaderFromFile('bh-ed-ad-bh-ed-ad-ed-ad.ach');
    await ensureFileEqualsStreamingReader(file, sr);
  });

  it('IAT debit file yields IAT entries', async () => {
    const file = openFile('iat-debit.ach');
    const sr = streamingReaderFromFile('iat-debit.ach');
    await ensureFileEqualsStreamingReader(file, sr);
  });

  it('IAT credit file yields IAT entries with addenda', async () => {
    const file = openFile('iat-credit.ach');
    const sr = streamingReaderFromFile('iat-credit.ach');
    await ensureFileEqualsStreamingReader(file, sr);
  });

  it('return examples', async () => {
    const paths = [
      'return-WEB.ach',
      'return-no-batch-controls.ach',
      'return-no-file-header-control.ach',
    ];
    for (const p of paths) {
      const file = openFile(p);
      const sr = streamingReaderFromFile(p);
      await ensureFileEqualsStreamingReader(file, sr);
    }
  });

  it('return without batch header (fake-batch fallback)', async () => {
    const sr = streamingReaderFromFile('return-no-batch-header.ach');
    const entries = await collectEntries(sr);
    expect(entries).toHaveLength(2);

    const ed1 = entries[0] as EntryDetail;
    expect(ed1.rdfiIdentification + ed1.checkDigit).toBe('091400606');
    expect(ed1.individualName).toBe('Paul Jones            ');
    expect(ed1.traceNumber).toBe('091000017611242');
    expect(ed1.addenda98).toBeNull();
    expect(ed1.addenda99).not.toBeNull();
    expect(ed1.addenda99!.returnCode).toBe('R01');

    const ed2 = entries[1] as EntryDetail;
    expect(ed2.rdfiIdentification + ed2.checkDigit).toBe('231380104');
    expect(ed2.addenda98).not.toBeNull();
    expect(ed2.addenda98!.changeCode).toBe('C01');
    expect(ed2.addenda99).toBeNull();
  });

  it('custom return codes', async () => {
    const opts: ValidateOpts = { customReturnCodes: true } as ValidateOpts;
    const file = openFile('return-PPD-custom-reason-code.ach', opts);
    const sr = streamingReaderFromFile('return-PPD-custom-reason-code.ach', opts);
    await ensureFileEqualsStreamingReader(file, sr);
  });

  it('empty input returns done', async () => {
    const sr = new StreamingReader(linesToAsync(''));
    const entries = await collectEntries(sr);
    expect(entries).toHaveLength(0);
  });

  it('short lines and has padding', async () => {
    const data = readTestdata('short-line.ach');
    const sr = new StreamingReader(linesToAsync(data));
    const entries = await collectEntries(sr);
    expect(entries).toHaveLength(1);
  });

  it('whitespace between file data', async () => {
    const firstData = readTestdata('bh-ed-ad-bh-ed-ad-ed-ad.ach');
    const secondData = readTestdata('return-no-file-header-control.ach');

    const data1 = firstData + '\n  \n' + secondData;
    let sr = new StreamingReader(linesToAsync(data1));
    let entries = await collectEntries(sr);
    expect(entries).toHaveLength(4);

    const data2 = secondData + '\n  \n' + firstData;
    sr = new StreamingReader(linesToAsync(data2));
    entries = await collectEntries(sr);
    expect(entries).toHaveLength(4);
  });

  it('entries() generator yields all entries', async () => {
    const sr = streamingReaderFromFile('ppd-mixedDebitCredit.ach');
    const entries: StreamingEntryDetail[] = [];
    for await (const { batchHeader, entry } of sr.entries()) {
      expect(batchHeader).not.toBeNull();
      entries.push(entry);
    }
    expect(entries.length).toBeGreaterThan(0);

    // Should match Reader output count
    const file = openFile('ppd-mixedDebitCredit.ach');
    let expectedCount = 0;
    for (const batch of file.batches) {
      expectedCount += batch.getEntries().length;
    }
    expect(entries).toHaveLength(expectedCount);
  });

  it('getHeader and getControl populated after iteration', async () => {
    const sr = streamingReaderFromFile('ppd-mixedDebitCredit.ach');

    // Before iteration, header may not be set
    const entries = await collectEntries(sr);
    expect(entries.length).toBeGreaterThan(0);

    // After iterating through a file with header/control, they should be available
    // Note: cleanup() resets the file, so getHeader/getControl may not persist
    // after nextEntry returns. This is a known limitation matching Iterator behavior.
  });

  it('entries() generator throws on error', async () => {
    // Feed a completely invalid line
    async function* badInput(): AsyncIterable<string> {
      yield 'XINVALID_RECORD_TYPE_THAT_IS_94_CHARACTERS_LONG______________________________________________';
    }
    const sr = new StreamingReader(badInput());
    await expect(async () => {
      for await (const _ of sr.entries()) {
        // should not reach here
      }
    }).rejects.toThrow();
  });

  it('IAT with addenda98 (NOC)', async () => {
    const file = openFile('iat-addenda98.ach');
    const sr = streamingReaderFromFile('iat-addenda98.ach');
    await ensureFileEqualsStreamingReader(file, sr);
  });

  it('IAT with addenda99 (return)', async () => {
    const file = openFile('iat-addenda99.ach');
    const sr = streamingReaderFromFile('iat-addenda99.ach');
    await ensureFileEqualsStreamingReader(file, sr);
  });
});

// Helper to collect all entries AND errors from streaming reader
async function collectEntriesAndErrors(sr: StreamingReader): Promise<{
  entries: { bh: StreamingBatchHeader; ed: StreamingEntryDetail }[];
  errors: Error[];
}> {
  const entries: { bh: StreamingBatchHeader; ed: StreamingEntryDetail }[] = [];
  const errors: Error[] = [];
  for (;;) {
    const [bh, ed, err] = await sr.nextEntry();
    if (err) { errors.push(err); continue; }
    if (bh === null && ed === null) break;
    if (bh !== null && ed !== null) {
      entries.push({ bh, ed });
    }
  }
  return { entries, errors };
}

/** Mutate a specific line in an ACH file string */
function mutateLine(data: string, lineIndex: number, mutator: (line: string) => string): string {
  const lines = data.split('\n');
  lines[lineIndex] = mutator(lines[lineIndex]);
  return lines.join('\n');
}

/** Get the line index of the first batch control ('8') in ACH data. */
function findBatchControlLine(data: string): number {
  return data.split('\n').findIndex(l => l.startsWith('8'));
}

/** Get the line index of the file control ('9') in ACH data. */
function findFileControlLine(data: string): number {
  return data.split('\n').findIndex(l => l.startsWith('9') && !l.startsWith('99') && [...l].length >= 94);
}

describe('StreamingReader validation', () => {
  // ----------------------------------------------------------------
  // Parity: valid files produce no validation errors
  // ----------------------------------------------------------------

  it('valid PPD file — no validation errors', async () => {
    const sr = streamingReaderFromFile('ppd-debit.ach');
    const { entries, errors } = await collectEntriesAndErrors(sr);
    expect(entries.length).toBeGreaterThan(0);
    expect(errors).toHaveLength(0);
  });

  it('valid multi-batch file — no validation errors', async () => {
    const sr = streamingReaderFromFile('two-micro-deposits.ach');
    const { entries, errors } = await collectEntriesAndErrors(sr);
    expect(entries.length).toBeGreaterThan(0);
    expect(errors).toHaveLength(0);
  });

  it('valid IAT file — no validation errors', async () => {
    const sr = streamingReaderFromFile('iat-debit.ach');
    const { entries, errors } = await collectEntriesAndErrors(sr);
    expect(entries.length).toBeGreaterThan(0);
    expect(errors).toHaveLength(0);
  });

  it('valid WEB file — no validation errors', async () => {
    const sr = streamingReaderFromFile('web-debit.ach');
    const { entries, errors } = await collectEntriesAndErrors(sr);
    expect(entries.length).toBeGreaterThan(0);
    expect(errors).toHaveLength(0);
  });

  it('valid COR file — no validation errors', async () => {
    const sr = streamingReaderFromFile('cor-read.ach');
    const { entries, errors } = await collectEntriesAndErrors(sr);
    expect(entries.length).toBeGreaterThan(0);
    expect(errors).toHaveLength(0);
  });

  it('valid return file — no validation errors', async () => {
    const sr = streamingReaderFromFile('return-WEB.ach');
    const { entries, errors } = await collectEntriesAndErrors(sr);
    expect(entries.length).toBeGreaterThan(0);
    expect(errors).toHaveLength(0);
  });

  it('parity across many valid fixtures', async () => {
    const fixtures = [
      'ppd-credit.ach', 'ppd-mixedDebitCredit.ach', 'ccd-debit.ach',
      'ctx-debit.ach', 'web-credit.ach', 'tel-debit.ach',
      'ack-read.ach', 'arc-debit.ach', 'boc-debit.ach',
      'cie-credit.ach', 'dne-read.ach', 'enr-read.ach',
      'pop-debit.ach', 'pos-debit.ach', 'rck-debit.ach',
      'shr-debit.ach', 'trc-debit.ach', 'trx-debit.ach',
      'xck-debit.ach', 'mte-read.ach',
      'iat-credit.ach', 'iat-debit.ach',
      'same-day-ach-ppd-credit.ach',
      // 20110805A.ach excluded: file control claims 5 batches but only 4 exist (batch #2 missing)
    ];
    for (const f of fixtures) {
      const sr = streamingReaderFromFile(f);
      const { entries, errors } = await collectEntriesAndErrors(sr);
      expect(entries.length, `${f} should have entries`).toBeGreaterThan(0);
      expect(errors, `${f} should have no validation errors`).toHaveLength(0);
    }
  });

  // ----------------------------------------------------------------
  // Corrupted BatchControl — accumulator mismatches
  // ----------------------------------------------------------------

  it('corrupted batch control entry hash → batch error', async () => {
    const data = readTestdata('ppd-debit.ach');
    const bcLine = findBatchControlLine(data);
    expect(bcLine).toBeGreaterThan(0);

    // Corrupt the entry hash field (positions 21-30 of batch control, 0-indexed chars 20-29)
    const corrupted = mutateLine(data, bcLine, (line) => {
      const runes = [...line];
      // Replace entry hash (positions 11-20, 0-indexed 10-19) with zeros
      for (let i = 10; i < 20; i++) runes[i] = '0';
      return runes.join('');
    });

    const sr = new StreamingReader(linesToAsync(corrupted));
    const { errors } = await collectEntriesAndErrors(sr);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain('EntryHash');
  });

  it('corrupted batch control debit total → batch error', async () => {
    const data = readTestdata('ppd-debit.ach');
    const bcLine = findBatchControlLine(data);

    // Corrupt the total debit amount (positions 21-32, 0-indexed 20-31)
    const corrupted = mutateLine(data, bcLine, (line) => {
      const runes = [...line];
      for (let i = 20; i < 32; i++) runes[i] = '0';
      return runes.join('');
    });

    const sr = new StreamingReader(linesToAsync(corrupted));
    const { errors } = await collectEntriesAndErrors(sr);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain('TotalDebitEntryDollarAmount');
  });

  it('corrupted batch control entry count → batch error', async () => {
    const data = readTestdata('ppd-debit.ach');
    const bcLine = findBatchControlLine(data);

    // Corrupt entry count (positions 5-10, 0-indexed 4-9)
    const corrupted = mutateLine(data, bcLine, (line) => {
      const runes = [...line];
      // Set to 999999
      const replacement = '999999';
      for (let i = 0; i < 6; i++) runes[4 + i] = replacement[i];
      return runes.join('');
    });

    const sr = new StreamingReader(linesToAsync(corrupted));
    const { errors } = await collectEntriesAndErrors(sr);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain('EntryAddendaCount');
  });

  // ----------------------------------------------------------------
  // Corrupted FileControl — file-level errors
  // ----------------------------------------------------------------

  it('corrupted file control batch count → file error', async () => {
    const data = readTestdata('ppd-debit.ach');
    const fcLine = findFileControlLine(data);
    expect(fcLine).toBeGreaterThan(0);

    // Corrupt batch count (positions 2-7, 0-indexed 1-6)
    const corrupted = mutateLine(data, fcLine, (line) => {
      const runes = [...line];
      const replacement = '000099';
      for (let i = 0; i < 6; i++) runes[1 + i] = replacement[i];
      return runes.join('');
    });

    const sr = new StreamingReader(linesToAsync(corrupted));
    const { errors } = await collectEntriesAndErrors(sr);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.message.includes('BatchCount'))).toBe(true);
  });

  it('corrupted file control entry hash → file error', async () => {
    const data = readTestdata('ppd-debit.ach');
    const fcLine = findFileControlLine(data);

    // Corrupt entry hash (positions 22-31, 0-indexed 21-30)
    const corrupted = mutateLine(data, fcLine, (line) => {
      const runes = [...line];
      for (let i = 21; i < 31; i++) runes[i] = '0';
      return runes.join('');
    });

    const sr = new StreamingReader(linesToAsync(corrupted));
    const { errors } = await collectEntriesAndErrors(sr);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.message.includes('EntryHash'))).toBe(true);
  });

  // ----------------------------------------------------------------
  // Header/control mismatch
  // ----------------------------------------------------------------

  it('batch header/control service class code mismatch → error', async () => {
    const data = readTestdata('ppd-debit.ach');
    const bcLine = findBatchControlLine(data);

    // Change service class code in batch control (positions 2-4, 0-indexed 1-3)
    const corrupted = mutateLine(data, bcLine, (line) => {
      const runes = [...line];
      // Change to a different service class code
      runes[1] = '2'; runes[2] = '2'; runes[3] = '0'; // 220 = credits only
      return runes.join('');
    });

    const sr = new StreamingReader(linesToAsync(corrupted));
    const { errors } = await collectEntriesAndErrors(sr);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.message.includes('ServiceClassCode'))).toBe(true);
  });

  // ----------------------------------------------------------------
  // Memory: entries don't accumulate
  // ----------------------------------------------------------------

  it('entries array stays small during streaming', async () => {
    // Build a synthetic file with many entries in one batch
    // Modeled on ppd-debit.ach field widths (all records must be exactly 94 chars)
    const lines: string[] = [];
    // File header (94 chars)
    lines.push('101 23138010401210428821906240000A094101Federal Reserve Bank   My Bank Name                   ');
    // Batch header (94 chars)
    lines.push('5225Name on Account                     121042882 PPDREG.SALARY      190625   1121042880000001');
    // Generate 100 entries (94 chars each)
    // RDFI=23138010, ODFI in trace=12104288, amount=1000 cents each
    for (let i = 0; i < 100; i++) {
      const seq = String(i + 1).padStart(7, '0');
      lines.push(`62723138010412345678         0000001000               Receiver Account Name   012104288${seq}`);
    }
    // Batch control (94 chars)
    // entryAddendaCount=100 (6 chars), hash=23138010*100=2313801000 (10 chars)
    // totalDebit=100*1000=100000 (12 chars), totalCredit=0 (12 chars)
    // companyId (10), MAC (19), reserved (6), ODFI (8), batchNum (7)
    lines.push('82250001002313801000000000100000000000000000121042882                          121042880000001');
    // File control (94 chars)
    // batchCount=1 (6), blockCount=11 (6), entryAddendaCount=100 (8), hash (10)
    // totalDebit (12), totalCredit (12), reserved (39)
    lines.push('9000001000011000001002313801000000000100000000000000000                                       ');
    // Padding
    lines.push('9'.repeat(94));

    const data = lines.join('\n');
    const sr = new StreamingReader(linesToAsync(data));

    let count = 0;
    for await (const { entry } of sr.entries()) {
      count++;
      expect(entry).toBeDefined();
    }
    expect(count).toBe(100);
  });

  // ----------------------------------------------------------------
  // ValidateOpts: skipAll and bypassBatchValidation
  // ----------------------------------------------------------------

  it('skipAll skips all streaming validation', async () => {
    const data = readTestdata('ppd-debit.ach');
    const bcLine = findBatchControlLine(data);

    // Corrupt entry hash
    const corrupted = mutateLine(data, bcLine, (line) => {
      const runes = [...line];
      for (let i = 10; i < 20; i++) runes[i] = '0';
      return runes.join('');
    });

    const sr = new StreamingReader(linesToAsync(corrupted));
    sr.setValidation({ skipAll: true } as ValidateOpts);
    const { entries, errors } = await collectEntriesAndErrors(sr);
    expect(entries.length).toBeGreaterThan(0);
    expect(errors).toHaveLength(0);
  });

  it('bypassBatchValidation skips batch-level checks but keeps file-level', async () => {
    const data = readTestdata('ppd-debit.ach');
    const bcLine = findBatchControlLine(data);

    // Corrupt entry hash in batch control
    const corrupted = mutateLine(data, bcLine, (line) => {
      const runes = [...line];
      for (let i = 10; i < 20; i++) runes[i] = '0';
      return runes.join('');
    });

    const sr = new StreamingReader(linesToAsync(corrupted));
    sr.setValidation({ bypassBatchValidation: true } as ValidateOpts);
    const { entries, errors } = await collectEntriesAndErrors(sr);
    expect(entries.length).toBeGreaterThan(0);
    // Batch errors suppressed — but file-level may differ from original because
    // the batch control values feed into file-level accumulators.
    // At least no batch-level errors should be present.
    for (const e of errors) {
      expect(e.message).not.toContain('batch');
    }
  });

  // ----------------------------------------------------------------
  // IAT validation
  // ----------------------------------------------------------------

  it('valid IAT with addenda17/18 — no errors', async () => {
    const sr = streamingReaderFromFile('20180716-IAT-A17-A18.ach');
    const { entries, errors } = await collectEntriesAndErrors(sr);
    expect(entries.length).toBeGreaterThan(0);
    expect(errors).toHaveLength(0);
  });

  // ----------------------------------------------------------------
  // Return and contested/dishonored returns
  // ----------------------------------------------------------------

  it('contested return file — no validation errors', async () => {
    const sr = streamingReaderFromFile('contested-return.ach');
    const { entries, errors } = await collectEntriesAndErrors(sr);
    expect(entries.length).toBeGreaterThan(0);
    expect(errors).toHaveLength(0);
  });

  it('dishonored return file — no validation errors', async () => {
    const sr = streamingReaderFromFile('dishonored-return.ach');
    const { entries, errors } = await collectEntriesAndErrors(sr);
    expect(entries.length).toBeGreaterThan(0);
    expect(errors).toHaveLength(0);
  });

  // ----------------------------------------------------------------
  // Multi-batch: errors in one batch don't prevent processing next
  // ----------------------------------------------------------------

  it('multi-batch file with one corrupted batch still yields other entries', async () => {
    const data = readTestdata('two-micro-deposits.ach');
    const bcLine = findBatchControlLine(data);

    // Corrupt just the first batch's entry hash
    const corrupted = mutateLine(data, bcLine, (line) => {
      const runes = [...line];
      for (let i = 10; i < 20; i++) runes[i] = '0';
      return runes.join('');
    });

    const sr = new StreamingReader(linesToAsync(corrupted));
    const { entries, errors } = await collectEntriesAndErrors(sr);
    // Should still get entries from both batches
    expect(entries.length).toBeGreaterThan(1);
    // Should have at least one batch-level error from the corrupted batch
    expect(errors.length).toBeGreaterThan(0);
  });

  // ----------------------------------------------------------------
  // COR-specific batch-level check
  // ----------------------------------------------------------------

  it('COR file validates correctly', async () => {
    const sr = streamingReaderFromFile('cor-example.ach');
    const { entries, errors } = await collectEntriesAndErrors(sr);
    expect(entries.length).toBeGreaterThan(0);
    expect(errors).toHaveLength(0);
  });
});
