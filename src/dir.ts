import { promises as fsp } from 'node:fs';
import { join } from 'node:path';
import { Reader } from './reader.js';
import { File } from './file.js';
import { fileFromJSON } from './file.js';
import { mergeFiles, mergeFilesWith } from './merge.js';
import type { Conditions } from './merge.js';

/**
 * ReadDir will attempt to parse all ACH files in the given directory.
 * Only files which parse successfully will be returned.
 *
 * Files are first tried as NACHA fixed-width format, then as JSON.
 * Subdirectories are skipped.
 */
export async function readDir(dir: string): Promise<[File[], Error | null]> {
  let entries: string[];
  try {
    entries = await fsp.readdir(dir);
  } catch (e) {
    return [[], e instanceof Error ? e : new Error(String(e))];
  }

  const out: File[] = [];
  // Sort for deterministic ordering (matches Go's os.ReadDir)
  entries.sort();

  for (const name of entries) {
    const filePath = join(dir, name);
    let stat: Awaited<ReturnType<typeof fsp.stat>>;
    try {
      stat = await fsp.stat(filePath);
    } catch (e) {
      return [out, new Error(`stat of ${filePath} failed: ${e}`)];
    }
    if (stat.isDirectory()) {
      continue;
    }

    // Try ACH format first
    let achErr: Error | null = null;
    try {
      const content = await fsp.readFile(filePath, 'utf-8');
      const reader = new Reader(content);
      const file = reader.read();
      const valErr = file.validate();
      if (!valErr) {
        out.push(file);
        continue;
      }
      achErr = new Error(`reading ${filePath} failed: ${valErr.message}`);
    } catch (e) {
      achErr = new Error(`opening ${filePath} failed: ${e}`);
    }

    // Try JSON format
    let jsonErr: Error | null = null;
    try {
      const content = await fsp.readFile(filePath, 'utf-8');
      const [file, err] = fileFromJSON(content);
      if (file && !err) {
        out.push(file);
        continue;
      }
      jsonErr = err ?? new Error(`reading ${filePath} as JSON failed`);
    } catch (e) {
      jsonErr = new Error(`opening ${filePath} failed: ${e}`);
    }

    if (achErr && jsonErr) {
      return [out, new Error(`${filePath} failed to parse: ${achErr.message} | ${jsonErr.message}`)];
    }
  }

  return [out, null];
}

/**
 * MergeDir reads all ACH files from a directory and merges them.
 * Uses default NACHA line limits (10,000 lines per file).
 */
export async function mergeDir(dir: string): Promise<[File[], Error | null]> {
  const [files, err] = await readDir(dir);
  if (err) {
    return [files, err];
  }
  return mergeFiles(files);
}

/**
 * MergeDirWith reads all ACH files from a directory and merges them
 * with the given conditions (max lines, max dollar amount).
 */
export async function mergeDirWith(dir: string, conditions: Conditions): Promise<[File[], Error | null]> {
  const [files, err] = await readDir(dir);
  if (err) {
    return [files, err];
  }
  return mergeFilesWith(files, conditions);
}
