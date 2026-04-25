# ach-ts

A TypeScript library for creating, parsing, validating, and writing ACH (Automated Clearing House) files conforming to NACHA specifications. Ported from the [moov-io/ach](https://github.com/moov-io/ach) Go library with additional TypeScript-specific features.

## Installation

```bash
npm install ach-ts
```

Requires Node.js 18+ and TypeScript 5.0+.

## Features

- Parse and write NACHA fixed-width ACH files (94-character records)
- JSON serialization and deserialization with Go-compatible key mapping
- Full NACHA validation with 23 configurable bypass flags (`ValidateOpts`)
- All 23 Standard Entry Class (SEC) batch types
- All 17 addenda record types (02, 05, 10--18, 98, 98Refused, 99, 99Dishonored, 99Contested)
- International ACH Transactions (IAT) with dedicated batch, header, and entry types
- Automated Accounting Advices (ADV) records
- File merging with line count and dollar amount limits
- File segmentation (split by credit/debit)
- Batch flattening (merge compatible batches)
- Reversal generation (swap debit/credit transaction codes)
- Memory-efficient streaming iteration over entries
- Directory scanning and batch processing
- TXP (tax payment) format parsing
- Two-tier validation: fast-fail (`validate()`) and exhaustive (`validateAll()`)
- Structured errors with line numbers, column positions, and stable error codes for LSP/IDE integration
## Quick Start

### Parse an ACH file

```typescript
import { Reader } from 'ach-ts';
import { readFileSync } from 'fs';

const contents = readFileSync('input.ach', 'utf-8');
const reader = new Reader(contents);
const file = reader.read();

console.log(file.header.immediateDestinationName);
for (const batch of file.batches) {
  for (const entry of batch.getEntries()) {
    console.log(entry.individualName, entry.amount);
  }
}
```

### Create an ACH file programmatically

```typescript
import {
  newFile, newFileHeader, newBatchHeader, newEntryDetail, newBatch,
  Writer, PPD, CheckingCredit,
} from 'ach-ts';

const fh = newFileHeader();
fh.immediateDestination = '231380104';
fh.immediateOrigin = '121042882';
fh.fileCreationDate = '190614';
fh.immediateDestinationName = 'Citadel';
fh.immediateOriginName = 'Wells Fargo';

const bh = newBatchHeader();
bh.serviceClassCode = 200;
bh.companyName = 'Your Company';
bh.companyIdentification = '121042882';
bh.standardEntryClassCode = PPD;
bh.companyEntryDescription = 'Payroll';
bh.effectiveEntryDate = '190614';
bh.odfiIdentification = '12104288';

const entry = newEntryDetail();
entry.transactionCode = CheckingCredit;
entry.rdfiIdentification = '23138010';
entry.checkDigit = '4';
entry.dfiAccountNumber = '81967038518';
entry.amount = 100000; // $1,000.00 in cents
entry.individualName = 'John Doe';
entry.traceNumber = '121042880000001';

const batch = newBatch(bh);
batch.addEntry(entry);

const file = newFile();
file.setHeader(fh);
file.addBatch(batch);
file.create();

const writer = new Writer();
const output = writer.write(file);
```

### Write to string

```typescript
import { Writer } from 'ach-ts';

const writer = new Writer({ lineEnding: '\r\n' }); // CRLF for Windows
const achString = writer.write(file);
```

### JSON round-trip

```typescript
import { fileFromJSON } from 'ach-ts';

// Parse JSON (accepts Go-style PascalCase or TypeScript camelCase keys)
const file = fileFromJSON(jsonString);

// Serialize back to JSON
const json = JSON.stringify(file.toJSON(), null, 2);
```

### Merge files

```typescript
import { mergeFiles, mergeFilesWith } from 'ach-ts';

// Merge with default 10,000-line NACHA limit
const [merged, err] = mergeFiles(files);

// Merge with custom limits
const [merged2, err2] = mergeFilesWith(files, {
  maxLines: 5000,
  maxDollarAmount: 1_000_000_00, // $1M in cents
});
```

### Validate with custom options

```typescript
import { Reader } from 'ach-ts';
import type { ValidateOpts } from 'ach-ts';

const opts: ValidateOpts = {
  allowZeroBatches: true,
  customTraceNumbers: true,
  bypassCompanyIdentificationMatch: true,
};

const reader = new Reader(contents);
reader.setValidation(opts);
const file = reader.read();

// Fast-fail: returns the first error found
const err = file.validate();

// Exhaustive: returns all validation errors
const allErrors = file.validateAll();
```

### Iterate entries (memory-efficient)

```typescript
import { Iterator } from 'ach-ts';

const iter = new Iterator(achContents);
while (true) {
  const [batchHeader, entry, err] = iter.nextEntry();
  if (err) break;
  if (!entry) break;
  console.log(entry.individualName, entry.amount);
}
```

### Read a directory of ACH files

```typescript
import { readDir, mergeDir } from 'ach-ts';

const [files, err] = await readDir('/path/to/ach/files');
const [merged, mergeErr] = await mergeDir('/path/to/ach/files');
```

## Architecture

### Record Hierarchy

An ACH file is a sequence of 94-character fixed-width records. The library models each record type as a class with `parse()`, `string()`, and `validate()` methods.

```
File
  FileHeader          (record type "1")
  Batch[]
    BatchHeader       (record type "5")
    EntryDetail[]     (record type "6")
      Addenda[]       (record type "7")
    BatchControl      (record type "8")
  FileControl         (record type "9")
```

The `File` class holds an array of `Batcher` instances (regular batches) and an array of `IATBatch` instances (international batches). Each batch contains entry details and their associated addenda records.

### Batch Type System

Every SEC code has a corresponding batch class that enforces type-specific validation rules. Batch types are registered at import time via a runtime registry:

```typescript
import { newBatch, convertBatchType, registerBatchType } from 'ach-ts';

// newBatch() creates the correct batch subclass based on the SEC code in the header
const batch = newBatch(batchHeader); // Returns BatchPPD, BatchCCD, etc.

// convertBatchType() converts an existing batch to a different SEC type
const converted = convertBatchType(batch, 'CCD');
```

The 23 supported SEC codes and their batch classes are:

| SEC Code | Description | Class |
|----------|-------------|-------|
| ACK | Acknowledgment | `BatchACK` |
| ADV | Automated Accounting Advice | `BatchADV` |
| ARC | Accounts Receivable Check | `BatchARC` |
| ATX | Acknowledgment (Tax) | `BatchATX` |
| BOC | Back Office Conversion | `BatchBOC` |
| CCD | Corporate Credit or Debit | `BatchCCD` |
| CIE | Customer Initiated Entry | `BatchCIE` |
| COR | Notification of Change | `BatchCOR` |
| CTX | Corporate Trade Exchange | `BatchCTX` |
| DNE | Death Notification Entry | `BatchDNE` |
| ENR | Automated Enrollment Entry | `BatchENR` |
| IAT | International ACH Transaction | `IATBatch` |
| MTE | Machine Transfer Entry | `BatchMTE` |
| POP | Point of Purchase | `BatchPOP` |
| POS | Point of Sale | `BatchPOS` |
| PPD | Prearranged Payment and Deposit | `BatchPPD` |
| RCK | Re-presented Check | `BatchRCK` |
| SHR | Shared Network Transaction | `BatchSHR` |
| TEL | Telephone-Initiated Entry | `BatchTEL` |
| TRC | Truncated Check Entry | `BatchTRC` |
| TRX | Check Truncation Exchange | `BatchTRX` |
| WEB | Internet-Initiated Entry | `BatchWEB` |
| XCK | Destroyed Check Entry | `BatchXCK` |

### Addenda Records

| Type Code | Class | Purpose |
|-----------|-------|---------|
| 02 | `Addenda02` | POS/SHR/MTE terminal information |
| 05 | `Addenda05` | General-purpose payment information |
| 10 | `Addenda10` | IAT transaction type and foreign payment |
| 11 | `Addenda11` | IAT originator name and address |
| 12 | `Addenda12` | IAT originator city/state/country |
| 13 | `Addenda13` | IAT ODFI information |
| 14 | `Addenda14` | IAT RDFI information |
| 15 | `Addenda15` | IAT receiver identification |
| 16 | `Addenda16` | IAT receiver address |
| 17 | `Addenda17` | IAT remittance information (max 2 per entry) |
| 18 | `Addenda18` | IAT foreign correspondent bank (max 5 per entry) |
| 98 | `Addenda98` | Notification of Change (19 change codes) |
| 98 (refused) | `Addenda98Refused` | Refused Notification of Change |
| 99 | `Addenda99` | Return (54 return codes) |
| 99 (dishonored) | `Addenda99Dishonored` | Dishonored return (R61, R62, R67--R70) |
| 99 (contested) | `Addenda99Contested` | Contested return (R71--R77) |

### IAT (International ACH Transactions)

International entries use dedicated types that carry additional fields for foreign exchange, country codes (ISO 3166), and currency codes (ISO 4217):

- `IATBatchHeader` -- batch header with foreign exchange indicator and reference fields
- `IATEntryDetail` -- entry detail with Addenda10--18 slots
- `IATBatch` -- batch container with IAT-specific validation

### ADV (Automated Accounting Advices)

ADV entries use separate record types with different field layouts, including 20-digit dollar amount fields and accounting transaction codes (81--88):

- `ADVEntryDetail`
- `ADVBatchControl`
- `ADVFileControl`

## API Reference

### File Operations

| Export | Description |
|--------|-------------|
| `File` | Main file class: `create()`, `validate()`, `validateAll()`, `toJSON()`, `reversal()`, `segmentFile()`, `flattenBatches()` |
| `newFile()` | Create a new empty File |
| `fileFromJSON(json)` | Parse a JSON string into a File |
| `fileFromJSONWith(json, opts)` | Parse JSON with custom ValidateOpts |
| `Reader` | Parse NACHA fixed-width text into a File |
| `Writer` | Serialize a File to NACHA fixed-width text |
| `writeFile(file)` | Convenience function to write a File to string |

### Merging and Processing

| Export | Description |
|--------|-------------|
| `mergeFiles(files)` | Merge files with default 10,000-line limit |
| `mergeFilesWith(files, conditions)` | Merge with custom line/dollar limits |
| `newMerger(opts)` | Create a Merger with custom ValidateOpts |
| `Iterator` | Memory-efficient line-by-line entry processing |
| `readDir(path)` | Parse all ACH files in a directory |
| `mergeDir(path)` | Read and merge all ACH files in a directory |
| `mergeDirWith(path, conditions)` | Read and merge with custom limits |

### Batch Factory

| Export | Description |
|--------|-------------|
| `newBatch(header)` | Create the correct batch subclass from a BatchHeader |
| `convertBatchType(batch, sec)` | Convert a batch to a different SEC type |
| `registerBatchType(sec, factory)` | Register a custom batch type |

### Utilities

| Export | Description |
|--------|-------------|
| `CalculateCheckDigit(routingNumber)` | Compute the check digit for a routing number |
| `CheckRoutingNumber(routingNumber)` | Validate a 9-digit ABA routing number |
| `parseTXP(paymentInfo)` | Parse TXP-formatted tax payment data |
| `txpString(txp)` | Serialize a TXP object to string |
| `isTXPFormat(paymentInfo)` | Check if a string follows TXP format |
| `allSpaces(s)` | Check if a string is all whitespace |

### Configuration Types

| Type | Description |
|------|-------------|
| `ValidateOpts` | 23 boolean validation bypass flags + custom `checkTransactionCode` callback |
| `Conditions` | Merge constraints: `maxLines`, `maxDollarAmount` |
| `WriteOpts` | Writer configuration: `lineEnding` |
| `Offset` | Offset record configuration: routing, account, type, description |

### Error Classes

| Class | Description |
|-------|-------------|
| `ACHError` | Base error with `code` and `severity` fields |
| `FieldError` | Field-level error with field name, value, and column positions |
| `BatchError` | Batch-level error with batch number, SEC code, and field context |
| `FileError` | File-level structural error |
| `ParseError` | Reader parse error with line number and column range |

All errors carry optional `line`, `startColumn`, `endColumn`, and `relatedLocations` fields for IDE diagnostic integration.

## ValidateOpts

The `ValidateOpts` interface controls which validation rules to enforce or bypass. Pass it to `Reader.setValidation()`, `File.setValidation()`, or `fileFromJSONWith()`.

| Flag | Default | Description |
|------|---------|-------------|
| `skipAll` | `false` | Disable all validation |
| `requireABAOrigin` | `false` | Require valid ABA routing number as origin |
| `bypassOriginValidation` | `false` | Skip origin field validation |
| `bypassDestinationValidation` | `false` | Skip destination field validation |
| `customTraceNumbers` | `false` | Allow trace numbers that don't match ODFI |
| `allowZeroBatches` | `false` | Allow files with no batches |
| `allowMissingFileHeader` | `false` | Allow files without a FileHeader record |
| `allowMissingFileControl` | `false` | Allow files without a FileControl record |
| `bypassCompanyIdentificationMatch` | `false` | Skip batch header/control company ID match |
| `customReturnCodes` | `false` | Allow non-standard return codes in Addenda99 |
| `unequalServiceClassCode` | `false` | Allow mismatched service class codes |
| `allowUnorderedBatchNumbers` | `false` | Allow non-ascending batch numbers |
| `allowInvalidCheckDigit` | `false` | Skip routing number check digit validation |
| `unequalAddendaCounts` | `false` | Allow addenda count mismatches |
| `preserveSpaces` | `false` | Retain trailing whitespace during parsing |
| `allowInvalidAmounts` | `false` | Allow malformed amount fields |
| `allowZeroEntryAmount` | `false` | Allow entries with zero dollar amounts |
| `allowSpecialCharacters` | `false` | Allow non-alphanumeric characters in fields |
| `allowEmptyIndividualName` | `false` | Allow blank individual name fields |
| `bypassBatchValidation` | `false` | Skip all batch-level validation |
| `skipFileCreationValidation` | `false` | Skip file creation date validation |
| `skipBatchHeaderCompanyValidation` | `false` | Skip company name/ID validation in batch headers |
| `checkTransactionCode` | `undefined` | Custom callback `(code: number) => Error \| null` |

### Two-Tier Validation

Every record level (File, Batch, Entry, Addenda) supports two validation modes:

- **`validate()`** -- returns the first error encountered (fast-fail). Use for quick pass/fail checks.
- **`validateAll()`** -- accumulates and returns all errors as an array. Use for comprehensive diagnostics, editor integrations, or showing all problems to a user at once.

## Design Decisions

This library is a port of the [moov-io/ach](https://github.com/moov-io/ach) Go library. The following table summarizes how Go patterns were translated to TypeScript.

| Go Pattern | TypeScript Equivalent |
|------------|----------------------|
| Embedded `validators` / `converters` interfaces | Stateless singleton objects (`converters`, `validators`) imported and called directly by each class |
| `Batcher` interface with 23 concrete types | `Batcher` TypeScript interface + abstract `Batch` base class + 23 subclasses + runtime registry via `registerBatchType()` |
| `io.Reader` / `io.Writer` | String-based input and output |
| `sync.Pool` buffer reuse | Not needed -- JavaScript garbage collection handles buffer lifecycle |
| Returned `error` values | Custom `Error` subclasses (`ACHError`, `FieldError`, `BatchError`, `FileError`) thrown as exceptions |
| `json:"FieldName"` struct tags | Explicit key remapping dictionaries in `file.ts` for Go PascalCase to TypeScript camelCase conversion |
| Rune indexing (`[]rune(s)[n]`) | Spread into character array (`[...record]`) for Unicode-safe slicing |
| `strconv.Atoi` / `strconv.Itoa` | `parseInt()` / `String()` with NaN-safe defaults |
| Package-level sentinel error variables | Module-level frozen `const` exports (`ErrNonAlphanumeric`, `ErrFieldRequired`, etc.) |
| `time.Parse()` with layout strings | Multi-format `datetimeParse()` supporting ISO 8601, RFC 3339, and MM/DD/YYYY inputs |

### JSON Interoperability

The Go library uses PascalCase JSON keys derived from struct tags (e.g., `ODFIIdentification`, `RDFIIdentification`). The TypeScript library uses camelCase properties internally but maintains bidirectional key mapping so that:

- `fileFromJSON()` accepts both Go-style PascalCase and TypeScript camelCase keys
- `file.toJSON()` produces Go-compatible PascalCase keys for cross-language interoperability
- Addenda records are hydrated from plain JSON objects into their proper class instances

## TypeScript-Specific Additions

The following features are not present in the Go library and were added for the TypeScript port.

### Exhaustive Validation at Every Level

The Go library only supports collecting all errors at the file level. In ach-ts, `validateAll()` is available on `File`, `Batch`, `EntryDetail`, and all addenda types. This returns an `Error[]` with every validation failure rather than stopping at the first.

### Structured Error Positioning

Every error object can carry positional metadata:

```typescript
interface FieldError extends ACHError {
  fieldName: string;
  fieldValue?: unknown;
  line?: number;        // 1-based line number in the ACH file
  startColumn?: number; // 0-based start column in the 94-char record
  endColumn?: number;   // 0-based end column (exclusive)
  relatedLocations?: RelatedLocation[];
}
```

This makes errors directly mappable to editor diagnostics without any post-processing.

### Stable Error Codes and Severity

The `errorCodes` module assigns stable string codes (e.g., `"nonAlphanumeric"`, `"serviceClass"`) and severity levels (`"error"`, `"warning"`, `"info"`) to all sentinel errors. These survive serialization and can be used for filtering, grouping, or localization.

### Field Position Specifications

The `fieldPositions` module defines `FieldSpec` arrays for every record type, mapping each field name to its column range within the 94-character line. The `enrichErrors()` function uses these to annotate `FieldError` instances with column positions automatically.

### LSP Diagnostic Workflow

The `Reader.readWithErrors()` method returns both the (possibly partial) parsed file and an array of parse errors without throwing. Combined with `file.validateAll()` and the structured error properties, this provides a complete pipeline for building LSP language servers or editor extensions:

```typescript
const reader = new Reader(contents);
const { file, errors } = reader.readWithErrors();
if (errors.length === 0) {
  errors.push(...file.validateAll());
}
// Each error has line, startColumn, endColumn, code, severity
// Map directly to LSP Diagnostic[]
```

### TXP Tax Payment Parsing

The `parseTXP()`, `txpString()`, and `isTXPFormat()` functions handle TXP-formatted payment information strings used in Addenda05 records for tax payments. These parse and serialize the `TXP*` delimited format with tax identification numbers, payment type codes, dates, and amount breakdowns.

### Directory Utilities

The `readDir()`, `mergeDir()`, and `mergeDirWith()` async functions scan a directory for ACH files, attempting to parse each as NACHA fixed-width first and then as JSON. Only successfully parsed files are returned.

### Flexible DateTime Parsing

When deserializing from JSON, date fields accept ISO 8601, RFC 3339, and MM/DD/YYYY formats and are automatically converted to the YYMMDD and HHmm formats required by NACHA fixed-width records.

## Project Structure

```
src/
  index.ts                 Public API exports
  constants.ts             Record positions, SEC codes, transaction codes
  validateOpts.ts          ValidateOpts interface
  errors/index.ts          ACHError, FieldError, BatchError, FileError, sentinel errors
  errorCodes.ts            Stable error codes and severity assignments
  fieldPositions.ts        FieldSpec definitions for column-level error mapping
  utils/
    converters.ts          String/numeric field formatting
    validators.ts          Validation functions, check digit calculation
  fileHeader.ts            FileHeader record
  fileControl.ts           FileControl record
  batchHeader.ts           BatchHeader record
  batchControl.ts          BatchControl record
  entryDetail.ts           EntryDetail record
  addenda/
    addenda02.ts           POS/SHR/MTE terminal info
    addenda05.ts           General-purpose payment info
    addenda10.ts--18.ts    IAT addenda records
    addenda98.ts           Notification of Change
    addenda98Refused.ts    Refused NOC
    addenda99.ts           Returns
    addenda99Dishonored.ts Dishonored returns
    addenda99Contested.ts  Contested returns
    txp.ts                 TXP tax payment parsing
    index.ts               Barrel exports
  advEntryDetail.ts        ADV entry detail
  advBatchControl.ts       ADV batch control
  advFileControl.ts        ADV file control
  batch.ts                 Batch base class, Batcher interface, factory
  batches/
    BatchACK.ts--XCK.ts    23 SEC-specific batch implementations
    index.ts               Barrel exports + type registration
  iatBatchHeader.ts        IAT batch header
  iatEntryDetail.ts        IAT entry detail
  iatBatch.ts              IAT batch
  file.ts                  File class (create, validate, JSON, segment, flatten, reverse)
  reader.ts                ACH file parser
  writer.ts                ACH file writer
  merge.ts                 File merging with line/dollar limits
  iterator.ts              Memory-efficient entry iterator
  dir.ts                   Directory scanning utilities
test/
  testdata/                ACH and JSON fixture files
  33 test files            Unit, integration, round-trip, crasher resilience
```

## Testing

The test suite uses [Vitest](https://vitest.dev/) and contains 33 test files covering:

- **Unit tests** -- individual record types, converters, validators, addenda, batch types
- **Integration tests** -- full ACH file round-trip (parse, create, validate, write, re-parse)
- **JSON round-trip tests** -- JSON parse, serialize, re-parse; JSON-to-ACH cross-format
- **SEC code tests** -- all 22 SEC codes plus 6 IAT fixtures parsed, created, and validated
- **Crasher resilience** -- malformed and adversarial inputs
- **LSP diagnostic workflow** -- end-to-end structured error mapping

```bash
npm test           # Run all tests
npm run test:watch # Watch mode
```

## License

This project is licensed under the [MIT License](LICENSE.md).

Portions of this code are derived from [moov-io/ach](https://github.com/moov-io/ach), which is licensed under the Apache License 2.0. See [NOTICE](NOTICE) and [licenses/LICENSE_ach](licenses/LICENSE_ach) for details.
