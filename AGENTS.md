# Project Guidelines

## Overview

This is `ach-ts`, a TypeScript library for creating, parsing, validating, and writing ACH (Automated Clearing House) files conforming to NACHA specifications. It is a port of [moov-io/ach](https://github.com/moov-io/ach) (Go) with TypeScript-specific additions. The Go source lives in `moov-ach/` for reference but is not part of the build.

## Build and Test

```bash
npm test          # vitest run (1,435 tests, ~1s)
npm run build     # tsc → dist/
npm run test:watch
```

- TypeScript 5.0+, ES2022 target, ESNext modules, strict mode
- Vitest for testing. Tests are in `test/`, fixtures in `test/testdata/`
- No runtime dependencies. Only devDependencies: typescript, vitest, @types/node
- All imports use `.js` extensions (ESM resolution): `import { Foo } from './foo.js'`

## Architecture

### Record Hierarchy

ACH files are sequences of 94-character fixed-width records. Each record type is a class with `parse(line)`, `string()`, `validate()`, and `validateAll()` methods.

```
File
  FileHeader          (position "1")
  Batch[] / IATBatch[]
    BatchHeader       (position "5")
    EntryDetail[]     (position "6")
      Addenda[]       (position "7")
    BatchControl      (position "8")
  FileControl         (position "9")
```

Key files and their roles:

| File | Purpose |
|------|---------|
| `src/file.ts` | `File` class: create, validate, JSON, segment, split, flatten, reverse. Largest source file. |
| `src/reader.ts` | `Reader` class: parses fixed-width text into a `File`. Rune-by-rune scanning. |
| `src/writer.ts` | `Writer` class: serializes a `File` to fixed-width text with block padding. |
| `src/batch.ts` | `Batch` base class, `Batcher` interface, `newBatch()` factory, `Offset` type. |
| `src/merge.ts` | `mergeFiles()`, `mergeFilesWith()` with `Conditions` (line/dollar limits). |
| `src/split.ts` | `splitFile()` with `SplitOptions` (entry/batch/validity grouping + size constraints). |
| `src/iterator.ts` | `Iterator` class for memory-efficient line-by-line entry processing. |
| `src/dir.ts` | `readDir()`, `mergeDir()` async directory utilities. |
| `src/constants.ts` | All SEC codes, transaction codes, service class codes, record positions. |
| `src/validateOpts.ts` | `ValidateOpts` interface (23 boolean bypass flags + callback). |
| `src/errors/index.ts` | `ACHError`, `FieldError`, `BatchError`, `FileError`, `ParseError`, 80+ sentinel errors. |
| `src/errorCodes.ts` | Stable string error codes and severity assignments for sentinel errors. |
| `src/fieldPositions.ts` | `FieldSpec` arrays mapping field names to column ranges; `enrichErrors()` adds positional data. |
| `src/addenda/txp.ts` | TXP tax payment format parser (not in Go library). |

### Batch Type Registry

Each of the 22 SEC batch types (ACK, ARC, ATX, BOC, CCD, CIE, COR, CTX, DNE, ENR, MTE, POP, POS, PPD, RCK, SHR, TEL, TRC, TRX, WEB, XCK, plus ADV) is in `src/batches/Batch{SEC}.ts`. Each extends `Batch` and calls `registerBatchType()` at module load. IAT uses a separate `IATBatch` class in `src/iatBatch.ts`.

`newBatch(header)` looks up the SEC code in the registry and returns the correct subclass. `convertBatchType(batch, sec)` converts between types.

### Addenda Types

17 addenda record types in `src/addenda/`: Addenda02, 05, 10-18, 98, 98Refused, 99, 99Dishonored, 99Contested, plus TXP parser. Each has `parse()`, `string()`, `validate()`.

### IAT and ADV Branches

- IAT (International ACH): `IATBatchHeader`, `IATEntryDetail`, `IATBatch` with Addenda10-18 slots, ISO 3166/4217 validation
- ADV (Automated Accounting Advices): `ADVEntryDetail`, `ADVBatchControl`, `ADVFileControl` with 20-digit amount fields

## Code Conventions

### Class Pattern

Record classes use plain public properties (not getters/setters). Construction is via factory functions that set defaults:

```typescript
export class EntryDetail {
  transactionCode = 0;
  rdfiIdentification = '';
  amount = 0;
  // ...

  parse(record: string): void { /* fixed-width field extraction */ }
  string(): string { /* 94-char fixed-width output */ }
  validate(): Error | null { /* returns first error or null */ }
  validateAll(): Error[] { /* returns all errors */ }
}

export function newEntryDetail(): EntryDetail { return new EntryDetail(); }
```

### Composition Over Inheritance for Utilities

Go's embedded `validators` and `converters` interfaces are implemented as stateless singleton objects:

```typescript
import { converters } from './utils/converters.js';
import { validators } from './utils/validators.js';

// Used inside class methods:
converters.parseNumField(str);
validators.isAlphanumeric(str);
```

Do not instantiate `Converters` or `Validators` classes. Use the exported singletons.

### Forward-Declared Addenda Interfaces

`EntryDetail` references addenda types via `*Like` interfaces (e.g., `Addenda02Like`, `Addenda05Like`) to avoid circular dependencies. The actual addenda classes in `src/addenda/` implement these interfaces.

### Error Pattern

Validation methods return `Error | null` (fast-fail) or `Error[]` (exhaustive). They do not throw.

Sentinel errors are module-level frozen constants:
```typescript
export const ErrFieldRequired = new ACHError('is a required field');
Object.freeze(ErrFieldRequired);
```

Field-level errors are wrapped in `FieldError` with context:
```typescript
return fieldError('IndividualName', ErrFieldRequired);
// → FieldError { fieldName: 'IndividualName', cause: ErrFieldRequired }
```

Batch-level errors use `this.batchError(field, err, ...values)` which wraps in `BatchError` with batch number and SEC code.

The `Reader.read()` throws an `ACHError` if parse errors occur. Use `Reader.readWithErrors()` for non-throwing parse that returns `{ file, errors }`.

### Two-Tier Validation

Every record type implements both:
- `validate(): Error | null` -- returns the first error (fast-fail, for normal use)
- `validateAll(): Error[]` -- accumulates all errors (for diagnostics/editors)

Batch subclasses follow this pattern:
```typescript
validate(): Error | null {
  if (this.validateOpts?.skipAll || this.validateOpts?.bypassBatchValidation) return null;
  const err = this.verify();  // base class checks
  if (err) return err;
  // SEC-specific checks...
  return null;
}

validateAll(): Error[] {
  if (this.validateOpts?.skipAll || this.validateOpts?.bypassBatchValidation) return [];
  const errors = this.verifyAll();  // base class checks
  // SEC-specific checks appended to errors...
  return errors;
}
```

### Positional Error Enrichment

Errors carry optional `line`, `startColumn`, `endColumn` fields. The `enrichErrors()` function in `src/fieldPositions.ts` annotates `FieldError` arrays with column positions using `FieldSpec` definitions. `ParseError` wraps errors with line numbers from the reader.

### JSON Key Remapping

The `File.toJSON()` method outputs Go-compatible PascalCase keys. `fileFromJSON()` accepts both PascalCase and camelCase. Key mapping dictionaries live in `src/file.ts`. When modifying JSON serialization, update both `goRemapKeys` and the reverse mapping.

### Import Style

All internal imports use `.js` extensions for ESM compatibility:
```typescript
import { PPD, CheckingCredit } from './constants.js';
import type { ValidateOpts } from './validateOpts.js';
```

Use `import type` for type-only imports.

## Testing Conventions

Tests are in `test/*.test.ts`. Each test file typically starts with a `mock*()` helper that creates a valid record instance, then tests parsing, string output, round-trip, validation, and edge cases.

```typescript
import { describe, it, expect } from 'vitest';

function mockEntryDetail(): EntryDetail {
  const ed = newEntryDetail();
  ed.transactionCode = CheckingCredit;
  // set all required fields...
  return ed;
}

describe('EntryDetail', () => {
  it('mock validates', () => {
    const ed = mockEntryDetail();
    expect(ed.validate()).toBeNull();
  });

  it('round-trips string -> parse -> string', () => {
    const ed = mockEntryDetail();
    const str = ed.string();
    const ed2 = newEntryDetail();
    ed2.parse(str);
    expect(ed2.string()).toBe(str);
  });
});
```

Validation tests check both that valid records return `null` and that specific mutations produce the expected error. Use `expect(err).toBeNull()` for success and `expect(err?.message).toContain(...)` for failures.

Fixture files in `test/testdata/` include both `.ach` (fixed-width) and `.json` files. Read them with `readFileSync(join(__dirname, 'testdata', 'file.ach'), 'utf-8')`.

## Go Reference

The `moov-ach/` directory, if present, contains the original Go source for reference when porting behavior or verifying correctness. The TypeScript code should match Go's validation rules exactly. Key correspondences:

| Go file | TypeScript file |
|---------|----------------|
| `file.go` / `file_test.go` | `src/file.ts` / `test/file.test.ts` |
| `batch.go` / `batcher.go` | `src/batch.ts` |
| `batch{SEC}.go` | `src/batches/Batch{SEC}.ts` |
| `entryDetail.go` | `src/entryDetail.ts` |
| `addenda{NN}.go` | `src/addenda/addenda{NN}.ts` |
| `reader.go` | `src/reader.ts` |
| `writer.go` | `src/writer.ts` |
| `converters.go` | `src/utils/converters.ts` |
| `validators.go` | `src/utils/validators.ts` |
| `fieldErrors.go` / `batchErrors.go` | `src/errors/index.ts` |
| *(no Go equivalent)* | `src/split.ts` — TypeScript-only file splitting |

## Public API

All public exports are in `src/index.ts`. When adding new public types or functions, add the export there. The barrel exports in `src/addenda/index.ts` and `src/batches/index.ts` feed into the main index.

## Common Pitfalls

- Fixed-width records are exactly 94 characters. `string()` methods must produce exactly 94 runes. Use `[...str].length` not `str.length` for Unicode-safe length checks.
- Amounts are in cents (integer). `$1,000.00` = `100000`.
- The `File` class stores regular batches in `batches: Batcher[]` and international batches separately in `iatBatches: IATBatch[]`. Both must be handled in file operations (split, merge, segment, flatten).
- Addenda hydration from JSON must reconstruct typed class instances, not plain objects. See `hydrateAddenda*` functions in `src/file.ts`.
- Batch numbers are 1-indexed and assigned during `File.create()`.
- Writer pads files to block boundaries (multiples of 10 lines) with `9`-filled lines.
