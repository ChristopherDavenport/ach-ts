import type { ValidateOpts } from './validateOpts.js';
import type { Batcher } from './batch.js';
import { newBatch } from './batch.js';
import { BatchHeader, newBatchHeader } from './batchHeader.js';
import { EntryDetail } from './entryDetail.js';
import { IATBatch } from './iatBatch.js';
import { IATBatchHeader } from './iatBatchHeader.js';
import { IATEntryDetail } from './iatEntryDetail.js';
import { File, newFile } from './file.js';

/**
 * Size constraints applied per output file.
 * When a group exceeds these limits it is further split into multiple files.
 */
export interface SplitConditions {
  /** Maximum number of 94-character records per output file (default: 10,000). */
  maxLines?: number;
  /** Maximum total dollar amount (debit + credit, in cents) per output file. */
  maxDollarAmount?: number;
  /** Maximum number of EntryDetail / IATEntryDetail records per output file. */
  maxEntries?: number;
  /** Maximum number of batches per output file. */
  maxBatches?: number;
}

/**
 * Options controlling how a file is split.
 *
 * There are three grouping modes (only one should be set):
 *
 * 1. `groupEntry` — entry-level: each entry is assigned a group key. Entries
 *    from the same source batch may be placed into different output files.
 *    Addenda records always travel with their parent entry.
 *
 * 2. `groupBatch` — batch-level: each batch is assigned a group key.
 *    Batches are never broken apart.
 *
 * 3. `validateEntry` — validity split: entries that fail validation go into an
 *    "invalid" group, valid entries into a "valid" group.
 *
 * If none of the grouping modes are set, entries are all placed in a single
 * group and only `conditions` (size limits) drive the splitting.
 */
export interface SplitOptions {
  /**
   * Assign each regular entry to a group key. Entries with the same key
   * land in the same output file. When set, entry-level splitting is used
   * and batch boundaries from the source file are not preserved.
   */
  groupEntry?: (entry: EntryDetail, batchHeader: BatchHeader) => string;

  /**
   * Assign each IAT entry to a group key.
   * If omitted when `groupEntry` is set, IAT batches are placed whole
   * into the default group.
   */
  groupIATEntry?: (entry: IATEntryDetail, batchHeader: IATBatchHeader) => string;

  /**
   * Assign each batch to a group key. Batches are never split — the
   * entire batch moves into the group indicated by the key.
   * Ignored if `groupEntry` is set (entry-level takes priority).
   */
  groupBatch?: (batchHeader: BatchHeader) => string;

  /**
   * Assign each IAT batch to a group key.
   * Ignored if `groupIATEntry` is set.
   */
  groupIATBatch?: (batchHeader: IATBatchHeader) => string;

  /**
   * When true, split entries by validation result. Entries that pass
   * `entry.validate()` go into the "valid" group; those that fail go
   * into "invalid". Produces at most two groups.
   *
   * Can be combined with `conditions` for further size-based splitting.
   * Ignored if `groupEntry` or `groupBatch` is set.
   */
  validateEntry?: boolean;

  /**
   * Custom entry validation function. When set alongside `validateEntry`,
   * this function is called instead of `entry.validate()`. Return `null`
   * for valid entries, or an `Error` for invalid ones.
   */
  entryValidator?: (entry: EntryDetail, batchHeader: BatchHeader) => Error | null;

  /**
   * Custom IAT entry validation function. When set alongside `validateEntry`,
   * this function is called instead of `entry.validate()`.
   */
  iatEntryValidator?: (entry: IATEntryDetail, batchHeader: IATBatchHeader) => Error | null;

  /** Size constraints applied per output file within each group. */
  conditions?: SplitConditions;
}

// ── Internal types ──────────────────────────────────────────────────

/** Accumulates batches/entries destined for one output file. */
interface FileBucket {
  batches: Batcher[];
  iatBatches: IATBatch[];
}

/**
 * Tracks running totals for a file being filled, so we know when to rotate.
 */
interface FileFillState {
  lines: number;       // current line count (excluding padding)
  dollars: number;     // total amount in cents
  entries: number;     // entry count
  batchCount: number;  // batch count
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Split an ACH file into multiple files according to the provided options.
 *
 * Returns a `Map<string, File[]>` where each key is a group name and the
 * value is one or more valid ACH files containing the entries/batches for
 * that group.
 */
export function splitFile(
  file: File,
  options: SplitOptions,
): [Map<string, File[]>, Error | null] {
  // Determine which grouping strategy to use
  if (options.groupEntry || options.groupIATEntry) {
    return splitByEntry(file, options);
  }
  if (options.groupBatch || options.groupIATBatch) {
    return splitByBatch(file, options);
  }
  if (options.validateEntry) {
    return splitByValidity(file, options);
  }
  // No grouping mode — just apply size constraints (or return the file as-is)
  return splitByBatch(file, {
    ...options,
    groupBatch: () => 'default',
    groupIATBatch: () => 'default',
  });
}

// ── Batch-level splitting ───────────────────────────────────────────

function splitByBatch(
  file: File,
  options: SplitOptions,
): [Map<string, File[]>, Error | null] {
  const groupBatch = options.groupBatch ?? (() => 'default');
  const groupIATBatch = options.groupIATBatch ?? (() => 'default');

  // Assign batches to groups
  const groups = new Map<string, FileBucket>();

  for (const batch of file.batches) {
    const key = groupBatch(batch.getHeader());
    getOrCreateBucket(groups, key).batches.push(batch);
  }

  for (const iatBatch of file.iatBatches) {
    const key = groupIATBatch(iatBatch.header);
    getOrCreateBucket(groups, key).iatBatches.push(iatBatch);
  }

  // Build output files per group, respecting size constraints
  return buildOutputFiles(groups, file, options.conditions);
}

// ── Entry-level splitting ───────────────────────────────────────────

function splitByEntry(
  file: File,
  options: SplitOptions,
): [Map<string, File[]>, Error | null] {
  const groupEntry = options.groupEntry ?? (() => 'default');
  const groupIATEntry = options.groupIATEntry;

  // Group regular entries
  // Key: groupKey → Map<headerSignature, { header, entries[] }>
  const entryGroups = new Map<string, Map<string, { header: BatchHeader; entries: EntryDetail[] }>>();

  for (const batch of file.batches) {
    const bh = batch.getHeader();
    const sig = batchHeaderSignature(bh);

    for (const entry of batch.getEntries()) {
      const key = groupEntry(entry, bh);

      if (!entryGroups.has(key)) {
        entryGroups.set(key, new Map());
      }
      const sigMap = entryGroups.get(key)!;
      if (!sigMap.has(sig)) {
        sigMap.set(sig, { header: bh, entries: [] });
      }
      sigMap.get(sig)!.entries.push(entry);
    }
  }

  // Build batches from grouped entries
  const groups = new Map<string, FileBucket>();

  for (const [key, sigMap] of entryGroups) {
    const bucket = getOrCreateBucket(groups, key);
    for (const [, group] of sigMap) {
      const result = buildBatchFromEntries(group.header, group.entries);
      if (result[1]) return [new Map(), result[1]];
      bucket.batches.push(result[0]!);
    }
  }

  // Group IAT entries
  if (groupIATEntry) {
    const iatGroups = new Map<string, Map<string, { header: IATBatchHeader; entries: IATEntryDetail[] }>>();

    for (const iatBatch of file.iatBatches) {
      const bh = iatBatch.header;
      const sig = iatBatchHeaderSignature(bh);

      for (const entry of iatBatch.entries) {
        const key = groupIATEntry(entry, bh);

        if (!iatGroups.has(key)) {
          iatGroups.set(key, new Map());
        }
        const sigMap = iatGroups.get(key)!;
        if (!sigMap.has(sig)) {
          sigMap.set(sig, { header: bh, entries: [] });
        }
        sigMap.get(sig)!.entries.push(entry);
      }
    }

    for (const [key, sigMap] of iatGroups) {
      const bucket = getOrCreateBucket(groups, key);
      for (const [, group] of sigMap) {
        const iatBatch = buildIATBatchFromEntries(group.header, group.entries);
        bucket.iatBatches.push(iatBatch);
      }
    }
  } else {
    // No IAT grouping function — place IAT batches whole into default group
    for (const iatBatch of file.iatBatches) {
      getOrCreateBucket(groups, 'default').iatBatches.push(iatBatch);
    }
  }

  return buildOutputFiles(groups, file, options.conditions);
}

// ── Validity splitting ──────────────────────────────────────────────

function splitByValidity(
  file: File,
  options: SplitOptions,
): [Map<string, File[]>, Error | null] {
  const entryValidator = options.entryValidator ?? ((entry: EntryDetail) => entry.validate());
  const iatEntryValidator = options.iatEntryValidator ?? ((entry: IATEntryDetail) => entry.validate());

  // Split regular entries by validity
  const entryGroups = new Map<string, Map<string, { header: BatchHeader; entries: EntryDetail[] }>>();

  for (const batch of file.batches) {
    const bh = batch.getHeader();
    const sig = batchHeaderSignature(bh);

    for (const entry of batch.getEntries()) {
      const err = entryValidator(entry, bh);
      const key = err ? 'invalid' : 'valid';

      if (!entryGroups.has(key)) {
        entryGroups.set(key, new Map());
      }
      const sigMap = entryGroups.get(key)!;
      if (!sigMap.has(sig)) {
        sigMap.set(sig, { header: bh, entries: [] });
      }
      sigMap.get(sig)!.entries.push(entry);
    }
  }

  const groups = new Map<string, FileBucket>();

  for (const [key, sigMap] of entryGroups) {
    const bucket = getOrCreateBucket(groups, key);
    const batchOpts: ValidateOpts | undefined = key === 'invalid' ? { skipAll: true } : undefined;
    for (const [, group] of sigMap) {
      const result = buildBatchFromEntries(group.header, group.entries, batchOpts);
      if (result[1]) return [new Map(), result[1]];
      bucket.batches.push(result[0]!);
    }
  }

  // Split IAT entries by validity
  const iatEntryGroups = new Map<string, Map<string, { header: IATBatchHeader; entries: IATEntryDetail[] }>>();

  for (const iatBatch of file.iatBatches) {
    const bh = iatBatch.header;
    const sig = iatBatchHeaderSignature(bh);

    for (const entry of iatBatch.entries) {
      const err = iatEntryValidator(entry, bh);
      const key = err ? 'invalid' : 'valid';

      if (!iatEntryGroups.has(key)) {
        iatEntryGroups.set(key, new Map());
      }
      const sigMap = iatEntryGroups.get(key)!;
      if (!sigMap.has(sig)) {
        sigMap.set(sig, { header: bh, entries: [] });
      }
      sigMap.get(sig)!.entries.push(entry);
    }
  }

  for (const [key, sigMap] of iatEntryGroups) {
    const bucket = getOrCreateBucket(groups, key);
    const batchOpts: ValidateOpts | undefined = key === 'invalid' ? { skipAll: true } : undefined;
    for (const [, group] of sigMap) {
      const iatBatch = buildIATBatchFromEntries(group.header, group.entries, batchOpts);
      bucket.iatBatches.push(iatBatch);
    }
  }

  // Build the valid files normally; build invalid files with skipAll so they don't re-fail
  return buildOutputFilesWithValidity(groups, file, options.conditions);
}

// ── Output file construction ────────────────────────────────────────

/**
 * Given grouped buckets, build output File objects respecting size constraints.
 */
function buildOutputFiles(
  groups: Map<string, FileBucket>,
  sourceFile: File,
  conditions?: SplitConditions,
): [Map<string, File[]>, Error | null] {
  const result = new Map<string, File[]>();

  for (const [key, bucket] of groups) {
    const [files, err] = buildFilesFromBucket(bucket, sourceFile, conditions);
    if (err) return [new Map(), err];
    if (files.length > 0) {
      result.set(key, files);
    }
  }

  return [result, null];
}

/**
 * Like buildOutputFiles but sets skipAll on the "invalid" group so that
 * the invalid file can be created without re-triggering validation errors.
 */
function buildOutputFilesWithValidity(
  groups: Map<string, FileBucket>,
  sourceFile: File,
  conditions?: SplitConditions,
): [Map<string, File[]>, Error | null] {
  const result = new Map<string, File[]>();

  for (const [key, bucket] of groups) {
    const opts: ValidateOpts | undefined = key === 'invalid'
      ? { ...sourceFile.validateOpts, skipAll: true }
      : sourceFile.validateOpts;

    const [files, err] = buildFilesFromBucket(bucket, sourceFile, conditions, opts);
    if (err) return [new Map(), err];
    if (files.length > 0) {
      result.set(key, files);
    }
  }

  return [result, null];
}

/**
 * Build one or more files from a bucket, splitting further if conditions are exceeded.
 */
function buildFilesFromBucket(
  bucket: FileBucket,
  sourceFile: File,
  conditions?: SplitConditions,
  overrideOpts?: ValidateOpts,
): [File[], Error | null] {
  const allBatches = bucket.batches;
  const allIATBatches = bucket.iatBatches;

  if (allBatches.length === 0 && allIATBatches.length === 0) {
    return [[], null];
  }

  if (!conditions) {
    // No size limits — single file
    const [f, err] = assembleFile(allBatches, allIATBatches, sourceFile, overrideOpts);
    if (err) return [[], err];
    return [[f!], null];
  }

  // Apply size constraints — accumulate batches into files
  const files: File[] = [];
  let currentBatches: Batcher[] = [];
  let currentIATBatches: IATBatch[] = [];
  let state: FileFillState = newFillState();

  const flush = (): Error | null => {
    if (currentBatches.length === 0 && currentIATBatches.length === 0) return null;
    const [f, err] = assembleFile(currentBatches, currentIATBatches, sourceFile, overrideOpts);
    if (err) return err;
    files.push(f!);
    currentBatches = [];
    currentIATBatches = [];
    state = newFillState();
    return null;
  };

  // Add regular batches
  for (const batch of allBatches) {
    const batchLines = 2 + batch.getControl().entryAddendaCount; // header + control + entries/addenda
    const batchDollars = batch.getControl().totalDebitEntryDollarAmount
      + batch.getControl().totalCreditEntryDollarAmount;
    const batchEntries = batch.getEntries().length + batch.getADVEntries().length;

    if (wouldExceed(state, batchLines, batchDollars, batchEntries, 1, conditions) && hasContent(state)) {
      const err = flush();
      if (err) return [[], err];
    }

    currentBatches.push(batch);
    state.lines += batchLines;
    state.dollars += batchDollars;
    state.entries += batchEntries;
    state.batchCount += 1;
  }

  // Add IAT batches
  for (const iatBatch of allIATBatches) {
    const batchLines = 2 + iatBatch.control.entryAddendaCount;
    const batchDollars = iatBatch.control.totalDebitEntryDollarAmount
      + iatBatch.control.totalCreditEntryDollarAmount;
    const batchEntries = iatBatch.entries.length;

    if (wouldExceed(state, batchLines, batchDollars, batchEntries, 1, conditions) && hasContent(state)) {
      const err = flush();
      if (err) return [[], err];
    }

    currentIATBatches.push(iatBatch);
    state.lines += batchLines;
    state.dollars += batchDollars;
    state.entries += batchEntries;
    state.batchCount += 1;
  }

  // Flush remaining
  const err = flush();
  if (err) return [[], err];

  return [files, null];
}

/**
 * Assemble a single File from batches, copying the source file's header.
 */
function assembleFile(
  batches: Batcher[],
  iatBatches: IATBatch[],
  sourceFile: File,
  overrideOpts?: ValidateOpts,
): [File | null, Error | null] {
  const f = newFile();
  const opts = overrideOpts ?? sourceFile.validateOpts;
  if (opts) {
    f.setValidation(opts);
  }

  sourceFile.addFileHeaderData(f);

  for (const batch of batches) {
    batch.getHeader().batchNumber = 0; // reset so create() assigns sequentially
    f.addBatch(batch);
  }
  for (const iatBatch of iatBatches) {
    iatBatch.header.batchNumber = 0;
    f.addIATBatch(iatBatch);
  }

  const createErr = f.create();
  if (createErr) return [null, createErr];

  // Only validate if not skipping
  if (!opts?.skipAll) {
    const valErr = f.validate();
    if (valErr) return [null, valErr];
  }

  return [f, null];
}

// ── Batch construction helpers ──────────────────────────────────────

function buildBatchFromEntries(
  sourceBatchHeader: BatchHeader,
  entries: EntryDetail[],
  opts?: ValidateOpts,
): [Batcher | null, Error | null] {
  const bh = cloneBatchHeader(sourceBatchHeader);
  const [batch, err] = newBatch(bh);
  if (err || !batch) return [null, err ?? new Error('failed to create batch')];

  if (opts) {
    batch.setValidation(opts);
  }

  for (const entry of entries) {
    entry.traceNumber = ''; // clear so build() regenerates
    batch.addEntry(entry);
  }

  const createErr = batch.create();
  if (createErr) return [null, createErr];

  return [batch, null];
}

function buildIATBatchFromEntries(
  sourceBatchHeader: IATBatchHeader,
  entries: IATEntryDetail[],
  opts?: ValidateOpts,
): IATBatch {
  const bh = cloneIATBatchHeader(sourceBatchHeader);
  const iatBatch = new IATBatch(bh);

  if (opts) {
    iatBatch.setValidation(opts);
  }

  for (const entry of entries) {
    entry.traceNumber = ''; // clear so build() regenerates
    iatBatch.addEntry(entry);
  }

  iatBatch.create();
  return iatBatch;
}

function cloneBatchHeader(bh: BatchHeader): BatchHeader {
  const nbh = newBatchHeader();
  nbh.serviceClassCode = bh.serviceClassCode;
  nbh.companyName = bh.companyName;
  nbh.companyDiscretionaryData = bh.companyDiscretionaryData;
  nbh.companyIdentification = bh.companyIdentification;
  nbh.standardEntryClassCode = bh.standardEntryClassCode;
  nbh.companyEntryDescription = bh.companyEntryDescription;
  nbh.companyDescriptiveDate = bh.companyDescriptiveDate;
  nbh.effectiveEntryDate = bh.effectiveEntryDate;
  nbh.settlementDate = bh.settlementDate;
  nbh.originatorStatusCode = bh.originatorStatusCode;
  nbh.odfiIdentification = bh.odfiIdentification;
  return nbh;
}

function cloneIATBatchHeader(bh: IATBatchHeader): IATBatchHeader {
  const nbh = IATBatchHeader.newIATBatchHeader();
  nbh.serviceClassCode = bh.serviceClassCode;
  nbh.iatIndicator = bh.iatIndicator;
  nbh.foreignExchangeIndicator = bh.foreignExchangeIndicator;
  nbh.foreignExchangeReferenceIndicator = bh.foreignExchangeReferenceIndicator;
  nbh.foreignExchangeReference = bh.foreignExchangeReference;
  nbh.isoDestinationCountryCode = bh.isoDestinationCountryCode;
  nbh.originatorIdentification = bh.originatorIdentification;
  nbh.standardEntryClassCode = bh.standardEntryClassCode;
  nbh.companyEntryDescription = bh.companyEntryDescription;
  nbh.isoOriginatingCurrencyCode = bh.isoOriginatingCurrencyCode;
  nbh.isoDestinationCurrencyCode = bh.isoDestinationCurrencyCode;
  nbh.odfiIdentification = bh.odfiIdentification;
  nbh.effectiveEntryDate = bh.effectiveEntryDate;
  nbh.originatorStatusCode = bh.originatorStatusCode;
  return nbh;
}

// ── Signature helpers (for grouping entries from compatible batches) ─

function batchHeaderSignature(bh: BatchHeader): string {
  return [
    bh.serviceClassCode,
    bh.companyName.trim(),
    bh.companyIdentification.trim(),
    bh.standardEntryClassCode,
    bh.companyEntryDescription.trim(),
    bh.odfiIdentification,
    bh.effectiveEntryDate,
    bh.originatorStatusCode,
  ].join('|');
}

function iatBatchHeaderSignature(bh: IATBatchHeader): string {
  return [
    bh.serviceClassCode,
    bh.foreignExchangeIndicator,
    bh.foreignExchangeReferenceIndicator,
    bh.isoDestinationCountryCode,
    bh.originatorIdentification.trim(),
    bh.standardEntryClassCode,
    bh.companyEntryDescription.trim(),
    bh.isoOriginatingCurrencyCode,
    bh.isoDestinationCurrencyCode,
    bh.odfiIdentification,
    bh.effectiveEntryDate,
    bh.originatorStatusCode,
  ].join('|');
}

// ── Size constraint helpers ─────────────────────────────────────────

function newFillState(): FileFillState {
  return { lines: 2, dollars: 0, entries: 0, batchCount: 0 }; // 2 = file header + file control
}

function hasContent(state: FileFillState): boolean {
  return state.batchCount > 0;
}

function wouldExceed(
  state: FileFillState,
  addLines: number,
  addDollars: number,
  addEntries: number,
  addBatches: number,
  conditions: SplitConditions,
): boolean {
  if (conditions.maxLines !== undefined && (state.lines + addLines) > conditions.maxLines) {
    return true;
  }
  if (conditions.maxDollarAmount !== undefined && (state.dollars + addDollars) > conditions.maxDollarAmount) {
    return true;
  }
  if (conditions.maxEntries !== undefined && (state.entries + addEntries) > conditions.maxEntries) {
    return true;
  }
  if (conditions.maxBatches !== undefined && (state.batchCount + addBatches) > conditions.maxBatches) {
    return true;
  }
  return false;
}

// ── Utilities ───────────────────────────────────────────────────────

function getOrCreateBucket(groups: Map<string, FileBucket>, key: string): FileBucket {
  let bucket = groups.get(key);
  if (!bucket) {
    bucket = { batches: [], iatBatches: [] };
    groups.set(key, bucket);
  }
  return bucket;
}
