import { NACHAFileLineLimit, NachaFileDebitCreditLimit } from './constants.js';
import type { ValidateOpts } from './validateOpts.js';
import { mergeValidateOpts } from './validateOpts.js';
import { FileHeader } from './fileHeader.js';
import { BatchHeader, newBatchHeader } from './batchHeader.js';
import { EntryDetail } from './entryDetail.js';
import { IATBatchHeader } from './iatBatchHeader.js';
import { IATEntryDetail } from './iatEntryDetail.js';
import { IATBatch } from './iatBatch.js';
import type { Batcher } from './batch.js';
import { newBatch } from './batch.js';
import { File, newFile } from './file.js';

export interface Conditions {
  /** MaxLines will limit each merged file's line count. */
  maxLines?: number;
  /** MaxDollarAmount will limit each merged file's total dollar amount. */
  maxDollarAmount?: number;
}

/** Merger can merge ACH files with custom ValidateOpts. */
export interface Merger {
  mergeWith(files: File[], conditions: Conditions): [File[], Error | null];
}

/** newMerger returns a Merger which can have custom ValidateOpts. */
export function newMerger(opts?: ValidateOpts): Merger {
  return new MergerImpl(opts);
}

class MergerImpl implements Merger {
  private opts?: ValidateOpts;
  constructor(opts?: ValidateOpts) {
    this.opts = opts;
  }
  mergeWith(files: File[], conditions: Conditions): [File[], Error | null] {
    if (this.opts) {
      for (const f of files) {
        f.setValidation(this.opts);
      }
    }
    return mergeFilesWith(files, conditions);
  }
}

/**
 * MergeFiles consolidates an array of ACH Files into as few files as possible.
 *
 * This operation will override batch numbers in each file to ensure they do not collide.
 * Entries with duplicate TraceNumbers are allowed in the same file, but must be in separate batches.
 * ADV Batches and Entries are currently not merged together.
 * Old rules limit files to 10,000 lines, which is the default.
 * File Batches can only be merged if they are routed to and from the same ABA routing numbers.
 */
export function mergeFiles(files: File[]): [File[], Error | null] {
  return mergeFilesWith(files, { maxLines: NACHAFileLineLimit });
}

/**
 * MergeFilesWith consolidates ACH Files with configurable line/dollar limits.
 */
export function mergeFilesWith(incoming: File[], conditions: Conditions): [File[], Error | null] {
  if (incoming.length === 0) {
    return [[], null];
  }

  const sorted: OutFile = {
    header: incoming[0].header,
    validateOpts: incoming[0].getValidation(),
    batches: [],
    iatBatches: [],
    next: null,
  };

  for (const file of incoming) {
    const err = addToOutFile(sorted, file);
    if (err) return [[], err];
  }

  return convertToFiles(sorted, conditions);
}

// --- Internal types ---

interface MergeBatch {
  header: BatchHeader;
  entries: Map<string, EntryDetail>;
  validateOpts?: ValidateOpts;
}

interface IATMergeBatch {
  header: IATBatchHeader;
  entries: Map<string, IATEntryDetail>;
  validateOpts?: ValidateOpts;
}

interface OutFile {
  header: FileHeader;
  batches: MergeBatch[];
  iatBatches: IATMergeBatch[];
  validateOpts?: ValidateOpts;
  next: OutFile | null;
}

// --- Internal functions ---

function pickOutFile(fh: FileHeader, file: OutFile): OutFile {
  if (fh.immediateOrigin === file.header.immediateOrigin &&
      fh.immediateDestination === file.header.immediateDestination) {
    return file;
  }
  if (file.next === null) {
    file.next = {
      header: fh,
      batches: [],
      iatBatches: [],
      validateOpts: undefined,
      next: null,
    };
    return file.next;
  }
  return pickOutFile(fh, file.next);
}

function findOutBatch(bh: BatchHeader, batches: MergeBatch[], entry: EntryDetail): MergeBatch | null {
  for (const b of batches) {
    if (b.header.equal(bh)) {
      if (!b.entries.has(entry.traceNumber)) {
        return b;
      }
    }
  }
  return null;
}

function findOutIATBatch(bh: IATBatchHeader, batches: IATMergeBatch[], entry: IATEntryDetail): IATMergeBatch | null {
  for (const b of batches) {
    if (b.header.equal(bh)) {
      if (!b.entries.has(entry.traceNumber)) {
        return b;
      }
    }
  }
  return null;
}

function addToOutFile(sorted: OutFile, incoming: File): Error | null {
  const outFile = pickOutFile(incoming.header, sorted);
  outFile.validateOpts = mergeValidateOpts(outFile.validateOpts, incoming.getValidation());

  for (let j = 0; j < incoming.batches.length; j++) {
    if (incoming.batches[j].getADVEntries().length > 0) {
      return new Error('merging ADV batches is not supported');
    }

    const bh = incoming.batches[j].getHeader();

    const entries = incoming.batches[j].getEntries();
    for (const entry of entries) {
      let b = findOutBatch(bh, outFile.batches, entry);

      if (b === null) {
        b = {
          header: bh,
          entries: new Map(),
          validateOpts: incoming.getValidation(),
        };
        outFile.batches.push(b);
      }

      b.entries.set(entry.traceNumber, entry);
    }
  }

  for (let j = 0; j < incoming.iatBatches.length; j++) {
    const ibh = incoming.iatBatches[j].header;

    const entries = incoming.iatBatches[j].entries;
    for (const entry of entries) {
      let b = findOutIATBatch(ibh, outFile.iatBatches, entry);

      if (b === null) {
        b = {
          header: ibh,
          entries: new Map(),
          validateOpts: incoming.getValidation(),
        };
        outFile.iatBatches.push(b);
      }

      b.entries.set(entry.traceNumber, entry);
    }
  }

  return null;
}

function sortedEntries<T>(entries: Map<string, T>): T[] {
  const keys = [...entries.keys()].sort();
  return keys.map(k => entries.get(k)!);
}

function copyBatchHeader(src: BatchHeader, batchNumber: number): BatchHeader {
  const bh = newBatchHeader();
  bh.serviceClassCode = src.serviceClassCode;
  bh.companyName = src.companyName;
  bh.companyDiscretionaryData = src.companyDiscretionaryData;
  bh.companyIdentification = src.companyIdentification;
  bh.standardEntryClassCode = src.standardEntryClassCode;
  bh.companyEntryDescription = src.companyEntryDescription;
  bh.companyDescriptiveDate = src.companyDescriptiveDate;
  bh.effectiveEntryDate = src.effectiveEntryDate;
  bh.settlementDate = src.settlementDate;
  bh.originatorStatusCode = src.originatorStatusCode;
  bh.odfiIdentification = src.odfiIdentification;
  bh.batchNumber = batchNumber;
  return bh;
}

function copyIATBatchHeader(src: IATBatchHeader, batchNumber: number): IATBatchHeader {
  const ibh = new IATBatchHeader();
  ibh.serviceClassCode = src.serviceClassCode;
  ibh.iatIndicator = src.iatIndicator;
  ibh.foreignExchangeIndicator = src.foreignExchangeIndicator;
  ibh.foreignExchangeReferenceIndicator = src.foreignExchangeReferenceIndicator;
  ibh.foreignExchangeReference = src.foreignExchangeReference;
  ibh.isoDestinationCountryCode = src.isoDestinationCountryCode;
  ibh.originatorIdentification = src.originatorIdentification;
  ibh.standardEntryClassCode = src.standardEntryClassCode;
  ibh.companyEntryDescription = src.companyEntryDescription;
  ibh.isoOriginatingCurrencyCode = src.isoOriginatingCurrencyCode;
  ibh.isoDestinationCurrencyCode = src.isoDestinationCurrencyCode;
  ibh.effectiveEntryDate = src.effectiveEntryDate;
  ibh.settlementDate = src.settlementDate;
  ibh.originatorStatusCode = src.originatorStatusCode;
  ibh.odfiIdentification = src.odfiIdentification;
  ibh.batchNumber = batchNumber;
  return ibh;
}

function convertToFiles(sorted: OutFile | null, conditions: Conditions): [File[], Error | null] {
  let maxDollarAmount = conditions.maxDollarAmount ?? 0;
  if (maxDollarAmount === 0 || maxDollarAmount > NachaFileDebitCreditLimit) {
    maxDollarAmount = NachaFileDebitCreditLimit;
  }
  const maxLines = conditions.maxLines ?? 0;

  let batchNumber = 0;
  const out: File[] = [];

  while (sorted !== null) {
    let file = newFile();
    file.header = sorted.header;

    if (sorted.validateOpts) {
      file.setValidation(sorted.validateOpts);
    }

    let currentFileLineCount = 2; // FileHeader, FileControl
    let currentFileDollarAmount = 0;

    for (const nextBatch of sorted.batches) {
      batchNumber++;
      let bh = copyBatchHeader(nextBatch.header, batchNumber);
      let [batch, batchErr] = newBatch(bh);
      if (batchErr || !batch) {
        return [[], new Error(`creating batch failed: ${batchErr?.message}`)];
      }
      batch.setValidation(nextBatch.validateOpts);

      currentFileLineCount += 2; // BatchHeader, BatchControl

      for (const nextEntry of sortedEntries(nextBatch.entries)) {
        const entryLineCount = 1 + nextEntry.addendaCount();

        // Check line limit
        let overflow = false;
        if (maxLines > 0 && currentFileLineCount + entryLineCount > maxLines) {
          overflow = true;
        }
        // Check dollar amount limit
        if (!overflow && maxDollarAmount > 0 && currentFileDollarAmount + nextEntry.amount > maxDollarAmount) {
          overflow = true;
        }

        if (overflow) {
          // Close out current batch and file
          if (batch.getEntries().length > 0) {
            const err = batch.create();
            if (err) return [[], new Error(`problem creating batch for new file/batch: ${err.message}`)];
            file.addBatch(batch);
          }
          if (file.batches.length > 0 || file.iatBatches.length > 0) {
            const err = file.create();
            if (err) return [[], new Error(`problem creating file for new file/batch: ${err.message}`)];
            out.push(file);
          }

          // Reset
          currentFileLineCount = 4; // FileHeader, FileControl, BatchHeader, BatchControl
          currentFileDollarAmount = 0;

          file = newFile();
          file.header = sorted.header;

          batchNumber++;
          bh = copyBatchHeader(nextBatch.header, batchNumber);
          const [newB, newErr] = newBatch(bh);
          if (newErr || !newB) {
            return [[], new Error(`problem creating overflow batch: ${newErr?.message}`)];
          }
          newB.setValidation(nextBatch.validateOpts);
          batch = newB;
        }

        batch.addEntry(nextEntry);
        currentFileLineCount += 1 + nextEntry.addendaCount();
        currentFileDollarAmount += nextEntry.amount;
      }

      if (batch.getEntries().length > 0) {
        const err = batch.create();
        if (err) return [[], new Error(`problem creating batch for outfile: ${err.message}`)];
        file.addBatch(batch);
      }
    }

    for (const nextBatch of sorted.iatBatches) {
      batchNumber++;
      let iatBh = copyIATBatchHeader(nextBatch.header, batchNumber);
      let iatBatch = new IATBatch(iatBh);
      iatBatch.setValidation(nextBatch.validateOpts!);

      currentFileLineCount += 2; // IATBatchHeader, BatchControl

      for (const nextEntry of sortedEntries(nextBatch.entries)) {
        const entryLineCount = 1 + nextEntry.addendaCount();

        let overflow = false;
        if (maxLines > 0 && currentFileLineCount + entryLineCount > maxLines) {
          overflow = true;
        }
        if (!overflow && maxDollarAmount > 0 && currentFileDollarAmount + nextEntry.amount > maxDollarAmount) {
          overflow = true;
        }

        if (overflow) {
          if (iatBatch.entries.length > 0) {
            const err = iatBatch.create();
            if (err) return [[], new Error(`problem creating IAT batch for new file/batch: ${err.message}`)];
            file.addIATBatch(iatBatch);
          }
          if (file.batches.length > 0 || file.iatBatches.length > 0) {
            const err = file.create();
            if (err) return [[], new Error(`problem creating file for new file/batch: ${err.message}`)];
            out.push(file);
          }

          currentFileLineCount = 4;
          currentFileDollarAmount = 0;

          file = newFile();
          file.header = sorted.header;

          batchNumber++;
          iatBh = copyIATBatchHeader(nextBatch.header, batchNumber);
          iatBatch = new IATBatch(iatBh);
          iatBatch.setValidation(nextBatch.validateOpts!);
        }

        iatBatch.addEntry(nextEntry);
        currentFileLineCount += 1 + nextEntry.addendaCount();
        currentFileDollarAmount += nextEntry.amount;
      }

      if (iatBatch.entries.length > 0) {
        const err = iatBatch.create();
        if (err) return [[], new Error(`problem creating IAT batch for outfile: ${err.message}`)];
        file.addIATBatch(iatBatch);
      }
    }

    if (file.batches.length > 0 || file.iatBatches.length > 0) {
      const err = file.create();
      if (err) return [[], new Error(`problem creating outfile: ${err.message}`)];
      out.push(file);
    }

    sorted = sorted.next;
  }

  return [out, null];
}
