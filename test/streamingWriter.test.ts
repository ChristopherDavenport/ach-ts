import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  File, newFile,
  FileHeader, newFileHeader,
  BatchHeader, newBatchHeader,
  EntryDetail, newEntryDetail,
  IATBatch, IATBatchHeader, IATEntryDetail,
  Batch, newBatch,
  Writer, Reader, readACHFile,
  StreamingReader,
  StreamingWriter,
  PPD, WEB, CCD,
  CreditsOnly, DebitsOnly,
  CheckingCredit, CheckingDebit,
} from '../src/index.js';
import type { Batcher, StreamingBatchHeader, StreamingEntryDetail, StreamingWriterOpts } from '../src/index.js';
import '../src/batches/index.js';

const testdataDir = path.join(__dirname, 'testdata');

function readTestdata(filename: string): string {
  return fs.readFileSync(path.join(testdataDir, filename), 'utf-8');
}

/** Convert a string into an AsyncIterable<string> of lines. */
async function* linesToAsync(data: string): AsyncIterable<string> {
  for (const line of data.split(/\r?\n/)) {
    yield line;
  }
}

/** Collect StreamingWriter output into a string via a sync sink. */
function collectOutput(): { sink: (line: string) => void; output: () => string } {
  const parts: string[] = [];
  return {
    sink: (line: string) => { parts.push(line); },
    output: () => parts.join(''),
  };
}

/** Read a fixture, parse with Reader, write with Writer, return the Writer output. */
function writerOutput(filename: string): string {
  const data = readTestdata(filename);
  const r = new Reader(data);
  const file = r.read();
  file.create();
  const w = new Writer();
  w.bypassValidation = true;
  return w.write(file);
}

/** Read a fixture with Reader, iterate entries via batches, write with StreamingWriter. */
async function streamingWriterOutput(filename: string): Promise<string> {
  const data = readTestdata(filename);
  const r = new Reader(data);
  const file = r.read();

  const { sink, output } = collectOutput();
  const sw = new StreamingWriter(file.header, sink);

  // Regular batches
  for (const batch of file.batches) {
    const bh = batch.getHeader();
    for (const entry of batch.getEntries()) {
      await sw.writeEntry(bh, entry);
    }
  }

  // IAT batches
  for (const iatBatch of file.iatBatches) {
    const bh = iatBatch.header;
    for (const entry of iatBatch.entries) {
      await sw.writeEntry(bh, entry);
    }
  }

  await sw.close();
  return output();
}

/** End-to-end: StreamingReader → StreamingWriter pipeline from fixture data. */
async function pipelineOutput(filename: string): Promise<string> {
  const data = readTestdata(filename);

  // Get file header from a quick Reader parse
  const r = new Reader(data);
  const file = r.read();

  const { sink, output } = collectOutput();
  const sr = new StreamingReader(linesToAsync(data));
  const sw = new StreamingWriter(file.header, sink);

  for await (const { batchHeader, entry } of sr.entries()) {
    await sw.writeEntry(batchHeader, entry);
  }

  await sw.close();
  return output();
}

// =========================================================================
// Helpers to compare ACH outputs
// =========================================================================

/** Parse output into lines and compare records, ignoring padding. */
function contentLines(output: string): string[] {
  return output.split('\n').filter(l => l.length > 0 && !l.match(/^9{94}$/));
}

/** Compare two ACH file outputs record by record. */
function expectRecordsEqual(actual: string, expected: string, label: string): void {
  const actualLines = contentLines(actual);
  const expectedLines = contentLines(expected);

  // Compare line counts
  expect(actualLines.length, `${label}: line count`).toBe(expectedLines.length);

  for (let i = 0; i < Math.min(actualLines.length, expectedLines.length); i++) {
    const pos = actualLines[i]?.[0] ?? '?';
    if (pos === '8' || pos === '9') {
      // BatchControl and FileControl are recomputed — compare field-by-field
      // Just verify same record type and length
      expect(actualLines[i].length, `${label} line ${i + 1} length`).toBe(expectedLines[i].length);
      expect(actualLines[i][0], `${label} line ${i + 1} record type`).toBe(expectedLines[i][0]);
    } else {
      // FileHeader, BatchHeader, EntryDetail, Addenda should be identical
      expect(actualLines[i], `${label} line ${i + 1}`).toBe(expectedLines[i]);
    }
  }
}

// =========================================================================
// Tests
// =========================================================================

describe('StreamingWriter', () => {
  it('PPD file round-trip matches Writer output', async () => {
    const expected = writerOutput('ppd-mixedDebitCredit.ach');
    const actual = await streamingWriterOutput('ppd-mixedDebitCredit.ach');
    expectRecordsEqual(actual, expected, 'PPD');
  });

  it('WEB file round-trip', async () => {
    const expected = writerOutput('web-debit.ach');
    const actual = await streamingWriterOutput('web-debit.ach');
    expectRecordsEqual(actual, expected, 'WEB');
  });

  it('multi-batch file (two-micro-deposits)', async () => {
    const expected = writerOutput('two-micro-deposits.ach');
    const actual = await streamingWriterOutput('two-micro-deposits.ach');
    expectRecordsEqual(actual, expected, 'two-micro-deposits');
  });

  it('IAT debit file round-trip', async () => {
    const expected = writerOutput('iat-debit.ach');
    const actual = await streamingWriterOutput('iat-debit.ach');
    expectRecordsEqual(actual, expected, 'IAT-debit');
  });

  it('IAT credit file round-trip', async () => {
    const expected = writerOutput('iat-credit.ach');
    const actual = await streamingWriterOutput('iat-credit.ach');
    expectRecordsEqual(actual, expected, 'IAT-credit');
  });

  it('return file with addenda99', async () => {
    const expected = writerOutput('return-WEB.ach');
    const actual = await streamingWriterOutput('return-WEB.ach');
    expectRecordsEqual(actual, expected, 'return-WEB');
  });

  it('block padding produces line count divisible by 10', async () => {
    const actual = await streamingWriterOutput('ppd-mixedDebitCredit.ach');
    const totalLines = actual.split('\n').filter(l => l.length > 0).length;
    expect(totalLines % 10).toBe(0);
  });

  it('BatchControl totals are correct', async () => {
    const data = readTestdata('ppd-mixedDebitCredit.ach');
    const file = new Reader(data).read();

    const { sink, output } = collectOutput();
    const sw = new StreamingWriter(file.header, sink);

    for (const batch of file.batches) {
      const bh = batch.getHeader();
      for (const entry of batch.getEntries()) {
        await sw.writeEntry(bh, entry);
      }
    }
    await sw.close();

    // Parse the output back and verify batch control totals match
    const result = new Reader(output()).read();
    for (let i = 0; i < file.batches.length; i++) {
      const origBc = file.batches[i].getControl();
      const newBc = result.batches[i].getControl();
      expect(newBc.entryAddendaCount, 'entryAddendaCount').toBe(origBc.entryAddendaCount);
      expect(newBc.entryHash, 'entryHash').toBe(origBc.entryHash);
      expect(newBc.totalDebitEntryDollarAmount, 'totalDebit').toBe(origBc.totalDebitEntryDollarAmount);
      expect(newBc.totalCreditEntryDollarAmount, 'totalCredit').toBe(origBc.totalCreditEntryDollarAmount);
    }
  });

  it('FileControl totals are correct', async () => {
    const data = readTestdata('ppd-mixedDebitCredit.ach');
    const file = new Reader(data).read();
    file.create();

    const { sink, output } = collectOutput();
    const sw = new StreamingWriter(file.header, sink);

    for (const batch of file.batches) {
      const bh = batch.getHeader();
      for (const entry of batch.getEntries()) {
        await sw.writeEntry(bh, entry);
      }
    }
    await sw.close();

    const result = new Reader(output()).read();
    expect(result.control.batchCount).toBe(file.control.batchCount);
    expect(result.control.entryAddendaCount).toBe(file.control.entryAddendaCount);
    expect(result.control.entryHash).toBe(file.control.entryHash);
    expect(result.control.totalDebitEntryDollarAmountInFile).toBe(file.control.totalDebitEntryDollarAmountInFile);
    expect(result.control.totalCreditEntryDollarAmountInFile).toBe(file.control.totalCreditEntryDollarAmountInFile);
  });

  it('end-to-end StreamingReader → StreamingWriter pipeline', async () => {
    const expected = writerOutput('ppd-mixedDebitCredit.ach');
    const actual = await pipelineOutput('ppd-mixedDebitCredit.ach');
    expectRecordsEqual(actual, expected, 'pipeline');
  });

  it('end-to-end pipeline with IAT file', async () => {
    const expected = writerOutput('iat-debit.ach');
    const actual = await pipelineOutput('iat-debit.ach');
    expectRecordsEqual(actual, expected, 'pipeline-IAT');
  });

  it('writing after close throws', async () => {
    const fh = newFileHeader();
    fh.immediateDestination = '231380104';
    fh.immediateOrigin = '121042882';
    fh.fileCreationDate = '190101';
    fh.immediateDestinationName = 'Citadel';
    fh.immediateOriginName = 'Wells Fargo';

    const { sink } = collectOutput();
    const sw = new StreamingWriter(fh, sink);
    await sw.close();

    const bh = newBatchHeader();
    bh.serviceClassCode = CreditsOnly;
    bh.standardEntryClassCode = PPD;
    bh.companyIdentification = '121042882';
    bh.odfiIdentification = '12104288';
    bh.originatorStatusCode = 1;

    const ed = newEntryDetail();
    ed.transactionCode = CheckingCredit;
    ed.rdfiIdentification = '23138010';
    ed.checkDigit = '4';
    ed.amount = 10000;

    await expect(sw.writeEntry(bh, ed)).rejects.toThrow('closed');
  });

  it('async sink is supported', async () => {
    const data = readTestdata('ppd-mixedDebitCredit.ach');
    const file = new Reader(data).read();

    const parts: string[] = [];
    const asyncSink = async (line: string): Promise<void> => {
      // Simulate async I/O
      await new Promise(resolve => setTimeout(resolve, 0));
      parts.push(line);
    };

    const sw = new StreamingWriter(file.header, asyncSink);
    for (const batch of file.batches) {
      const bh = batch.getHeader();
      for (const entry of batch.getEntries()) {
        await sw.writeEntry(bh, entry);
      }
    }
    await sw.close();

    const output = parts.join('');
    const result = new Reader(output).read();
    expect(result.batches.length).toBeGreaterThan(0);
  });

  it('empty file (no entries) produces valid output', async () => {
    const fh = newFileHeader();
    fh.immediateDestination = '231380104';
    fh.immediateOrigin = '121042882';
    fh.fileCreationDate = '190101';
    fh.immediateDestinationName = 'Citadel';
    fh.immediateOriginName = 'Wells Fargo';

    const { sink, output } = collectOutput();
    const sw = new StreamingWriter(fh, sink);
    await sw.close();

    const result = output();
    const lines = result.split('\n').filter(l => l.length > 0);
    // FileHeader + FileControl + padding
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines.length % 10).toBe(0);
    expect(lines[0][0]).toBe('1'); // FileHeader
    // FileControl or padding
    expect(lines[1][0]).toBe('9');
  });
});
