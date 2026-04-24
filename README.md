# Port moov-io/ach Go Library to TypeScript

## Background

The moov-io/ach library is a comprehensive Go library for creating, parsing, validating, and writing ACH (Automated Clearing House) files conforming to NACHA specifications. The library contains **~53K lines** of Go source code and **~33K lines** of tests across 75+ source files.

### Key Features to Port
- **File parsing** (fixed-width NACHA format → structured objects)
- **File writing** (structured objects → fixed-width NACHA format)
- **JSON serialization/deserialization** of ACH files
- **Full NACHA validation** with configurable rules (`ValidateOpts`)
- **23 SEC (Standard Entry Class) batch types**: ACK, ADV, ARC, ATX, BOC, CCD, CIE, COR, CTX, DNE, ENR, IAT, MTE, POP, POS, PPD, RCK, SHR, TEL, TRC, TRX, WEB, XCK  
- **17 Addenda record types**: 02, 05, 10–18, 98, 98Refused, 99, 99Dishonored, 99Contested
- **File merging**, **file flattening**, **reversal generation**, **segment file configuration**, and **iteration**

## User Review Required

> [!IMPORTANT]
> This is a **massive undertaking** — approximately 85K+ lines of Go code (source + tests) to port. I propose implementing this in **8 phased milestones** so we can verify correctness incrementally. Each phase builds on the previous one.

> [!WARNING]
> Some Go idioms don't translate directly to TypeScript:
> - Go's **interface embedding** (validator, converters) → TypeScript **mixins or composition**
> - Go's **Batcher interface** with 23 implementations → TypeScript **abstract class + concrete subclasses**
> - Go's **sync.Pool** (buffer reuse in `perf.go`) → Not needed in JS (GC handles it)
> - Go's **io.Reader/io.Writer** → Node.js **streams** or **string-based** I/O
> - Go's **error handling** (returned errors) → TypeScript **custom Error classes**

## Proposed Changes

The TypeScript library will be organized as a Node.js package with the following structure:

```
/home/chris/coding/js/ach-ts/
├── src/
│   ├── index.ts                    # Public exports
│   ├── constants.ts                # Record positions, lengths, SEC codes, transaction codes
│   ├── errors/
│   │   ├── ACHError.ts             # Base error class
│   │   ├── FieldError.ts           # Field-level validation error
│   │   ├── BatchError.ts           # Batch-level validation error
│   │   ├── FileError.ts            # File-level errors
│   │   └── index.ts
│   ├── utils/
│   │   ├── converters.ts           # String/numeric field formatting
│   │   ├── validators.ts           # Validation functions
│   │   └── index.ts
│   ├── validateOpts.ts             # ValidateOpts interface
│   ├── fileHeader.ts               # FileHeader record
│   ├── fileControl.ts              # FileControl record
│   ├── batchHeader.ts              # BatchHeader record
│   ├── batchControl.ts             # BatchControl record
│   ├── entryDetail.ts              # EntryDetail record
│   ├── addenda/
│   │   ├── Addenda02.ts
│   │   ├── Addenda05.ts
│   │   ├── Addenda10.ts through Addenda18.ts
│   │   ├── Addenda98.ts
│   │   ├── Addenda98Refused.ts
│   │   ├── Addenda99.ts
│   │   ├── Addenda99Dishonored.ts
│   │   ├── Addenda99Contested.ts
│   │   └── index.ts
│   ├── advEntryDetail.ts           # ADV Entry Detail
│   ├── advBatchControl.ts          # ADV Batch Control
│   ├── advFileControl.ts           # ADV File Control
│   ├── batch.ts                    # Base Batch class + Batcher interface
│   ├── batches/
│   │   ├── BatchACK.ts through BatchXCK.ts (23 files)
│   │   └── index.ts
│   ├── iatBatchHeader.ts           # IAT Batch Header
│   ├── iatEntryDetail.ts           # IAT Entry Detail
│   ├── iatBatch.ts                 # IAT Batch
│   ├── file.ts                     # Main File class
│   ├── reader.ts                   # ACH file reader/parser
│   ├── writer.ts                   # ACH file writer
│   ├── merge.ts                    # File merging
│   ├── fileFlattener.ts            # File flattener
│   ├── reversal.ts                 # Reversal generation
│   ├── iterator.ts                 # File/batch iterators
│   └── segmentFileConfiguration.ts # Segment configuration
├── test/
│   ├── testdata/                   # Copied from Go project
│   ├── converters.test.ts
│   ├── validators.test.ts
│   ├── fileHeader.test.ts
│   ├── fileControl.test.ts
│   ├── batchHeader.test.ts
│   ├── batchControl.test.ts
│   ├── entryDetail.test.ts
│   ├── addenda02.test.ts through addenda99Contested.test.ts
│   ├── batch.test.ts
│   ├── batchPPD.test.ts through batchXCK.test.ts (23 files)
│   ├── iatBatch.test.ts
│   ├── file.test.ts
│   ├── reader.test.ts
│   ├── writer.test.ts
│   ├── merge.test.ts
│   ├── fileFlattener.test.ts
│   ├── reversal.test.ts
│   └── iterator.test.ts
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

### Phase 1: Foundation (Project Setup + Core Utilities)

#### [NEW] package.json, tsconfig.json, vitest.config.ts
- Initialize TypeScript project with Vitest for testing
- Configure ES modules, strict mode, path aliases

#### [NEW] src/constants.ts
- Port record position constants (`fileHeaderPos="1"`, etc.)
- Port `RecordLength = 94`
- Port all SEC codes (ACK, ADV, ARC, ... XCK)
- Port all TransactionCode constants (CheckingCredit=22, etc.)
- Port ServiceClassCode constants (200, 220, 225, 280)
- Port Category constants (Forward, Return, NOC, etc.)

#### [NEW] src/errors/
- Port `FieldError`, `BatchError`, `FileError` as TypeScript Error subclasses
- Port all sentinel errors (`ErrNonAlphanumeric`, `ErrConstructor`, etc.)
- Port structured error types (`ErrValidCheckDigit`, `ErrBatchHeaderControlEquality`, etc.)

#### [NEW] src/utils/converters.ts
- Port `parseNumField`, `parseStringField`, `parseStringFieldWithOpts`
- Port `alphaField`, `numericField`, `stringField`
- Port `formatSimpleDate`, `formatSimpleTime`
- Port `leastSignificantDigits`

#### [NEW] src/utils/validators.ts
- Port `isAlphanumeric`, `isUpperASCII`, `isNonZero`
- Port `isServiceClass`, `isSECCode`, `isTransactionCode`, `isOriginatorStatusCode`
- Port `isTypeCode`, `isCardTransactionType`, `isTransactionTypeCode`
- Port `CalculateCheckDigit`, `CheckRoutingNumber`
- Port `validateSimpleDate`, `validateSimpleTime`, `validateSettlementDate`
- Port date validation helpers (`isMonth`, `isDay`, `isCreditCardYear`)

#### [NEW] src/validateOpts.ts
- Port `ValidateOpts` interface with all 23 boolean fields + `CheckTransactionCode` callback
- Port `merge()` method

#### Tests for Phase 1
- Port `converters_test.go` → `converters.test.ts`
- Port `validators_test.go` → `validators.test.ts`

---

### Phase 2: Record Types (Headers, Controls, Entry Details)

#### [NEW] src/fileHeader.ts
- Port `FileHeader` class with `Parse()`, `String()`, `Validate()`, `ValidateWith()`
- Port all field methods (`ImmediateDestinationField`, etc.)

#### [NEW] src/fileControl.ts
- Port `FileControl` class with `Parse()`, `String()`, `Validate()`
- Port all field methods

#### [NEW] src/batchHeader.ts 
- Port `BatchHeader` class with `Parse()`, `String()`, `Validate()`, `Equal()`
- Port all field methods

#### [NEW] src/batchControl.ts
- Port `BatchControl` class with `Parse()`, `String()`, `Validate()`
- Port all field methods

#### [NEW] src/entryDetail.ts
- Port `EntryDetail` class with `Parse()`, `String()`, `Validate()`
- Port all SEC-specific field methods (POP, SHR, CTX, TRC, etc.)
- Port `SetTraceNumber`, `SetRDFI`, `CreditOrDebit`, `AddAddenda05`

#### [NEW] src/advEntryDetail.ts, src/advBatchControl.ts, src/advFileControl.ts
- Port ADV-specific record types

#### Tests for Phase 2
- Port `fileHeader_test.go`, `fileControl_test.go`
- Port `batchHeader_test.go`, `batchControl_test.go`
- Port `entryDetail_test.go`
- Port `advEntryDetail_test.go`, `advBatchControl_test.go`, `advFileControl_test.go`

---

### Phase 3: Addenda Records

#### [NEW] src/addenda/Addenda02.ts through Addenda99Contested.ts
- Port all 17 addenda record types with `Parse()`, `String()`, `Validate()`
- Port change code tables (Addenda98), return code tables (Addenda99)
- Port dishonored/contested return code helpers

#### Tests for Phase 3
- Port all addenda test files (`addenda02_test.go` → `addenda02.test.ts`, etc.)

---

### Phase 4: Batch System

#### [NEW] src/batch.ts
- Port base `Batch` class with `build()`, `verify()`, `ValidateTotals()`
- Define `Batcher` TypeScript interface
- Port `calculateEntryHash`, `calculateBatchAmounts`, `isSequenceAscending`, etc.
- Port `Offset` type and offset handling
- Port `ConvertBatchType` and `NewBatch` factory

#### [NEW] src/batches/BatchACK.ts through BatchXCK.ts
- Port all 23 SEC-specific batch implementations
- Each has custom `Create()` and `Validate()` methods

#### [NEW] src/iatBatchHeader.ts, src/iatEntryDetail.ts, src/iatBatch.ts
- Port IAT-specific records and batch type

#### Tests for Phase 4
- Port `batch_test.go` (largest test file ~56K chars)
- Port `batchACK_test.go` through `batchXCK_test.go` (23 files)
- Port `iatBatch_test.go`, `iatBatchHeader_test.go`, `iatEntryDetail_test.go`

---

### Phase 5: File Operations (Create, Validate, JSON)

#### [NEW] src/file.ts
- Port `File` class with `Create()`, `Validate()`, `ValidateWith()`, `ValidateTotals()`
- Port `FileFromJSON()`, `FileFromJSONWith()`
- Port JSON serialization (`MarshalJSON`/`UnmarshalJSON` → `toJSON`/`fromJSON`)
- Port `overwriteDateTimeFields`, `annotateLineNumbers`
- Port `AddBatch`, `AddIATBatch`, `RemoveBatch`, helper methods

#### Tests for Phase 5
- Port `file_test.go` (~70K chars, largest test file)

---

### Phase 6: Reader & Writer

#### [NEW] src/reader.ts
- Port `Reader` class with rune-by-rune scanning
- Port `Read()`, `parseLine()`, `parseFileHeader()`, `parseBatchHeader()`, etc.
- Port fixed-width file handling, line padding, blank line detection
- Adapt from Go's `io.Reader` to string-based input

#### [NEW] src/writer.ts
- Port `Writer` class with configurable line endings
- Port `Write()`, `writeBatch()`, `writeIATBatch()`, padding logic
- Adapt from Go's `io.Writer` to string-based output

#### Tests for Phase 6
- Port `reader_test.go` (~66K chars)
- Port `writer_test.go` (~20K chars)
- Port `encoding_test.go`, `record_test.go`

---

### Phase 7: Advanced Features

#### [NEW] src/merge.ts
- Port file merging logic with conditions and limits

#### [NEW] src/fileFlattener.ts
- Port file flattening logic

#### [NEW] src/reversal.ts
- Port reversal generation

#### [NEW] src/iterator.ts
- Port file/batch iterator

#### [NEW] src/segmentFileConfiguration.ts
- Port segment file configuration

#### Tests for Phase 7
- Port `merge_test.go`, `file_flattener_test.go`, `reversal_test.go`
- Port `iterator_test.go`, `segmentFileConfiguration_test.go`

---

### Phase 8: Test Data & Integration

- Copy all test fixture files from `moov-ach/test/testdata/` and `moov-ach/test/*/` 
- Ensure all integration-level tests pass with real ACH file fixtures
- Verify round-trip: parse → create → write → parse produces identical files

---

## Design Decisions

| Go Concept | TypeScript Approach |
|---|---|
| `validator` / `converters` embedded structs | Utility functions imported into classes (composition) |
| `Batcher` interface | TypeScript `interface` + abstract `Batch` class |
| `sync.Pool` buffer reuse | Not needed — JS strings are immutable, use concatenation |
| `io.Reader` / `io.Writer` | String input/output (with optional Node stream adapters) |
| Go error returns | `ACHError` subclasses thrown, with error codes matching Go |
| `json:"fieldName"` struct tags | Explicit `toJSON()` / `fromJSON()` methods |
| Go's `rune` processing | JavaScript native Unicode string handling |
| `strconv.Atoi` / `strconv.Itoa` | `parseInt()` / `String()` |
| Package-level vars (error sentinels) | Module-level `const` exports |

## Verification Plan

### Automated Tests
- Run `npx vitest` after each phase to verify all ported tests pass
- Each test file is a 1:1 port of the corresponding Go test file
- Test coverage should match or exceed the Go library for each component

### Manual Verification
- Round-trip test: Parse a NACHA file → Write it back → Binary-compare output
- JSON round-trip: Parse → toJSON → fromJSON → Write → Compare
- Cross-validate: Use the Go library to produce reference outputs and compare with TypeScript outputs

### Integration Tests (Phase 8)
- All test fixtures from `moov-ach/test/testdata/` must parse and validate correctly
- Files written by the TypeScript library should be parseable by the Go library (and vice versa)


## Tasks
# ACH TypeScript Port - Task Tracker

## Phase 1: Foundation (Project Setup + Core Utilities) ✅
- [x] Project setup (package.json, tsconfig.json, vitest.config.ts)
- [x] src/constants.ts (~240 lines — all record positions, 23 SEC codes, transaction codes, categories)
- [x] src/errors/ (ACHError, FieldError, BatchError, FileError — ~450 lines, 50+ sentinel errors, 21 error classes)
- [x] src/utils/converters.ts (~160 lines — all converter methods, Unicode-aware)
- [x] src/utils/validators.ts (~360 lines — 17+ validation methods, CalculateCheckDigit, CheckRoutingNumber)
- [x] src/validateOpts.ts (~140 lines — 23 boolean flags + merge function)
- [x] test/converters.test.ts (~425 lines, 20 tests)
- [x] test/validators.test.ts (~420 lines, 64 tests)

## Phase 2: Record Types ✅
- [x] src/fileHeader.ts (370 lines — Parse, String, Validate, ValidateWith + all field methods)
- [x] src/fileControl.ts (95 lines — Parse, String, Validate + field methods)
- [x] src/batchHeader.ts (165 lines — Parse, String, Validate, Equal + field methods)
- [x] src/batchControl.ts (140 lines — Parse, String, Validate + field methods)
- [x] src/entryDetail.ts (560 lines — Parse, String, Validate + all SEC-specific helpers)
- [x] src/advEntryDetail.ts (ADV entry detail with accounting transaction codes 81-88)
- [x] src/advBatchControl.ts (ADV batch control with operator data fields)
- [x] src/advFileControl.ts (ADV file control with 20-digit dollar amount fields)
- [x] test/fileHeader.test.ts (~300 lines, 26 tests)
- [x] test/entryDetail.test.ts (~250 lines, 22 tests)
- [x] test/records.test.ts (FileControl, BatchHeader, BatchControl — 13 tests)
- [x] test/advRecords.test.ts (ADVEntryDetail, ADVBatchControl, ADVFileControl — 23 tests)

## Phase 3: Addenda Records ✅
- [x] src/addenda02.ts (140 lines — POS/SHR/MTE support)
- [x] src/addenda05.ts (85 lines — general purpose addenda)
- [x] src/addenda10.ts (IAT — transaction type, foreign payment, name)
- [x] src/addenda11.ts (IAT — originator name + street address)
- [x] src/addenda12.ts (IAT — originator city/state/country/postal/DOB)
- [x] src/addenda13.ts (IAT — ODFI name, ID qualifier, identification, country)
- [x] src/addenda14.ts (IAT — RDFI name, ID qualifier, identification, country)
- [x] src/addenda15.ts (IAT — receiver ID number + street address)
- [x] src/addenda16.ts (IAT — receiver city/state/country/postal/DOB)
- [x] src/addenda17.ts (IAT — payment related information, max 2 per entry)
- [x] src/addenda18.ts (IAT — foreign correspondent bank info, max 5 per entry)
- [x] src/addenda98.ts (240 lines — NOC with 19 change codes + writeCorrectionData)
- [x] src/addenda98Refused.ts (Refused NOC with change code validation)
- [x] src/addenda99.ts (210 lines — Returns with 54 return codes)
- [x] src/addenda99Dishonored.ts (Dishonored returns — R61, R62, R67-R70)
- [x] src/addenda99Contested.ts (Contested returns — R71-R77)
- [x] test/addenda.test.ts (~400 lines, 28 tests — Addenda02, 05, 98, 99)
- [x] test/addendaIAT.test.ts (Addenda10-18 — 37 tests)
- [x] test/addendaVariants.test.ts (Addenda98Refused, 99Dishonored, 99Contested — 45 tests)

## Phase 4: Batch System
- [x] src/batch.ts (base Batch class + Batcher interface + newBatch factory)
- [x] All 22 SEC batch types (src/batches/BatchACK.ts through BatchXCK.ts)
- [x] src/batches/index.ts (barrel export + registration)
- [x] src/iatBatchHeader.ts (IAT Batch Header with ForeignExchange fields)
- [x] src/iatEntryDetail.ts (IAT Entry Detail with Addenda10-18 slots)
- [x] src/iatBatch.ts (IAT Batch with full validation)
- [x] test/batch.test.ts (14 tests — Batch creation, validation, SEC types)
- [x] test/iatBatch.test.ts (9 tests — IATBatchHeader, IATEntryDetail, IATBatch)

## Phase 5: File Operations ✅
- [x] src/file.ts (~1100 lines — File class, Create, Validate, ValidateTotals, JSON, SegmentFile, FlattenBatches)
- [x] JSON key remapping (Go JSON tags → TypeScript camelCase properties)
- [x] Addenda hydration from JSON (Addenda02/05/10-16/98/99 class instances)
- [x] DateTime parsing (RFC3339, ISO 8601 → YYMMDD/HHmm)
- [x] test/file.test.ts (88 tests — 82 ported 1:1 from file_test.go + 6 programmatic equivalents)
- [x] 17 JSON fixture files copied to test/testdata/

## Phase 6: Reader & Writer
- [x] src/reader.ts
- [x] src/writer.ts
- [x] Tests for reader/writer

## Phase 7: Advanced Features
- [x] src/merge.ts (mergeFiles, mergeFilesWith with Conditions — line/dollar amount limits, trace collision handling)
- [x] File.reversal() method in src/file.ts (transaction code swapping, service class recalculation)
- [x] src/iterator.ts (Iterator class — line-by-line entry processing, fake batch header support)
- [x] FlattenBatches already in src/file.ts (Phase 5)
- [x] SegmentFile already in src/file.ts (Phase 5)
- [x] SegmentFileConfiguration — skipped (empty placeholder in Go)
- [x] Updated src/index.ts exports (mergeFiles, mergeFilesWith, Conditions, Iterator, allSpaces)
- [x] Fixed BatchHeader.equal() to match Go (Nacha-defined fields only, excludes batchNumber)
- [x] Fixed reversal LoanDebit case (hasCredits not hasDebits)
- [x] test/reversal.test.ts (4 tests — credit, debit, GL double reversal, Loan double reversal)
- [x] test/merge.test.ts (10 tests — identity, multiple, together, apart, line limit, dollar limit, collision, ValidateOpts)
- [x] test/iterator.test.ts (11 tests — PPD, multi-file, IAT skip, returns, no-batch-header, blank, whitespace)

## Phase 8: Integration Testing
- [x] Copy test fixtures (8 JSON + 24 SEC ACH + 4 specialized = 36 new fixtures)
- [x] test/integration.test.ts (149 tests — ACH round-trip, ValidateOpts files, structural validation, idempotent write, crasher resilience, invalid file handling)
- [x] test/jsonRoundTrip.test.ts (19 tests — JSON parse→serialize→re-parse, JSON→ACH→JSON cross-format, invalid JSON)
- [x] test/secCodes.test.ts (112 tests — all 22 SEC codes + 6 IAT fixtures, parse→create→validate)
- [x] Fixed Addenda99Dishonored/Contested/98Refused JSON hydration bug in src/file.ts
