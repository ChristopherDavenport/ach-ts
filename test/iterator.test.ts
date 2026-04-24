import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  readACHFile, Reader,
  File, BatchHeader, EntryDetail,
  Iterator, allSpaces,
} from '../src/index.js';
import type { ValidateOpts } from '../src/index.js';
import '../src/batches/index.js';

const testdataDir = path.join(__dirname, 'testdata');

function readTestdata(filename: string): string {
  return fs.readFileSync(path.join(testdataDir, filename), 'utf-8');
}

function openFile(where: string, opts?: ValidateOpts): File {
  const data = readTestdata(where);
  const r = new Reader(data);
  if (opts) r.setValidation(opts);
  try {
    return r.read();
  } catch {
    // Some files may not have a file header — return whatever was parsed
    return r.file;
  }
}

function iteratorFromFile(where: string, opts?: ValidateOpts): Iterator {
  const data = readTestdata(where);
  const iter = new Iterator(data);
  if (opts) iter.setValidation(opts);
  return iter;
}

function collectEntries(iter: Iterator): EntryDetail[] {
  const entries: EntryDetail[] = [];
  for (;;) {
    const [bh, ed, err] = iter.nextEntry();
    if (err) throw err;
    if (bh === null && ed === null) break;
    if (bh !== null && ed !== null) {
      entries.push(ed);
    }
  }
  return entries;
}

function ensureFileEqualsIterator(file: File, iter: Iterator): void {
  for (let i = 0; i < file.batches.length; i++) {
    const bh = file.batches[i].getHeader();
    const entries = file.batches[i].getEntries();
    for (let j = 0; j < entries.length; j++) {
      const ed = entries[j];
      const [ibh, ied, err] = iter.nextEntry();
      expect(err).toBeNull();
      expect(ibh).not.toBeNull();
      expect(ied).not.toBeNull();

      expect(bh.equal(ibh!)).toBe(true);
      expect(ed.traceNumber).toBe(ied!.traceNumber);

      // Check addenda match
      if (ed.addenda02) expect(ied!.addenda02).not.toBeNull();
      if (ed.addenda98) expect(ied!.addenda98).not.toBeNull();
      if (ed.addenda99) expect(ied!.addenda99).not.toBeNull();
    }
  }
}

describe('Iterator', () => {
  it('valid PPD file', () => {
    const file = openFile('ppd-mixedDebitCredit.ach');
    const iter = iteratorFromFile('ppd-mixedDebitCredit.ach');
    ensureFileEqualsIterator(file, iter);
  });

  it('more valid files', () => {
    const paths = [
      'two-micro-deposits.ach',
      'web-debit.ach',
      '20110805A.ach',
    ];
    for (const p of paths) {
      const file = openFile(p);
      const iter = iteratorFromFile(p);
      ensureFileEqualsIterator(file, iter);
    }
  });

  it('bh-ed-ad-bh-ed-ad-ed-ad', () => {
    const file = openFile('bh-ed-ad-bh-ed-ad-ed-ad.ach');
    const iter = iteratorFromFile('bh-ed-ad-bh-ed-ad-ed-ad.ach');
    ensureFileEqualsIterator(file, iter);
  });

  it('skip IAT batches/entries for now', () => {
    const iter = iteratorFromFile('iat-debit.ach');
    const entries = collectEntries(iter);
    expect(entries).toHaveLength(0);
  });

  it('return examples', () => {
    const paths = [
      'return-WEB.ach',
      'return-no-batch-controls.ach',
      'return-no-file-header-control.ach',
    ];
    for (const p of paths) {
      const file = openFile(p);
      const iter = iteratorFromFile(p);
      ensureFileEqualsIterator(file, iter);
    }
  });

  it('return without batch header', () => {
    const iter = iteratorFromFile('return-no-batch-header.ach');
    const entries = collectEntries(iter);
    expect(entries).toHaveLength(2);

    // Check first EntryDetail
    const ed1 = entries[0];
    expect(ed1.rdfiIdentification + ed1.checkDigit).toBe('091400606');
    expect(ed1.individualName).toBe('Paul Jones            ');
    expect(ed1.traceNumber).toBe('091000017611242');

    expect(ed1.addenda98).toBeNull();
    expect(ed1.addenda99).not.toBeNull();
    expect(ed1.addenda99!.returnCode).toBe('R01');
    expect(ed1.addenda99!.originalTrace).toBe('091400600000001');
    expect(ed1.addenda99!.traceNumber).toBe('091000017611242');

    // Check second EntryDetail
    const ed2 = entries[1];
    expect(ed2.rdfiIdentification + ed2.checkDigit).toBe('231380104');
    expect(ed2.individualName).toBe('Best Co. #23          ');
    expect(ed2.traceNumber).toBe('121042880000001');

    expect(ed2.addenda98).not.toBeNull();
    expect(ed2.addenda98!.changeCode).toBe('C01');
    expect(ed2.addenda98!.correctedData).toBe('1918171614');
    expect(ed2.addenda98!.originalTrace).toBe('121042880000001');
    expect(ed2.addenda98!.traceNumber).toBe('091012980000088');
    expect(ed2.addenda99).toBeNull();
  });

  it('custom return codes', () => {
    const opts: ValidateOpts = { customReturnCodes: true } as ValidateOpts;
    const file = openFile('return-PPD-custom-reason-code.ach', opts);
    const iter = iteratorFromFile('return-PPD-custom-reason-code.ach', opts);
    ensureFileEqualsIterator(file, iter);
  });

  it('blank file', () => {
    const iter = new Iterator('');
    const entries = collectEntries(iter);
    expect(entries).toHaveLength(0);
  });

  it('short lines and has padding', () => {
    const data = readTestdata('short-line.ach');
    const iter = new Iterator(data);
    const entries = collectEntries(iter);
    expect(entries).toHaveLength(1);
  });

  it('whitespace in file', () => {
    const firstData = readTestdata('bh-ed-ad-bh-ed-ad-ed-ad.ach');
    const secondData = readTestdata('return-no-file-header-control.ach');

    // first then second
    const data1 = firstData + '\n  \n' + secondData;
    let iter = new Iterator(data1);
    let entries = collectEntries(iter);
    expect(entries).toHaveLength(4);

    // second then first
    const data2 = secondData + '\n  \n' + firstData;
    iter = new Iterator(data2);
    entries = collectEntries(iter);
    expect(entries).toHaveLength(4);
  });

  it('allSpaces', () => {
    expect(allSpaces('\n')).toBe(true);
    expect(allSpaces('\n \r\n')).toBe(true);

    expect(allSpaces('')).toBe(false);
    expect(allSpaces('abc')).toBe(false);
  });
});
