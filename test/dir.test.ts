import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { readDir, mergeDir, mergeDirWith } from '../src/index.js';
import '../src/batches/index.js';

const testdataDir = path.join(__dirname, 'testdata');

describe('readDir', () => {
  it('should read ACH files from a directory', async () => {
    const tmpDir = fs.mkdtempSync(path.join('/tmp', 'ach-readdir-test-'));
    try {
      for (const name of ['ppd-debit.ach', 'ppd-credit.ach']) {
        const src = path.join(testdataDir, name);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, path.join(tmpDir, name));
        }
      }
      const [files, err] = await readDir(tmpDir);
      expect(err).toBeNull();
      expect(files.length).toBeGreaterThan(0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should return error for non-existent directory', async () => {
    const [files, err] = await readDir('/tmp/nonexistent-ach-dir-' + Date.now());
    expect(err).not.toBeNull();
    expect(files).toHaveLength(0);
  });
});

describe('mergeDir', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join('/tmp', 'ach-dir-test-'));
    // Copy a couple of ACH files into the temp directory
    for (const name of ['ppd-debit.ach', 'ppd-credit.ach']) {
      const src = path.join(testdataDir, name);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(tmpDir, name));
      }
    }
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should read and merge ACH files from a directory', async () => {
    const [merged, err] = await mergeDir(tmpDir);
    expect(err).toBeNull();
    expect(merged.length).toBeGreaterThan(0);
    for (const f of merged) {
      expect(f.validate()).toBeNull();
    }
  });

  it('should merge with conditions', async () => {
    const [merged, err] = await mergeDirWith(tmpDir, { maxLines: 10000 });
    expect(err).toBeNull();
    expect(merged.length).toBeGreaterThan(0);
    for (const f of merged) {
      expect(f.validate()).toBeNull();
    }
  });

  it('should merge JSON files from a directory', async () => {
    const jsonDir = fs.mkdtempSync(path.join('/tmp', 'ach-json-test-'));
    try {
      const src = path.join(testdataDir, 'ppd-valid.json');
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(jsonDir, 'ppd-valid.json'));
      }
      const [merged, err] = await mergeDir(jsonDir);
      expect(err).toBeNull();
      expect(merged.length).toBeGreaterThan(0);
    } finally {
      fs.rmSync(jsonDir, { recursive: true, force: true });
    }
  });
});
