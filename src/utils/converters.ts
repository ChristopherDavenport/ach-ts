// Licensed to The Moov Authors under one or more contributor
// license agreements. See the NOTICE file distributed with
// this work for additional information regarding copyright
// ownership. The Moov Authors licenses this file to you under
// the Apache License, Version 2.0 (the "License"); you may
// not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied.  See the License for the
// specific language governing permissions and limitations
// under the License.

import { lineLength } from '../constants.js';
import type { ValidateOpts } from '../validateOpts.js';

// Pre-allocated padding strings (mirrors Go's populateMap)
const spaceZeros: Map<number, string> = new Map();
const stringZeros: Map<number, string> = new Map();

for (let i = 0; i < lineLength; i++) {
  spaceZeros.set(i, ' '.repeat(i));
  stringZeros.set(i, '0'.repeat(i));
}

/**
 * Converters handles golang to ACH type conversions.
 * Used via composition in record types.
 */
export class Converters {
  /**
   * Parse a numeric field from a string, trimming spaces.
   * Returns 0 if the string cannot be parsed.
   */
  parseNumField(r: string): number {
    const n = parseInt(r.trim(), 10);
    return isNaN(n) ? 0 : n;
  }

  /**
   * Parse a string field, trimming whitespace.
   */
  parseStringField(r: string): string {
    return r.trim();
  }

  /**
   * Parse a string field with optional space preservation.
   */
  parseStringFieldWithOpts(r: string, opts: ValidateOpts | undefined): string {
    if (opts?.preserveSpaces) {
      return r;
    }
    return this.parseStringField(r);
  }

  /**
   * Format a YYMMDD date for the fixed-width ACH format.
   * Returns zero-padded 6 characters if empty.
   */
  formatSimpleDate(s: string): string {
    if (s === '') {
      return this.stringField(s, 6);
    }
    return s;
  }

  /**
   * Format a HHmm time for the fixed-width ACH format.
   * Returns zero-padded 4 characters if empty.
   */
  formatSimpleTime(s: string): string {
    if (s === '') {
      return this.stringField(s, 4);
    }
    return s;
  }

  /**
   * Alphanumeric and Alphabetic fields are left-justified and space filled.
   */
  alphaField(s: string, max: number): string {
    const count = [...s].length; // Unicode-aware character count
    if (count < 0) return '';

    // ACH never has lines longer than 94 characters
    if (max > lineLength) return '';

    if (count > max) {
      // Truncate to max characters (Unicode-aware)
      return [...s].slice(0, max).join('');
    }

    const m = max - count;
    if (m < 0) return '';

    const pad = spaceZeros.get(m);
    if (pad !== undefined) {
      return s + pad;
    }
    // slow path
    return s + ' '.repeat(m);
  }

  /**
   * Numeric fields are right-justified, unsigned, and zero filled.
   */
  numericField(n: number, max: number): string {
    // ACH never has lines longer than 94 characters
    if (max > lineLength) return '';

    const s = String(n);
    const l = s.length;

    // Truncate if the length exceeds max (keep least significant digits)
    if (l > max) {
      return s.slice(l - max);
    }

    const m = max - l;
    if (m < 0) return '';

    const pad = stringZeros.get(m);
    if (pad !== undefined) {
      return pad + s;
    }
    // slow path
    return '0'.repeat(m) + s;
  }

  /**
   * String field is sliced to max length and zero filled (right-justified, zero-padded).
   */
  stringField(s: string, max: number): string {
    const count = [...s].length; // Unicode-aware character count
    if (count < 0) return '';

    // ACH never has lines longer than 94 characters
    if (max > lineLength) return '';

    if (count > max) {
      // Truncate to max characters (Unicode-aware)
      return [...s].slice(0, max).join('');
    }

    const m = max - count;
    if (m < 0) return '';

    const pad = stringZeros.get(m);
    if (pad !== undefined) {
      return pad + s;
    }
    // slow path
    return '0'.repeat(m) + s;
  }

  /**
   * Returns the least significant digits of v limited by maxDigits.
   */
  leastSignificantDigits(v: number, maxDigits: number): number {
    if (maxDigits > lineLength) return 0;
    return v % Math.pow(10, maxDigits);
  }
}

/** Shared singleton instance — Converters is stateless. */
export const converters = new Converters();
