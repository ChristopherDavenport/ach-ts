import {
  PPD,
  entryDetailPos, entryAddendaPos, batchControlPos,
} from './constants.js';
import type { ValidateOpts } from './validateOpts.js';
import { File } from './file.js';
import { FileHeader } from './fileHeader.js';
import { FileControl } from './fileControl.js';
import { BatchHeader, newBatchHeader } from './batchHeader.js';
import { EntryDetail } from './entryDetail.js';
import { Reader } from './reader.js';
import { newBatch } from './batch.js';
import { ParseError, ErrFileEntryOutsideBatch } from './errors/index.js';

/**
 * Iterator processes an ACH file one entry at a time.
 * This is memory-efficient for large files.
 */
export class Iterator {
  private reader: Reader;
  private lines: string[];
  private lineIndex = 0;
  private cachedLine = '';

  constructor(input: string) {
    this.reader = new Reader(''); // empty input — we call readLine manually
    this.reader.skipBatchAccumulation = true;
    this.lines = input.split(/\r?\n/);
  }

  setValidation(opts: ValidateOpts): void {
    this.reader.setValidation(opts);
  }

  /** Returns the FileHeader once encountered. Call nextEntry() at least once first. */
  getHeader(): FileHeader | null {
    return this.reader.file.header ?? null;
  }

  /** Returns the FileControl once encountered. Call nextEntry() at least once first. */
  getControl(): FileControl | null {
    return this.reader.file.control ?? null;
  }

  /**
   * Returns the next available EntryDetail record and the BatchHeader it belongs to.
   * Returns [null, null, null] when exhausted.
   * IAT entries are not currently supported.
   */
  nextEntry(): [BatchHeader | null, EntryDetail | null, Error | null] {
    // Clear the reader's File
    const cleanup = () => {
      this.reader.file = new File();
    };

    let line = this.cachedLine;
    if (line !== '') {
      this.cachedLine = '';
    } else {
      // Consume lines until we reach a non-empty line
      while (this.lineIndex < this.lines.length) {
        line = this.lines[this.lineIndex++];
        this.reader.lineNum++;
        if (allSpaces(line)) {
          continue;
        }
        if (line !== '') {
          break;
        }
      }
      // If we've exhausted all lines
      if (line === '' || allSpaces(line)) {
        cleanup();
        return [null, null, null];
      }
    }

    let err = this.reader.readLine(line);
    if (err) {
      if (err instanceof ParseError && err.cause === ErrFileEntryOutsideBatch) {
        // Fake a Batch so we can parse entries
        const bh = newBatchHeader();
        bh.standardEntryClassCode = PPD;
        const [batch, batchErr] = newBatch(bh);
        if (batchErr || !batch) {
          cleanup();
          return [null, null, new Error(`faking batch for line ${this.reader.lineNum} failed: ${batchErr?.message}`)];
        }
        this.reader.currentBatch = batch;
        err = this.reader.readLine(line);
        if (err) {
          cleanup();
          return [null, null, new Error(`reading line ${this.reader.lineNum} with fake BatchHeader failed: ${err.message}`)];
        }
      } else {
        cleanup();
        return [null, null, new Error(`reading line ${this.reader.lineNum} failed: ${err.message}`)];
      }
    }

    if (this.reader.currentBatch !== null) {
      const bh = this.reader.currentBatch.getHeader();
      const entries = this.reader.currentBatch.getEntries();
      if (entries.length > 0) {
        const returnableEntry = entries[entries.length - 1];

        // Read lines so long as we encounter an addenda or batch control record
        while (this.lineIndex < this.lines.length) {
          const foundLine = this.lines[this.lineIndex++];
          this.reader.lineNum++;
          if (foundLine === '') {
            break;
          }

          if (foundLine.startsWith(entryDetailPos)) {
            this.cachedLine = foundLine;
            cleanup();
            return [bh, returnableEntry, null];
          }

          if (foundLine.startsWith(entryAddendaPos)) {
            this.reader.line = foundLine;
            const addendaErr = this.reader.parseEDAddenda();
            if (addendaErr) {
              cleanup();
              return [null, null, new Error(`reading addenda on line ${this.reader.lineNum} failed: ${addendaErr.message}`)];
            }

            const updatedEntries = this.reader.currentBatch!.getEntries();
            const ed = updatedEntries[updatedEntries.length - 1];

            cleanup();
            return [bh, ed, null];
          }

          if (foundLine.startsWith(batchControlPos)) {
            // Do nothing with the Batch Control record
            cleanup();
            return [bh, returnableEntry, null];
          }

          // Default: cache line if not file control
          if (!foundLine.startsWith('9')) {
            this.cachedLine = foundLine;
          }
          cleanup();
          return [bh, null, null];
        }

        cleanup();
        return [bh, returnableEntry, null];
      } else {
        // We processed the BatchHeader, but need to find an Entry Detail record
        return this.nextEntry();
      }
    }

    return this.nextEntry();
  }
}

/** @internal */
export function allSpaces(input: string): boolean {
  if (input.length === 0) return false;
  for (const ch of input) {
    if (ch !== ' ' && ch !== '\t' && ch !== '\n' && ch !== '\r') {
      return false;
    }
  }
  return true;
}
