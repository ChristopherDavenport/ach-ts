import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { readACHFile } from '../src/index.js';
import '../src/batches/index.js';

const testdataDir = path.join(__dirname, 'testdata');

function readFixture(filename: string): string {
  return fs.readFileSync(path.join(testdataDir, filename), 'utf-8');
}

// =========================================================================
// Each SEC type has a fixture file — verify parse, create, validate
// =========================================================================
const secFixtures: [string, string][] = [
  ['ACK', 'ack-read.ach'],
  ['ADV', 'adv-read.ach'],
  ['ARC', 'arc-debit.ach'],
  ['ATX', 'atx-read.ach'],
  ['BOC', 'boc-debit.ach'],
  ['CCD', 'ccd-debit.ach'],
  ['CIE', 'cie-credit.ach'],
  ['COR', 'cor-read.ach'],
  ['CTX', 'ctx-debit.ach'],
  ['DNE', 'dne-read.ach'],
  ['ENR', 'enr-read.ach'],
  ['MTE', 'mte-read.ach'],
  ['POP', 'pop-debit.ach'],
  ['POS', 'pos-debit.ach'],
  ['PPD', 'ppd-debit.ach'],
  ['RCK', 'rck-debit.ach'],
  ['SHR', 'shr-debit.ach'],
  ['TEL', 'tel-debit.ach'],
  ['TRC', 'trc-debit.ach'],
  ['TRX', 'trx-debit.ach'],
  ['WEB', 'web-debit.ach'],
  ['XCK', 'xck-debit.ach'],
];

const iatFixtures: string[] = [
  'iat-debit.ach',
  'iat-credit.ach',
  '20180713-IAT.ach',
  '20180716-IAT-A17.ach',
  '20180716-IAT-A17-A18.ach',
  'iat-mixedDebitCredit.ach',
];

describe('SEC code fixtures: parse → create → validate', () => {
  describe.each(secFixtures)('SEC=%s (%s)', (sec, filename) => {
    it('parses successfully', () => {
      const data = readFixture(filename);
      const file = readACHFile(data);
      expect(file.batches.length).toBeGreaterThanOrEqual(1);
    });

    it('has correct SEC code', () => {
      const data = readFixture(filename);
      const file = readACHFile(data);
      expect(file.batches[0].getHeader().standardEntryClassCode).toBe(sec);
    });

    it('file.create() succeeds', () => {
      const data = readFixture(filename);
      const file = readACHFile(data);
      expect(() => file.create()).not.toThrow();
    });

    it('file.validate() succeeds', () => {
      const data = readFixture(filename);
      const file = readACHFile(data);
      file.create();
      expect(() => file.validate()).not.toThrow();
    });
  });
});

describe('IAT fixtures: parse → create → validate', () => {
  describe.each(iatFixtures)('%s', (filename) => {
    it('parses with IAT batches', () => {
      const data = readFixture(filename);
      const file = readACHFile(data);
      expect(file.iatBatches.length).toBeGreaterThanOrEqual(1);
    });

    it('IAT batch header has IAT SEC code', () => {
      const data = readFixture(filename);
      const file = readACHFile(data);
      expect(file.iatBatches[0].header.standardEntryClassCode).toBe('IAT');
    });

    it('file.create() succeeds', () => {
      const data = readFixture(filename);
      const file = readACHFile(data);
      expect(() => file.create()).not.toThrow();
    });

    it('file.validate() succeeds', () => {
      const data = readFixture(filename);
      const file = readACHFile(data);
      file.create();
      expect(() => file.validate()).not.toThrow();
    });
  });
});
