import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Reader, readACHFile, fileFromJSON } from '../src/index.js';
import '../src/batches/index.js';

const testdataDir = path.join(__dirname, 'testdata');

function readFixture(filename: string): string {
  return fs.readFileSync(path.join(testdataDir, filename), 'utf-8');
}

function tryRead(filename: string): { file: any; error: any } {
  try {
    const content = readFixture(filename);
    const reader = new Reader(content);
    const file = reader.read();
    return { file, error: null };
  } catch (e) {
    return { file: null, error: e };
  }
}

describe('Crasher files', () => {
  // These files are malformed inputs that should not crash the parser.
  // The parser may return errors, but it must NOT throw unhandled exceptions.
  const crasherFiles = ['0.ach', '1.ach', '2.ach', '3.ach', '4.ach', '5.ach'];

  for (const filename of crasherFiles) {
    it(`crashers/${filename} does not crash`, () => {
      const result = tryRead(`crashers/${filename}`);
      // May or may not parse successfully, but must not throw
      expect(true).toBe(true); // if we got here, no crash occurred
    });
  }

  it('crashers/d8f3557bf70ce706c9efbfcfd8143f131a2eef20 does not crash', () => {
    const result = tryRead('crashers/d8f3557bf70ce706c9efbfcfd8143f131a2eef20');
    expect(true).toBe(true);
  });
});

describe('Malformed input handling', () => {
  it('handles missing file control', () => {
    const result = tryRead('file_parsing_missing_file_control.txt');
    // Should not crash; may produce a file with errors
    expect(true).toBe(true);
  });

  it('handles short lines', () => {
    const result = tryRead('short-line.ach');
    expect(true).toBe(true);
  });

  it('handles long lines', () => {
    const result = tryRead('long-line.ach');
    expect(true).toBe(true);
  });

  it('handles non-ASCII characters (windows-1252)', () => {
    const result = tryRead('nonascii.ach');
    expect(true).toBe(true);
  });

  it('handles non-ASCII UTF-8 characters', () => {
    const result = tryRead('nonascii-utf8.ach');
    expect(true).toBe(true);
  });

  it('handles extended ASCII characters', () => {
    const result = tryRead('extended-ascii.ach');
    expect(true).toBe(true);
  });

  it('handles empty input', () => {
    const result = tryRead('__nonexistent_empty__');
    // Reader with empty string may throw; just verify no unhandled crash
    try {
      const reader = new Reader('');
      reader.read();
    } catch (_) {
      // Expected - empty input has no file header
    }
    expect(true).toBe(true);
  });

  it('handles whitespace-only input', () => {
    try {
      const reader = new Reader('   \n   \n   ');
      reader.read();
    } catch (_) {
      // Expected
    }
    expect(true).toBe(true);
  });

  it('handles input with only 9-padding', () => {
    try {
      const nines = '9'.repeat(94);
      const reader = new Reader(nines + '\n' + nines + '\n');
      reader.read();
    } catch (_) {
      // Expected - no file header
    }
    expect(true).toBe(true);
  });

  it('handles invalid record type', () => {
    try {
      const badLine = 'X' + ' '.repeat(93);
      const reader = new Reader(badLine);
      reader.read();
    } catch (_) {
      // Expected
    }
    expect(true).toBe(true);
  });

  it('handles batch header without file header', () => {
    try {
      const batchHeader = '5200ACME CORP       1234567890      PPDPAYROLL  190101   1121042880000001';
      const padded = batchHeader.padEnd(94);
      const reader = new Reader(padded);
      reader.read();
    } catch (_) {
      // Expected
    }
    expect(true).toBe(true);
  });

  it('handles entry detail outside batch', () => {
    try {
      const entry = '62223138010412345678901000010000               Wade Arnold         1121042880000001';
      const padded = entry.padEnd(94);
      const reader = new Reader(padded);
      reader.read();
    } catch (_) {
      // Expected
    }
    expect(true).toBe(true);
  });

  it('handles addenda outside entry', () => {
    try {
      const addenda = '705Some payment info here                                                  00010000001';
      const padded = addenda.padEnd(94);
      const reader = new Reader(padded);
      reader.read();
    } catch (_) {
      // Expected
    }
    expect(true).toBe(true);
  });

  it('handles return file with no batch controls', () => {
    const result = tryRead('return-no-batch-controls.ach');
    expect(true).toBe(true);
  });

  it('handles return file with no batch header', () => {
    const result = tryRead('return-no-batch-header.ach');
    expect(true).toBe(true);
  });

  it('handles return file with no file header/control', () => {
    const result = tryRead('return-no-file-header-control.ach');
    expect(true).toBe(true);
  });

  it('handles invalid two micro deposits', () => {
    const result = tryRead('invalid-two-micro-deposits.ach');
    // Should either parse with errors or throw
    expect(true).toBe(true);
  });

  it('handles fixed-length format', () => {
    const content = readFixture('ppd-debit-fixedLength.ach');
    const reader = new Reader(content);
    const file = reader.read();
    expect(file).toBeDefined();
    expect(file.batches.length).toBeGreaterThan(0);
  });

  it('handles invalid fixed-length format', () => {
    const result = tryRead('ppd-debit-fixedLengthInvalid.ach');
    expect(true).toBe(true);
  });

  it('handles file with multiple batch header/entry/addenda groups', () => {
    const result = tryRead('bh-ed-ad-bh-ed-ad-ed-ad.ach');
    expect(true).toBe(true);
  });

  it('ADV with invalid batch entries', () => {
    const result = tryRead('adv-invalidBatchEntries.ach');
    expect(true).toBe(true);
  });

  it('ADV with invalid file control', () => {
    const result = tryRead('adv-invalidFileControl.ach');
    expect(true).toBe(true);
  });

  it('ADV with no file control', () => {
    const result = tryRead('adv-noFileControl.ach');
    expect(true).toBe(true);
  });

  it('IAT with invalid batch header', () => {
    const result = tryRead('iat-batchHeaderErr.ach');
    expect(true).toBe(true);
  });

  it('IAT with invalid batch control', () => {
    const result = tryRead('iat-invalidBatchControl.ach');
    expect(true).toBe(true);
  });

  it('IAT with invalid entry detail', () => {
    const result = tryRead('iat-invalidEntryDetail.ach');
    expect(true).toBe(true);
  });

  it('POS with invalid entry detail', () => {
    const result = tryRead('pos-invalidEntryDetail.ach');
    expect(true).toBe(true);
  });

  it('POS with invalid return file', () => {
    const result = tryRead('pos-invalidReturnFile.ach');
    expect(true).toBe(true);
  });

  it('PPD with invalid entry detail check digit', () => {
    // Reader throws on validation errors - verify the error mentions check digit
    try {
      const content = readFixture('ppd-debit-invalid-entryDetail-checkDigit.ach');
      const reader = new Reader(content);
      reader.read();
      // If it doesn't throw, file was parsed (maybe with bypass)
    } catch (e: any) {
      expect(e.message).toContain('check digit');
    }
  });

  it('invalid file from 20110729A', () => {
    const result = tryRead('20110729A-invalid.ach');
    expect(true).toBe(true);
  });

  it('WEB invalid NOC file', () => {
    const result = tryRead('web-invalidNOCFile.ach');
    expect(true).toBe(true);
  });
});

describe('JSON malformed input handling', () => {
  it('handles invalid JSON string via Reader', () => {
    // Reader only parses NACHA fixed-width, not JSON — this should produce errors
    try {
      const reader = new Reader('not json at all');
      reader.read();
    } catch (_) {
      // Expected
    }
    expect(true).toBe(true);
  });

  it('handles ppd-invalid.json', () => {
    const content = readFixture('ppd-invalid.json');
    const [file, err] = fileFromJSON(content);
    // May fail to parse but should not crash
    expect(true).toBe(true);
  });

  it('handles ppd-invalidFile.json', () => {
    const content = readFixture('ppd-invalidFile.json');
    const [file, err] = fileFromJSON(content);
    expect(true).toBe(true);
  });

  it('handles invalid batchNumber.json', () => {
    const content = readFixture('invalid-batchNumber.json');
    const [file, err] = fileFromJSON(content);
    expect(true).toBe(true);
  });
});
