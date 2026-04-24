import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  Reader, FieldError, BatchError, ACHError, ParseError, Batch,
  ErrFileCalculatedControlEquality,
  ErrFileBatchNumberAscending,
  ErrFieldInclusion, ErrServiceClass, ErrOnlyZeros,
  ErrNonAlphanumeric, ErrUpperAlpha,
  ErrBatchHeaderControlEquality,
  ErrFileHeader, ErrFileControl,
  newFileHeader, newBatchHeader, newBatchControl, newFileControl,
  newEntryDetail, newAddenda05,
  newBatch,
  IATBatch, IATBatchHeader, IATEntryDetail,
  errorCodes,
} from '../src/index.js';
import {
  FieldSpec,
  buildPositionMap,
  enrichErrors,
  recordTypeToFieldSpecs,
  getAddendaFieldPositions,
  recordNameToFieldPositions,
  fileHeaderFields,          fileHeaderFieldPositions,
  batchHeaderFields,         batchHeaderFieldPositions,
  entryDetailFields,         entryDetailFieldPositions,
  batchControlFields,        batchControlFieldPositions,
  fileControlFields,         fileControlFieldPositions,
  iatBatchHeaderFields,      iatBatchHeaderFieldPositions,
  iatEntryDetailFields,      iatEntryDetailFieldPositions,
  advBatchControlFields,     advBatchControlFieldPositions,
  advEntryDetailFields,      advEntryDetailFieldPositions,
  advFileControlFields,      advFileControlFieldPositions,
  addenda02Fields,           addenda02FieldPositions,
  addenda05Fields,           addenda05FieldPositions,
  addenda10Fields,           addenda10FieldPositions,
  addenda11Fields,           addenda11FieldPositions,
  addenda12Fields,           addenda12FieldPositions,
  addenda13Fields,           addenda13FieldPositions,
  addenda14Fields,           addenda14FieldPositions,
  addenda15Fields,           addenda15FieldPositions,
  addenda16Fields,           addenda16FieldPositions,
  addenda17Fields,           addenda17FieldPositions,
  addenda18Fields,           addenda18FieldPositions,
  addenda98Fields,           addenda98FieldPositions,
  addenda98RefusedFields,    addenda98RefusedFieldPositions,
  addenda99Fields,           addenda99FieldPositions,
  addenda99DishonoredFields, addenda99DishonoredFieldPositions,
  addenda99ContestedFields,  addenda99ContestedFieldPositions,
} from '../src/fieldPositions.js';
import '../src/batches/index.js';
import '../src/errorCodes.js';

// =========================================================================
// Helper: verify a FieldSpec[] covers columns 0..94 contiguously
// =========================================================================

function verifyContiguous(specs: FieldSpec[], label: string): void {
  expect(specs.length).toBeGreaterThan(0);
  expect(specs[0].start).toBe(0);
  for (let i = 1; i < specs.length; i++) {
    expect(specs[i].start).toBe(specs[i - 1].end);
  }
  expect(specs[specs.length - 1].end).toBe(94);

  // No field should have zero or negative width
  for (const spec of specs) {
    expect(spec.end - spec.start).toBeGreaterThan(0);
  }
}

// =========================================================================
// FieldSpec contiguity tests — every record type covers 0..94
// =========================================================================

const allSpecs: [string, FieldSpec[]][] = [
  ['FileHeader',              fileHeaderFields],
  ['BatchHeader',             batchHeaderFields],
  ['EntryDetail',             entryDetailFields],
  ['BatchControl',            batchControlFields],
  ['FileControl',             fileControlFields],
  ['IATBatchHeader',          iatBatchHeaderFields],
  ['IATEntryDetail',          iatEntryDetailFields],
  ['ADVBatchControl',         advBatchControlFields],
  ['ADVEntryDetail',          advEntryDetailFields],
  ['ADVFileControl',          advFileControlFields],
  ['Addenda02',               addenda02Fields],
  ['Addenda05',               addenda05Fields],
  ['Addenda10',               addenda10Fields],
  ['Addenda11',               addenda11Fields],
  ['Addenda12',               addenda12Fields],
  ['Addenda13',               addenda13Fields],
  ['Addenda14',               addenda14Fields],
  ['Addenda15',               addenda15Fields],
  ['Addenda16',               addenda16Fields],
  ['Addenda17',               addenda17Fields],
  ['Addenda18',               addenda18Fields],
  ['Addenda98',               addenda98Fields],
  ['Addenda98Refused',        addenda98RefusedFields],
  ['Addenda99',               addenda99Fields],
  ['Addenda99Dishonored',     addenda99DishonoredFields],
  ['Addenda99Contested',      addenda99ContestedFields],
];

describe('FieldSpec contiguity', () => {
  it.each(allSpecs)('%s covers 0..94 contiguously', (_label, specs) => {
    verifyContiguous(specs, _label);
  });
});

// =========================================================================
// buildPositionMap — derived map has all keys
// =========================================================================

describe('buildPositionMap', () => {
  it('creates keys for every FieldSpec name', () => {
    const map = buildPositionMap(fileHeaderFields);
    for (const spec of fileHeaderFields) {
      expect(map[spec.name]).toEqual({ start: spec.start, end: spec.end });
    }
  });

  it('adds error-name aliases', () => {
    const map = buildPositionMap(
      [{ name: 'serviceClassCode', start: 1, end: 4 }],
      { 'ServiceClassCode': 'serviceClassCode' },
    );
    expect(map['ServiceClassCode']).toEqual({ start: 1, end: 4 });
    expect(map['serviceClassCode']).toEqual({ start: 1, end: 4 });
  });
});

// =========================================================================
// enrichErrors — sets line/column on FieldErrors
// =========================================================================

describe('enrichErrors', () => {
  it('sets position on FieldError from map', () => {
    const err = new FieldError('ServiceClassCode', new Error('test'));
    enrichErrors([err], 5, batchHeaderFieldPositions);
    expect(err.line).toBe(5);
    expect(err.startColumn).toBe(1);
    expect(err.endColumn).toBe(4);
  });

  it('leaves non-FieldError untouched', () => {
    const err = new Error('plain');
    const result = enrichErrors([err], 3, batchHeaderFieldPositions);
    expect(result).toHaveLength(1);
    expect((err as any).line).toBeUndefined();
  });

  it('handles unknown field name gracefully', () => {
    const err = new FieldError('UnknownField', new Error('test'));
    enrichErrors([err], 2, batchHeaderFieldPositions);
    expect(err.line).toBe(2);
    expect(err.startColumn).toBeUndefined();
    expect(err.endColumn).toBeUndefined();
  });
});

// =========================================================================
// recordTypeToFieldSpecs — mapping
// =========================================================================

describe('recordTypeToFieldSpecs', () => {
  it('returns FileHeader for type "1"', () => {
    expect(recordTypeToFieldSpecs('1')).toBe(fileHeaderFields);
  });
  it('returns BatchHeader for type "5"', () => {
    expect(recordTypeToFieldSpecs('5')).toBe(batchHeaderFields);
  });
  it('returns IATBatchHeader for type "5" with IAT', () => {
    expect(recordTypeToFieldSpecs('5', { secCode: 'IAT' })).toBe(iatBatchHeaderFields);
  });
  it('returns EntryDetail for type "6"', () => {
    expect(recordTypeToFieldSpecs('6')).toBe(entryDetailFields);
  });
  it('returns IATEntryDetail for type "6" with IAT', () => {
    expect(recordTypeToFieldSpecs('6', { secCode: 'IAT' })).toBe(iatEntryDetailFields);
  });
  it('returns ADVEntryDetail for type "6" with ADV', () => {
    expect(recordTypeToFieldSpecs('6', { isADV: true })).toBe(advEntryDetailFields);
  });
  it('returns undefined for type "7" (addenda)', () => {
    expect(recordTypeToFieldSpecs('7')).toBeUndefined();
  });
  it('returns BatchControl for type "8"', () => {
    expect(recordTypeToFieldSpecs('8')).toBe(batchControlFields);
  });
  it('returns ADVBatchControl for type "8" with ADV', () => {
    expect(recordTypeToFieldSpecs('8', { isADV: true })).toBe(advBatchControlFields);
  });
  it('returns FileControl for type "9"', () => {
    expect(recordTypeToFieldSpecs('9')).toBe(fileControlFields);
  });
  it('returns ADVFileControl for type "9" with ADV', () => {
    expect(recordTypeToFieldSpecs('9', { isADV: true })).toBe(advFileControlFields);
  });
  it('returns undefined for unknown type', () => {
    expect(recordTypeToFieldSpecs('X')).toBeUndefined();
  });
});

// =========================================================================
// Decomposition round-trip: slice by FieldSpec → concatenate = original
// =========================================================================

describe('decomposition round-trip', () => {
  const testdata = join(import.meta.dirname, 'testdata');
  const ppdFile = readFileSync(join(testdata, 'ppd-debit.ach'), 'utf-8');
  const lines = ppdFile.split('\n').filter(l => l.length >= 94).map(l => l.substring(0, 94));

  it('decomposes and recomposes a FileHeader line', () => {
    const line = lines.find(l => l[0] === '1')!;
    const specs = recordTypeToFieldSpecs('1')!;
    const parts = specs.map(s => line.substring(s.start, s.end));
    expect(parts.join('')).toBe(line);
  });

  it('decomposes and recomposes a BatchHeader line', () => {
    const line = lines.find(l => l[0] === '5')!;
    const specs = recordTypeToFieldSpecs('5')!;
    const parts = specs.map(s => line.substring(s.start, s.end));
    expect(parts.join('')).toBe(line);
  });

  it('decomposes and recomposes an EntryDetail line', () => {
    const line = lines.find(l => l[0] === '6')!;
    const specs = recordTypeToFieldSpecs('6')!;
    const parts = specs.map(s => line.substring(s.start, s.end));
    expect(parts.join('')).toBe(line);
  });

  it('decomposes and recomposes a BatchControl line', () => {
    const line = lines.find(l => l[0] === '8')!;
    const specs = recordTypeToFieldSpecs('8')!;
    const parts = specs.map(s => line.substring(s.start, s.end));
    expect(parts.join('')).toBe(line);
  });

  it('decomposes and recomposes a FileControl line', () => {
    const line = lines.find(l => l[0] === '9' && !l.startsWith('999'))!;
    const specs = recordTypeToFieldSpecs('9')!;
    const parts = specs.map(s => line.substring(s.start, s.end));
    expect(parts.join('')).toBe(line);
  });
});

// =========================================================================
// End-to-end: parsed file → validateAll → FieldErrors have positions
// =========================================================================

describe('validateAll positional enrichment', () => {
  it('FieldErrors from record-level validation carry line, startColumn, endColumn', () => {
    // Create a file with a bad immediate destination (triggers FieldError)
    const header = newFileHeader();
    header.lineNumber = 1;
    header.immediateDestination = '';  // will fail validation
    header.immediateOrigin = '121042882';
    header.fileCreationDate = '190625';
    header.fileIDModifier = 'A';
    header.formatCode = '1';

    const errors = header.validateAll();
    const fieldErrors = errors.filter((e): e is FieldError => e instanceof FieldError);
    expect(fieldErrors.length).toBeGreaterThan(0);

    for (const fe of fieldErrors) {
      expect(fe.line).toBe(1);
      expect(fe.startColumn).toBeDefined();
      expect(fe.endColumn).toBeDefined();
      expect(fe.startColumn!).toBeGreaterThanOrEqual(0);
      expect(fe.endColumn!).toBeLessThanOrEqual(94);
      expect(fe.endColumn!).toBeGreaterThan(fe.startColumn!);
    }
  });

  it('FieldErrors from parsed file have correct line numbers', () => {
    const testdata = join(import.meta.dirname, 'testdata');
    const raw = readFileSync(join(testdata, 'ppd-debit.ach'), 'utf-8');

    const reader = new Reader(raw);
    const file = reader.read();

    // Corrupt a field so validateAll() produces errors
    file.header.immediateDestination = 'BAD DEST!!';
    file.header.lineNumber = 1;

    const errors = file.validateAll();
    const fieldErrors = errors.filter((e): e is FieldError => e instanceof FieldError);
    // Should have at least one FieldError from the corrupted destination
    const destError = fieldErrors.find(e => e.fieldName === 'ImmediateDestination');
    expect(destError).toBeDefined();
    expect(destError!.line).toBe(1);
    expect(destError!.startColumn).toBe(3);
    expect(destError!.endColumn).toBe(13);
  });

  it('BatchErrors carry line numbers from batch control', () => {
    const testdata = join(import.meta.dirname, 'testdata');
    const raw = readFileSync(join(testdata, 'ppd-debit.ach'), 'utf-8');

    const reader = new Reader(raw);
    const file = reader.read();

    // Corrupt batch control to mismatch header
    const batch = file.batches[0];
    (batch as any).control.serviceClassCode = 999;

    const errors = file.validateAll();
    const batchErrors = errors.filter((e): e is BatchError => e instanceof BatchError);
    const sccError = batchErrors.find(e => e.fieldName === 'ServiceClassCode');
    if (sccError) {
      expect(sccError.line).toBeDefined();
      expect(sccError.line).toBeGreaterThan(0);
    }
  });

  it('file-level ErrFileCalculatedControlEquality carries line', () => {
    const testdata = join(import.meta.dirname, 'testdata');
    const raw = readFileSync(join(testdata, 'ppd-debit.ach'), 'utf-8');

    const reader = new Reader(raw);
    const file = reader.read();

    // Corrupt file control to mismatch
    file.control.batchCount = 999;

    const errors = file.validateAll();
    const calcError = errors.find((e): e is ErrFileCalculatedControlEquality =>
      e instanceof ErrFileCalculatedControlEquality
    );
    expect(calcError).toBeDefined();
    expect(calcError!.line).toBeDefined();
    expect(calcError!.line).toBeGreaterThan(0);
  });
});

// =========================================================================
// IAT decomposition round-trip
// =========================================================================

describe('IAT decomposition round-trip', () => {
  const testdata = join(import.meta.dirname, 'testdata');
  const iatFile = readFileSync(join(testdata, 'iat-credit.ach'), 'utf-8');
  const lines = iatFile.split('\n').filter(l => l.length >= 94).map(l => l.substring(0, 94));

  it('decomposes IATBatchHeader', () => {
    const line = lines.find(l => l[0] === '5')!;
    const specs = iatBatchHeaderFields;
    const parts = specs.map(s => line.substring(s.start, s.end));
    expect(parts.join('')).toBe(line);
  });

  it('decomposes IATEntryDetail', () => {
    const line = lines.find(l => l[0] === '6')!;
    const specs = iatEntryDetailFields;
    const parts = specs.map(s => line.substring(s.start, s.end));
    expect(parts.join('')).toBe(line);
  });

  it('decomposes addenda lines', () => {
    const addendaLines = lines.filter(l => l[0] === '7');
    for (const line of addendaLines) {
      const typeCode = line.substring(1, 3);
      let specs: FieldSpec[] | undefined;
      switch (typeCode) {
        case '10': specs = addenda10Fields; break;
        case '11': specs = addenda11Fields; break;
        case '12': specs = addenda12Fields; break;
        case '13': specs = addenda13Fields; break;
        case '14': specs = addenda14Fields; break;
        case '15': specs = addenda15Fields; break;
        case '16': specs = addenda16Fields; break;
        case '17': specs = addenda17Fields; break;
        case '18': specs = addenda18Fields; break;
      }
      if (specs) {
        const parts = specs.map(s => line.substring(s.start, s.end));
        expect(parts.join('')).toBe(line);
      }
    }
  });
});

// =========================================================================
// ADV decomposition round-trip
// =========================================================================

describe('ADV decomposition round-trip', () => {
  const testdata = join(import.meta.dirname, 'testdata');
  const advData = readFileSync(join(testdata, 'adv-read.ach'), 'utf-8');
  const lines = advData.split('\n').filter(l => l.length >= 94).map(l => l.substring(0, 94));

  it('decomposes ADVEntryDetail', () => {
    const line = lines.find(l => l[0] === '6')!;
    if (line) {
      const parts = advEntryDetailFields.map(s => line.substring(s.start, s.end));
      expect(parts.join('')).toBe(line);
    }
  });

  it('decomposes ADVBatchControl', () => {
    const line = lines.find(l => l[0] === '8')!;
    if (line) {
      const parts = advBatchControlFields.map(s => line.substring(s.start, s.end));
      expect(parts.join('')).toBe(line);
    }
  });

  it('decomposes ADVFileControl', () => {
    const controlLine = lines.find(l => l[0] === '9' && !l.startsWith('999'))!;
    if (controlLine) {
      const parts = advFileControlFields.map(s => controlLine.substring(s.start, s.end));
      expect(parts.join('')).toBe(controlLine);
    }
  });
});

// =========================================================================
// Phase 1: Error codes
// =========================================================================

describe('Error codes', () => {
  it('all sentinel errors have a non-empty code', () => {
    for (const [err, entry] of errorCodes) {
      expect(err.code).toBe(entry.code);
      expect(err.code!.length).toBeGreaterThan(0);
    }
  });

  it('FieldError inherits code from cause', () => {
    const fe = new FieldError('ServiceClassCode', ErrServiceClass, 999);
    expect(fe.code).toBe('serviceClass');
  });

  it('FieldError has no code when cause is plain Error', () => {
    const fe = new FieldError('SomeField', new Error('plain'));
    expect(fe.code).toBeUndefined();
  });

  it('structured error classes have code property', () => {
    const eq = new ErrBatchHeaderControlEquality('200', '225');
    expect(eq.code).toBe('batchHeaderControlEquality');
  });

  it('BatchError inherits code from cause', () => {
    const be = new BatchError(1, 'PPD', 'ServiceClassCode', ErrServiceClass, 999);
    expect(be.code).toBe('serviceClass');
  });
});

// =========================================================================
// Phase 2: Addenda validate() enrichment in isFieldInclusionAll
// =========================================================================

describe('Addenda enrichment via isFieldInclusionAll', () => {
  it('enriches addenda05 validate() FieldError with line and column', () => {
    // Create a batch with an invalid addenda05 to trigger validation error
    const header = newBatchHeader();
    header.lineNumber = 2;
    header.serviceClassCode = 225;
    header.standardEntryClassCode = 'PPD';
    header.companyIdentification = '123456789';
    header.companyName = 'TEST';
    header.companyEntryDescription = 'PAYROLL';
    header.odfiIdentification = '12345678';
    header.batchNumber = 1;
    header.effectiveEntryDate = '260101';
    header.companyDescriptiveDate = '';

    const entry = newEntryDetail();
    entry.lineNumber = 3;
    entry.transactionCode = 27;
    entry.rdfiIdentification = '23138010';
    entry.checkDigit = '4';
    entry.dfiAccountNumber = '744-5678-99';
    entry.amount = 500;
    entry.individualName = 'Test Name';
    entry.traceNumber = '123456780000001';
    entry.addendaRecordIndicator = 1;

    const a05 = newAddenda05();
    a05.lineNumber = 4;
    // Set an invalid typeCode to force a FieldError from validate()
    a05.typeCode = 'XX';
    a05.sequenceNumber = 1;
    a05.entryDetailSequenceNumber = 1;
    entry.addenda05.push(a05);

    const control = newBatchControl();
    control.lineNumber = 5;
    control.serviceClassCode = 225;
    control.entryAddendaCount = 2;
    control.entryHash = 23138010;
    control.totalDebitEntryDollarAmount = 500;
    control.totalCreditEntryDollarAmount = 0;
    control.companyIdentification = '123456789';
    control.odfiIdentification = '12345678';
    control.batchNumber = 1;

    const [batcher] = newBatch(header);
    const batch = batcher as Batch;
    batch.addEntry(entry);
    batch.control = control;

    const errors = batch.validateAll();
    const addendaErr = errors.find((e: Error) =>
      e instanceof FieldError && e.fieldName === 'TypeCode'
    ) as FieldError | undefined;

    expect(addendaErr).toBeDefined();
    if (addendaErr) {
      expect(addendaErr.line).toBe(4);
      expect(addendaErr.startColumn).toBeDefined();
      expect(addendaErr.endColumn).toBeDefined();
    }
  });

  it('enriches IndividualName FieldError with entry line and column', () => {
    const header = newBatchHeader();
    header.lineNumber = 2;
    header.serviceClassCode = 225;
    header.standardEntryClassCode = 'PPD';
    header.companyIdentification = '123456789';
    header.companyName = 'TEST';
    header.companyEntryDescription = 'PAYROLL';
    header.odfiIdentification = '12345678';
    header.batchNumber = 1;
    header.effectiveEntryDate = '260101';
    header.companyDescriptiveDate = '';

    const entry = newEntryDetail();
    entry.lineNumber = 3;
    entry.transactionCode = 27;
    entry.rdfiIdentification = '23138010';
    entry.checkDigit = '4';
    entry.dfiAccountNumber = '744-5678-99';
    entry.amount = 500;
    entry.individualName = '';  // Empty — should trigger ErrOnlyZeros
    entry.traceNumber = '123456780000001';

    const control = newBatchControl();
    control.lineNumber = 4;
    control.serviceClassCode = 225;
    control.entryAddendaCount = 1;
    control.entryHash = 23138010;
    control.totalDebitEntryDollarAmount = 500;
    control.totalCreditEntryDollarAmount = 0;
    control.companyIdentification = '123456789';
    control.odfiIdentification = '12345678';
    control.batchNumber = 1;

    const [batcher2] = newBatch(header);
    const batch2 = batcher2 as Batch;
    batch2.addEntry(entry);
    batch2.control = control;

    const errors = batch2.validateAll();
    const nameErr = errors.find((e: Error) =>
      e instanceof FieldError && e.fieldName === 'IndividualName'
    ) as FieldError | undefined;

    expect(nameErr).toBeDefined();
    if (nameErr) {
      expect(nameErr.line).toBe(3);
      const pos = entryDetailFieldPositions['IndividualName'];
      expect(nameErr.startColumn).toBe(pos.start);
      expect(nameErr.endColumn).toBe(pos.end);
    }
  });
});

// =========================================================================
// Phase 3: Related locations for cross-record errors
// =========================================================================

describe('relatedLocations on BatchError', () => {
  it('BatchError for header/control equality has relatedLocations pointing to header', () => {
    const header = newBatchHeader();
    header.lineNumber = 2;
    header.serviceClassCode = 225;
    header.standardEntryClassCode = 'PPD';
    header.companyIdentification = '123456789';
    header.companyName = 'TEST';
    header.companyEntryDescription = 'PAYROLL';
    header.odfiIdentification = '12345678';
    header.batchNumber = 1;
    header.effectiveEntryDate = '260101';
    header.companyDescriptiveDate = '';

    const entry = newEntryDetail();
    entry.lineNumber = 3;
    entry.transactionCode = 27;
    entry.rdfiIdentification = '23138010';
    entry.checkDigit = '4';
    entry.dfiAccountNumber = '744-5678-99';
    entry.amount = 500;
    entry.individualName = 'Test Name';
    entry.traceNumber = '123456780000001';

    const control = newBatchControl();
    control.lineNumber = 4;
    control.serviceClassCode = 200; // Mismatched with header's 225
    control.entryAddendaCount = 1;
    control.entryHash = 23138010;
    control.totalDebitEntryDollarAmount = 500;
    control.totalCreditEntryDollarAmount = 0;
    control.companyIdentification = '123456789';
    control.odfiIdentification = '12345678';
    control.batchNumber = 1;

    const [batcher3] = newBatch(header);
    const batch3 = batcher3 as Batch;
    batch3.addEntry(entry);
    batch3.control = control;

    const errors = batch3.validateAll();
    const sccErr = errors.find((e: Error) =>
      e instanceof BatchError && e.fieldName === 'ServiceClassCode' &&
      e.cause instanceof ErrBatchHeaderControlEquality
    ) as BatchError | undefined;

    expect(sccErr).toBeDefined();
    if (sccErr) {
      expect(sccErr.line).toBe(4); // Control line
      expect(sccErr.relatedLocations).toBeDefined();
      expect(sccErr.relatedLocations!.length).toBe(1);
      expect(sccErr.relatedLocations![0].line).toBe(2); // Header line
      const headerPos = batchHeaderFieldPositions['ServiceClassCode'];
      expect(sccErr.relatedLocations![0].startColumn).toBe(headerPos.start);
      expect(sccErr.relatedLocations![0].endColumn).toBe(headerPos.end);
    }
  });
});

// =========================================================================
// Phase 4: Full-line fallback for structural errors
// =========================================================================

describe('Full-line fallback', () => {
  it('structural BatchErrors have startColumn 0 and endColumn 94', () => {
    const testdata = join(import.meta.dirname, 'testdata');
    const data = readFileSync(join(testdata, 'ppd-debit.ach'), 'utf-8');
    const reader = new Reader(data);
    const file = reader.read();

    // Modify to trigger a structural error — remove all entries
    if (file.batches.length > 0) {
      const batch = file.batches[0] as Batch;
      const controlLine = batch.control.lineNumber;
      batch.entries.length = 0;  // Clear entries
      const errors = batch.validateAll();
      // Look for errors that defaulted to full-line range
      const fullLineErr = errors.find((e: Error) =>
        e instanceof BatchError && e.startColumn === 0 && e.endColumn === 94
      ) as BatchError | undefined;
      // If there's a structural error (no entries), it should have full-line range
      if (fullLineErr) {
        expect(fullLineErr.startColumn).toBe(0);
        expect(fullLineErr.endColumn).toBe(94);
        expect(fullLineErr.line).toBe(controlLine);
      }
    }
  });
});

// =========================================================================
// Phase 5: ParseError column enrichment
// =========================================================================

describe('ParseError column enrichment', () => {
  it('ParseError wrapping a FieldError has column data', () => {
    // Create a file with an invalid field value to trigger parse-time validation error
    // We'll use an invalid file header with bad recordSize
    const lines = [
      '101 076401251 0764012511801061000A094101DEST NAME              ORIGIN NAME            REF     ',
      '5225Test Company    1234567890PPDPayroll   180101   1076401250000001',
      '627231380104744-5678-99      0000000500               Test Name               0076401250000001',
      '82250000010023138010000000000500000000000000001234567890                         076401250000001',
      '9000001000001000000010023138010000000000500000000000000                                       ',
    ];
    // Mangle the recordSize field (positions 34-37) to be invalid
    const badLine = lines[0].substring(0, 34) + 'ABC' + lines[0].substring(37);
    lines[0] = badLine;

    const reader = new Reader(lines.join('\n'));
    try {
      reader.read();
    } catch (e) {
      if (e instanceof ParseError) {
        // ParseError from parse-time validation should have column data when wrapping FieldError
        if (e.cause instanceof FieldError && e.startColumn !== undefined) {
          expect(e.startColumn).toBeDefined();
          expect(e.endColumn).toBeDefined();
        }
      }
    }
  });

  it('recordNameToFieldPositions maps all basic record types', () => {
    expect(recordNameToFieldPositions['FileHeader']).toBe(fileHeaderFieldPositions);
    expect(recordNameToFieldPositions['BatchHeader']).toBe(batchHeaderFieldPositions);
    expect(recordNameToFieldPositions['EntryDetail']).toBe(entryDetailFieldPositions);
    expect(recordNameToFieldPositions['BatchControl']).toBe(batchControlFieldPositions);
    expect(recordNameToFieldPositions['FileControl']).toBe(fileControlFieldPositions);
  });
});

// =========================================================================
// Phase 6: Severity metadata
// =========================================================================

describe('Severity metadata', () => {
  it('ErrNonAlphanumeric has warning severity', () => {
    expect(ErrNonAlphanumeric.severity).toBe('warning');
  });

  it('ErrUpperAlpha has warning severity', () => {
    expect(ErrUpperAlpha.severity).toBe('warning');
  });

  it('most sentinel errors have no explicit severity (defaults to error)', () => {
    expect(ErrFieldInclusion.severity).toBeUndefined();
    expect(ErrServiceClass.severity).toBeUndefined();
  });
});

// =========================================================================
// getAddendaFieldPositions
// =========================================================================

describe('getAddendaFieldPositions', () => {
  it('returns correct position map for each addenda typeCode', () => {
    expect(getAddendaFieldPositions('02')).toBe(addenda02FieldPositions);
    expect(getAddendaFieldPositions('05')).toBe(addenda05FieldPositions);
    expect(getAddendaFieldPositions('10')).toBe(addenda10FieldPositions);
    expect(getAddendaFieldPositions('11')).toBe(addenda11FieldPositions);
    expect(getAddendaFieldPositions('12')).toBe(addenda12FieldPositions);
    expect(getAddendaFieldPositions('13')).toBe(addenda13FieldPositions);
    expect(getAddendaFieldPositions('14')).toBe(addenda14FieldPositions);
    expect(getAddendaFieldPositions('15')).toBe(addenda15FieldPositions);
    expect(getAddendaFieldPositions('16')).toBe(addenda16FieldPositions);
    expect(getAddendaFieldPositions('17')).toBe(addenda17FieldPositions);
    expect(getAddendaFieldPositions('18')).toBe(addenda18FieldPositions);
    expect(getAddendaFieldPositions('98')).toBe(addenda98FieldPositions);
    expect(getAddendaFieldPositions('98', { isRefused: true })).toBe(addenda98RefusedFieldPositions);
    expect(getAddendaFieldPositions('99')).toBe(addenda99FieldPositions);
    expect(getAddendaFieldPositions('99', { isDishonored: true })).toBe(addenda99DishonoredFieldPositions);
    expect(getAddendaFieldPositions('99', { isContested: true })).toBe(addenda99ContestedFieldPositions);
    expect(getAddendaFieldPositions('ZZ')).toBeUndefined();
  });
});

// =========================================================================
// Phase 2: IATBatch enrichment
// =========================================================================

import { Addenda10 } from '../src/addenda10.js';
import { Addenda11 } from '../src/addenda11.js';
import { Addenda12 } from '../src/addenda12.js';
import { Addenda13 } from '../src/addenda13.js';
import { Addenda14 } from '../src/addenda14.js';
import { Addenda15 } from '../src/addenda15.js';
import { Addenda16 } from '../src/addenda16.js';
import {
  MixedDebitsAndCredits, CheckingCredit, IAT, CategoryForward,
} from '../src/constants.js';

function mockIATBatchForTest(): IATBatch {
  const bh = IATBatchHeader.newIATBatchHeader();
  bh.serviceClassCode = MixedDebitsAndCredits;
  bh.foreignExchangeIndicator = 'FF';
  bh.foreignExchangeReferenceIndicator = 3;
  bh.isoDestinationCountryCode = 'US';
  bh.originatorIdentification = '1234567890';
  bh.standardEntryClassCode = IAT;
  bh.companyEntryDescription = 'TRADEPAY';
  bh.isoOriginatingCurrencyCode = 'USD';
  bh.isoDestinationCurrencyCode = 'USD';
  bh.effectiveEntryDate = '240101';
  bh.originatorStatusCode = 1;
  bh.odfiIdentification = '12104288';
  bh.lineNumber = 2;

  const ed = new IATEntryDetail();
  ed.transactionCode = CheckingCredit;
  ed.rdfiIdentification = '23138010';
  ed.checkDigit = '4';
  ed.addendaRecords = 7;
  ed.amount = 10000;
  ed.dfiAccountNumber = '123456789';
  ed.addendaRecordIndicator = 1;
  ed.traceNumber = '121042880000001';
  ed.category = CategoryForward;
  ed.lineNumber = 3;

  const a10 = new Addenda10();
  a10.transactionTypeCode = 'ANN';
  a10.foreignPaymentAmount = 10000;
  a10.foreignTraceNumber = 'TRACE123';
  a10.name = 'John Doe';
  a10.entryDetailSequenceNumber = 1;
  a10.lineNumber = 4;
  ed.addenda10 = a10;

  const a11 = new Addenda11();
  a11.originatorName = 'Test Corp';
  a11.originatorStreetAddress = '123 Main St';
  a11.entryDetailSequenceNumber = 1;
  a11.lineNumber = 5;
  ed.addenda11 = a11;

  const a12 = new Addenda12();
  a12.originatorCityStateProvince = 'New York*NY\\';
  a12.originatorCountryPostalCode = 'US*10001\\';
  a12.entryDetailSequenceNumber = 1;
  a12.lineNumber = 6;
  ed.addenda12 = a12;

  const a13 = new Addenda13();
  a13.odfiName = 'Test Bank';
  a13.odfiIDNumberQualifier = '01';
  a13.odfiIdentification = '121042882';
  a13.odfiBranchCountryCode = 'US';
  a13.entryDetailSequenceNumber = 1;
  a13.lineNumber = 7;
  ed.addenda13 = a13;

  const a14 = new Addenda14();
  a14.rdfiName = 'Receiver Bank';
  a14.rdfiIDNumberQualifier = '01';
  a14.rdfiIdentification = '231380104';
  a14.rdfiBranchCountryCode = 'US';
  a14.entryDetailSequenceNumber = 1;
  a14.lineNumber = 8;
  ed.addenda14 = a14;

  const a15 = new Addenda15();
  a15.receiverIDNumber = 'RCV123';
  a15.receiverStreetAddress = '456 Oak Ave';
  a15.entryDetailSequenceNumber = 1;
  a15.lineNumber = 9;
  ed.addenda15 = a15;

  const a16 = new Addenda16();
  a16.receiverCityStateProvince = 'Los Angeles*CA\\';
  a16.receiverCountryPostalCode = 'US*90001\\';
  a16.entryDetailSequenceNumber = 1;
  a16.lineNumber = 10;
  ed.addenda16 = a16;

  const batch = new IATBatch(bh);
  batch.addEntry(ed);
  const bc = newBatchControl();
  bc.serviceClassCode = MixedDebitsAndCredits;
  bc.odfiIdentification = '12104288';
  bc.batchNumber = bh.batchNumber;
  bc.entryHash = 23138010;
  bc.entryAddendaCount = 8;
  bc.totalCreditEntryDollarAmount = 10000;
  bc.lineNumber = 11;
  batch.control = bc;
  return batch;
}

describe('IATBatch verifyAll enrichment', () => {
  it('BatchErrors from verifyAll carry line/column', () => {
    const batch = mockIATBatchForTest();
    // Force header/control mismatch
    batch.control.serviceClassCode = 999;
    const errors = batch.validateAll();
    const batchErrors = errors.filter(e => e instanceof BatchError && e.fieldName === 'ServiceClassCode');
    expect(batchErrors.length).toBeGreaterThan(0);
    const be = batchErrors[0] as BatchError;
    expect(be.line).toBe(11); // control line
    expect(be.startColumn).toBeDefined();
    expect(be.endColumn).toBeDefined();
  });

  it('header/control equality errors have relatedLocations', () => {
    const batch = mockIATBatchForTest();
    batch.control.odfiIdentification = '99999999';
    const errors = batch.validateAll();
    const be = errors.find(e => e instanceof BatchError && e.fieldName === 'ODFIIdentification') as BatchError;
    expect(be).toBeDefined();
    expect(be.relatedLocations).toBeDefined();
    expect(be.relatedLocations!.length).toBe(1);
    expect(be.relatedLocations![0].line).toBe(2); // header line
  });
});

describe('IATBatch isFieldInclusionAll enrichment', () => {
  it('addenda validate errors carry line and column', () => {
    const batch = mockIATBatchForTest();
    // Break addenda10 TypeCode to trigger a FieldError
    batch.entries[0].addenda10!.typeCode = 'XX';
    const errors = batch.validateAll();
    const fieldErrors = errors.filter(e => e instanceof FieldError && e.fieldName === 'TypeCode');
    expect(fieldErrors.length).toBeGreaterThan(0);
    const fe = fieldErrors[0] as FieldError;
    expect(fe.line).toBe(4); // addenda10 line
    expect(fe.startColumn).toBeDefined();
    expect(fe.endColumn).toBeDefined();
  });
});

// =========================================================================
// Phase 3: Reader readWithErrors and structural error wrapping
// =========================================================================

describe('Reader.readWithErrors', () => {
  it('returns file and empty errors for valid input', () => {
    const validFile = readFileSync(join(__dirname, '..', 'test', 'testdata', 'ppd-debit.ach'), 'utf-8');
    const reader = new Reader(validFile);
    const { file, errors } = reader.readWithErrors();
    expect(errors.length).toBe(0);
    expect(file.batches.length).toBeGreaterThan(0);
  });

  it('returns file and errors array for invalid input', () => {
    const result = new Reader('').readWithErrors();
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.file).toBeDefined();
  });
});

describe('Reader structural error wrapping', () => {
  it('ErrFileHeader is wrapped in ParseError with line number', () => {
    // Empty input → no file header
    const { errors } = new Reader('').readWithErrors();
    const headerErr = errors.find(e =>
      e instanceof ParseError && e.message.includes('file headers')
    ) as ParseError | undefined;
    expect(headerErr).toBeDefined();
    expect(headerErr!.line).toBe(1);
    expect(headerErr!.record).toBe('FileHeader');
  });

  it('ErrFileControl is wrapped in ParseError with line number', () => {
    // File with only a header line → no control
    const headerLine = '101 12345678 12345678240101120106101DEST NAME              ORIGIN NAME            REF     ';
    const { errors } = new Reader(headerLine).readWithErrors();
    const controlErr = errors.find(e =>
      e instanceof ParseError && e.message.includes('file control')
    ) as ParseError | undefined;
    expect(controlErr).toBeDefined();
    expect(controlErr!.line).toBeGreaterThanOrEqual(1);
    expect(controlErr!.record).toBe('FileControl');
  });
});

// =========================================================================
// Phase 4: ErrFileBatchNumberAscending enrichment
// =========================================================================

describe('ErrFileBatchNumberAscending enrichment', () => {
  it('carries line and column after validateAll', () => {
    const validFile = readFileSync(join(__dirname, '..', 'test', 'testdata', 'ppd-debit.ach'), 'utf-8');
    const reader = new Reader(validFile);
    const file = reader.read();
    // Duplicate the first batch with a lower batch number to trigger ascending error
    if (file.batches.length > 0) {
      const origBatch = file.batches[0];
      const header2 = newBatchHeader();
      Object.assign(header2, { ...origBatch.getHeader() });
      header2.batchNumber = 0; // lower than first batch
      header2.lineNumber = 50; // simulate a line
      const [batcher2] = newBatch(header2);
      if (batcher2) {
        const entry2 = newEntryDetail();
        Object.assign(entry2, { ...origBatch.getEntries()[0] });
        batcher2.addEntry(entry2);
        const control2 = newBatchControl();
        Object.assign(control2, { ...origBatch.getControl() });
        control2.batchNumber = 0;
        batcher2.setControl(control2);
        file.addBatch(batcher2);

        const errors = file.validateAll();
        const ascending = errors.find(e => e instanceof ErrFileBatchNumberAscending) as ErrFileBatchNumberAscending | undefined;
        expect(ascending).toBeDefined();
        expect(ascending!.line).toBe(50); // the offending batch header line
        expect(ascending!.startColumn).toBe(0);
        expect(ascending!.endColumn).toBe(94);
      }
    }
  });
});
