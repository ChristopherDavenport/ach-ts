/**
 * End-to-end test demonstrating the LSP diagnostic workflow:
 *
 *   1. Parse with reader.readWithErrors()
 *   2. If no parse errors, run file.validateAll()
 *   3. Map every error to an LSP Diagnostic using only error properties
 *
 * No LSP dependency — this test proves the library exposes enough
 * structured data (line, columns, code, severity, relatedLocations)
 * for a language server to translate directly to Diagnostic[].
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  Reader,
  ACHError,
  FieldError,
  BatchError,
  ParseError,
  ErrFileCalculatedControlEquality,
  ErrFileBatchNumberAscending,
} from '../src/index.js';
import type { RelatedLocation } from '../src/errors/index.js';

// ---- Minimal LSP type stand-ins (no vscode-languageserver dependency) ----

interface DiagnosticRange {
  start: { line: number; character: number };
  end: { line: number; character: number };
}

interface DiagnosticRelatedInformation {
  location: { uri: string; range: DiagnosticRange };
  message: string;
}

interface Diagnostic {
  range: DiagnosticRange;
  message: string;
  severity: 1 | 2 | 3 | 4; // Error, Warning, Information, Hint
  code?: string;
  source: string;
  relatedInformation?: DiagnosticRelatedInformation[];
}

// ---- Translator: library errors → LSP Diagnostics ----

function severityToLSP(sev?: 'error' | 'warning' | 'info'): 1 | 2 | 3 | 4 {
  switch (sev) {
    case 'warning': return 2;
    case 'info':    return 3;
    default:        return 1; // error
  }
}

function makeDiagnostic(err: Error, uri: string): Diagnostic | null {
  let line = 0;
  let startCol = 0;
  let endCol = 94;
  let code: string | undefined;
  let severity: 1 | 2 | 3 | 4 = 1;
  let relatedLocations: RelatedLocation[] | undefined;

  if (err instanceof ParseError) {
    line = err.line;
    if (err.startColumn !== undefined) startCol = err.startColumn;
    if (err.endColumn !== undefined) endCol = err.endColumn;
    code = err.code;
    severity = severityToLSP((err as ACHError).severity);
  } else if (err instanceof FieldError) {
    line = err.line ?? 0;
    if (err.startColumn !== undefined) startCol = err.startColumn;
    if (err.endColumn !== undefined) endCol = err.endColumn;
    code = err.code;
    severity = severityToLSP(err.severity);
  } else if (err instanceof BatchError) {
    line = err.line ?? 0;
    if (err.startColumn !== undefined) startCol = err.startColumn;
    if (err.endColumn !== undefined) endCol = err.endColumn;
    code = err.code;
    severity = severityToLSP(err.severity);
    relatedLocations = err.relatedLocations;
  } else if (err instanceof ErrFileCalculatedControlEquality) {
    line = err.line ?? 0;
    if (err.startColumn !== undefined) startCol = err.startColumn;
    if (err.endColumn !== undefined) endCol = err.endColumn;
    code = err.code;
    relatedLocations = err.relatedLocations;
  } else if (err instanceof ErrFileBatchNumberAscending) {
    line = err.line ?? 0;
    if (err.startColumn !== undefined) startCol = err.startColumn;
    if (err.endColumn !== undefined) endCol = err.endColumn;
    code = err.code;
  } else {
    return null; // Unknown error type — skip
  }

  const diag: Diagnostic = {
    range: {
      start: { line: Math.max(0, line - 1), character: startCol },  // LSP lines are 0-based, clamp to 0
      end:   { line: Math.max(0, line - 1), character: endCol },
    },
    message: err.message,
    severity,
    source: 'ach',
  };
  if (code) diag.code = code;

  if (relatedLocations && relatedLocations.length > 0) {
    diag.relatedInformation = relatedLocations.map(rl => ({
      location: {
        uri,
        range: {
          start: { line: rl.line - 1, character: rl.startColumn },
          end:   { line: rl.line - 1, character: rl.endColumn },
        },
      },
      message: rl.message,
    }));
  }

  return diag;
}

function collectDiagnostics(text: string, uri: string): { parse: Diagnostic[]; validation: Diagnostic[] } {
  const reader = new Reader(text);
  const { file, errors: parseErrors } = reader.readWithErrors();

  const parse: Diagnostic[] = [];
  for (const err of parseErrors) {
    const d = makeDiagnostic(err, uri);
    if (d) parse.push(d);
  }

  // Validation runs on the parsed file regardless — it catches
  // structural issues (header/control mismatches, batch ordering)
  // that the Reader doesn't check.
  const validation: Diagnostic[] = [];
  const valErrors = file.validateAll();
  for (const err of valErrors) {
    const d = makeDiagnostic(err, uri);
    if (d) validation.push(d);
  }

  return { parse, validation };
}

// =========================================================================
// Tests
// =========================================================================

const testdataDir = join(__dirname, '..', 'test', 'testdata');

describe('LSP Diagnostic workflow', () => {

  // --- Valid files produce zero diagnostics ---

  it('valid PPD file produces no diagnostics', () => {
    const text = readFileSync(join(testdataDir, 'ppd-debit.ach'), 'utf-8');
    const { parse, validation } = collectDiagnostics(text, 'file:///ppd-debit.ach');
    expect(parse).toEqual([]);
    expect(validation).toEqual([]);
  });

  it('valid IAT file produces no diagnostics', () => {
    const text = readFileSync(join(testdataDir, 'iat-debit.ach'), 'utf-8');
    const { parse, validation } = collectDiagnostics(text, 'file:///iat-debit.ach');
    expect(parse).toEqual([]);
    expect(validation).toEqual([]);
  });

  // --- Parse errors carry line + columns ---

  it('empty input produces ParseError diagnostics with line numbers', () => {
    const { parse } = collectDiagnostics('', 'file:///empty.ach');
    expect(parse.length).toBeGreaterThan(0);
    for (const d of parse) {
      expect(d.source).toBe('ach');
      expect(d.severity).toBe(1); // error
      // Line should be 0-based ≥ 0 (line 1 → 0)
      expect(d.range.start.line).toBeGreaterThanOrEqual(0);
      expect(d.code).toBeDefined();
    }
  });

  it('truncated line produces ParseError with line and column range', () => {
    // A valid file header followed by a truncated batch header (short line)
    const header = '101 076401251 0764012512406241200A094101DEST NAME              ORIGIN NAME            REF     ';
    const shortLine = '5200COMPANY                    1234567890PPDPAYROLL         240101   1076401250000001';
    const text = header + '\n' + shortLine + '\n';
    const { parse } = collectDiagnostics(text, 'file:///short.ach');
    // Should have errors — at minimum a wrong-length record or missing control
    expect(parse.length).toBeGreaterThan(0);
    // All diagnostics have valid ranges
    for (const d of parse) {
      expect(d.range.start.line).toBeGreaterThanOrEqual(0);
      expect(d.range.end.character).toBeGreaterThan(d.range.start.character);
    }
  });

  // --- Validation errors carry full positional data ---

  it('tampered batch control produces BatchError with line, columns, and relatedLocations', () => {
    const text = readFileSync(join(testdataDir, 'ppd-debit.ach'), 'utf-8');
    const lines = text.split('\n').filter(l => l.length > 0);

    // Find the batch control line (starts with '8') and tamper ServiceClassCode
    // Use a valid but mismatched value so the Reader parses OK but validateAll detects mismatch.
    // Original SCC is 225 (DebitsOnly) — change to 200 (MixedDebitsAndCredits)
    const bcIdx = lines.findIndex(l => l.startsWith('8'));
    expect(bcIdx).toBeGreaterThan(0);
    const original = lines[bcIdx];
    lines[bcIdx] = '8200' + original.slice(4);

    // Also find batch header to check relatedLocations
    const bhIdx = lines.findIndex(l => l.startsWith('5'));
    expect(bhIdx).toBeGreaterThan(0);

    const tampered = lines.join('\n') + '\n';
    // The Reader detects the mismatch at parse-time via batch.validate(),
    // but the richer BatchError with relatedLocations comes from validateAll().
    const { validation } = collectDiagnostics(tampered, 'file:///tampered.ach');

    // Should have at least one BatchError for ServiceClassCode mismatch
    const sccDiags = validation.filter(d =>
      d.message.includes('ServiceClassCode') || d.message.includes('Service Class Code') ||
      d.code === 'batchHeaderControlEquality'
    );
    expect(sccDiags.length).toBeGreaterThan(0);

    for (const d of sccDiags) {
      expect(d.range.start.line).toBeGreaterThanOrEqual(0);
      expect(d.range.end.character).toBeGreaterThan(d.range.start.character);
      expect(d.code).toBeDefined();
      expect(d.severity).toBe(1); // error
    }

    // At least one should have relatedInformation pointing to the header
    const withRelated = sccDiags.filter(d => d.relatedInformation && d.relatedInformation.length > 0);
    expect(withRelated.length).toBeGreaterThan(0);
    const ri = withRelated[0].relatedInformation![0];
    expect(ri.location.uri).toBe('file:///tampered.ach');
    expect(ri.location.range.start.line).toBe(bhIdx); // 0-based header line
    expect(ri.message).toContain('header value');
  });

  it('tampered file control produces ErrFileCalculatedControlEquality with relatedLocations', () => {
    const text = readFileSync(join(testdataDir, 'ppd-debit.ach'), 'utf-8');
    const lines = text.split('\n').filter(l => l.length > 0);

    // Find the file control line (starts with '9', not padding nines)
    const fcIdx = lines.findIndex(l => l.startsWith('9') && !l.match(/^9{94}$/));
    expect(fcIdx).toBeGreaterThan(0);

    // Tamper batch count (positions 1-7): set to 99
    const original = lines[fcIdx];
    lines[fcIdx] = '9000099' + original.slice(7);

    const tampered = lines.join('\n') + '\n';
    const { validation } = collectDiagnostics(tampered, 'file:///tampered-fc.ach');

    const fcDiags = validation.filter(d =>
      d.code === 'fileCalculatedControlEquality' ||
      d.message.includes('out-of-balance with file control')
    );
    expect(fcDiags.length).toBeGreaterThan(0);

    const d = fcDiags[0];
    expect(d.range.start.line).toBe(fcIdx); // 0-based file control line
    expect(d.range.start.character).toBeDefined();
    expect(d.code).toBe('fileCalculatedControlEquality');
  });

  // --- Every diagnostic has required fields ---

  it('all diagnostics from an invalid file have source, severity, line, and column range', () => {
    // Intentionally bad: just a header with no batches or control
    const header = '101 076401251 0764012512406241200A094101DEST NAME              ORIGIN NAME            REF     ';
    const { parse } = collectDiagnostics(header + '\n', 'file:///partial.ach');

    expect(parse.length).toBeGreaterThan(0);
    for (const d of parse) {
      expect(d.source).toBe('ach');
      expect(d.severity).toBeGreaterThanOrEqual(1);
      expect(d.severity).toBeLessThanOrEqual(4);
      expect(d.range.start.line).toBeGreaterThanOrEqual(0);
      expect(d.range.end.character).toBeGreaterThanOrEqual(d.range.start.character);
      expect(d.message.length).toBeGreaterThan(0);
    }
  });

  // --- Error codes propagate through the chain ---

  it('error codes are stable and present on diagnostics', () => {
    const text = readFileSync(join(testdataDir, 'ppd-debit.ach'), 'utf-8');
    const lines = text.split('\n').filter(l => l.length > 0);

    // Tamper entry detail TransactionCode (positions 1-3) to invalid value
    const edIdx = lines.findIndex(l => l.startsWith('6'));
    expect(edIdx).toBeGreaterThan(0);
    const original = lines[edIdx];
    lines[edIdx] = '6XX' + original.slice(3);

    const tampered = lines.join('\n') + '\n';
    const { parse, validation } = collectDiagnostics(tampered, 'file:///bad-tc.ach');
    const all = [...parse, ...validation];

    // Should produce diagnostics — some with error codes
    const coded = all.filter(d => d.code !== undefined);
    expect(coded.length).toBeGreaterThan(0);

    // Codes should be camelCase strings, not numbers
    for (const d of coded) {
      expect(typeof d.code).toBe('string');
      expect((d.code as string).length).toBeGreaterThan(0);
    }
  });

  // --- IAT file validation errors carry positions ---

  it('IAT file with tampered addenda produces diagnostics with line and columns', () => {
    const text = readFileSync(join(testdataDir, 'iat-debit.ach'), 'utf-8');
    const lines = text.split('\n').filter(l => l.length > 0);

    // Find the first addenda 10 line (starts with '710')
    const a10Idx = lines.findIndex(l => l.startsWith('710'));
    expect(a10Idx).toBeGreaterThan(0);

    // Tamper the typeCode to an invalid value (positions 1-3)
    const original = lines[a10Idx];
    lines[a10Idx] = '7XX' + original.slice(3);

    const tampered = lines.join('\n') + '\n';
    const { parse, validation } = collectDiagnostics(tampered, 'file:///bad-iat.ach');
    const all = [...parse, ...validation];

    expect(all.length).toBeGreaterThan(0);
    for (const d of all) {
      expect(d.range.start.line).toBeGreaterThanOrEqual(0);
      expect(d.message.length).toBeGreaterThan(0);
    }
  });
});
