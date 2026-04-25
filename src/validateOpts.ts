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

/**
 * Severity level for individual validation checks.
 * - 'error': validation failure (default)
 * - 'warning': issue reported but not a hard failure
 * - 'info': informational only
 * - 'skip': validation is not run (equivalent to setting the boolean bypass flag)
 */
export type ValidationLevel = 'error' | 'warning' | 'info' | 'skip';

/**
 * ValidateOpts allows customization of NACHA validation rules.
 * Fields can be set to bypass certain checks that are normally enforced.
 */
export interface ValidateOpts {
  /** SkipAll will disable all validation checks of a File. */
  skipAll?: boolean;

  /** RequireABAOrigin enables routing number validation over the ImmediateOrigin field. */
  requireABAOrigin?: boolean;

  /** BypassOriginValidation skips validation for the ImmediateOrigin file header field. */
  bypassOriginValidation?: boolean;

  /** BypassDestinationValidation skips validation for the ImmediateDestination file header field. */
  bypassDestinationValidation?: boolean;

  /**
   * CheckTransactionCode allows for custom validation of TransactionCode values.
   * Note: Functions cannot be serialized to JSON.
   */
  checkTransactionCode?: (code: number) => Error | null;

  /** CustomTraceNumbers disables Nacha specified checks of TraceNumbers. */
  customTraceNumbers?: boolean;

  /** AllowZeroBatches allows the file to have zero batches. */
  allowZeroBatches?: boolean;

  /** AllowMissingFileHeader allows a file to be read without a FileHeader record. */
  allowMissingFileHeader?: boolean;

  /** AllowMissingFileControl allows a file to be read without a FileControl record. */
  allowMissingFileControl?: boolean;

  /** BypassCompanyIdentificationMatch allows mismatched Company Identification in batch header/control. */
  bypassCompanyIdentificationMatch?: boolean;

  /** CustomReturnCodes skips validation for the Return Code field in an Addenda99. */
  customReturnCodes?: boolean;

  /** UnequalServiceClassCode skips equality checks for ServiceClassCode in BatchHeader/BatchControl pairs. */
  unequalServiceClassCode?: boolean;

  /** AllowUnorderedBatchNumbers allows a file to be read with unordered batch numbers. */
  allowUnorderedBatchNumbers?: boolean;

  /** AllowInvalidCheckDigit allows the CheckDigit field to differ from the expected calculation. */
  allowInvalidCheckDigit?: boolean;

  /** UnequalAddendaCounts skips checking that Addenda Count fields match expected values. */
  unequalAddendaCounts?: boolean;

  /** PreserveSpaces keeps spacing before and after values that normally have spaces trimmed. */
  preserveSpaces?: boolean;

  /** AllowInvalidAmounts skips verifying Amount is valid for the TransactionCode and entry type. */
  allowInvalidAmounts?: boolean;

  /** AllowZeroEntryAmount skips enforcing the entry Amount to be non-zero. */
  allowZeroEntryAmount?: boolean;

  /** AllowSpecialCharacters permits a wider range of UTF-8 characters in alphanumeric fields. */
  allowSpecialCharacters?: boolean;

  /** AllowEmptyIndividualName skips verifying IndividualName fields are populated. */
  allowEmptyIndividualName?: boolean;

  /** BypassBatchValidation skips validation for batches in a file. */
  bypassBatchValidation?: boolean;

  /** SkipFileCreationValidation skips validation of FileCreationTime and FileCreationDate fields. */
  skipFileCreationValidation?: boolean;

  /** SkipBatchHeaderCompanyValidation bypasses validation of Company fields in a BatchHeader. */
  skipBatchHeaderCompanyValidation?: boolean;

  /**
   * Per-validation severity overrides. Keys can be:
   * - Boolean flag names (e.g., 'allowSpecialCharacters', 'allowInvalidCheckDigit')
   * - Stable error codes (e.g., 'nonAlphanumeric', 'fieldRequired')
   *
   * Values are ValidationLevel: 'error' | 'warning' | 'info' | 'skip'.
   * Setting a flag name to 'skip' is equivalent to setting the boolean flag to true.
   * Boolean flags take precedence over validationLevels when both are set.
   */
  validationLevels?: Record<string, ValidationLevel>;
}

/**
 * Merge two ValidateOpts, keeping any truthy (non-zero) field values from either.
 * If either is undefined, returns the other.
 */
export function mergeValidateOpts(
  a: ValidateOpts | undefined,
  b: ValidateOpts | undefined,
): ValidateOpts | undefined {
  if (!a) return b;
  if (!b) return a;

  const out: ValidateOpts = {
    skipAll: a.skipAll || b.skipAll,
    requireABAOrigin: a.requireABAOrigin || b.requireABAOrigin,
    bypassOriginValidation: a.bypassOriginValidation || b.bypassOriginValidation,
    bypassDestinationValidation: a.bypassDestinationValidation || b.bypassDestinationValidation,
    customTraceNumbers: a.customTraceNumbers || b.customTraceNumbers,
    allowZeroBatches: a.allowZeroBatches || b.allowZeroBatches,
    allowMissingFileHeader: a.allowMissingFileHeader || b.allowMissingFileHeader,
    allowMissingFileControl: a.allowMissingFileControl || b.allowMissingFileControl,
    bypassCompanyIdentificationMatch: a.bypassCompanyIdentificationMatch || b.bypassCompanyIdentificationMatch,
    customReturnCodes: a.customReturnCodes || b.customReturnCodes,
    unequalServiceClassCode: a.unequalServiceClassCode || b.unequalServiceClassCode,
    allowUnorderedBatchNumbers: a.allowUnorderedBatchNumbers || b.allowUnorderedBatchNumbers,
    allowInvalidCheckDigit: a.allowInvalidCheckDigit || b.allowInvalidCheckDigit,
    unequalAddendaCounts: a.unequalAddendaCounts || b.unequalAddendaCounts,
    preserveSpaces: a.preserveSpaces || b.preserveSpaces,
    allowInvalidAmounts: a.allowInvalidAmounts || b.allowInvalidAmounts,
    allowZeroEntryAmount: a.allowZeroEntryAmount || b.allowZeroEntryAmount,
    allowSpecialCharacters: a.allowSpecialCharacters || b.allowSpecialCharacters,
    allowEmptyIndividualName: a.allowEmptyIndividualName || b.allowEmptyIndividualName,
    bypassBatchValidation: a.bypassBatchValidation || b.bypassBatchValidation,
    skipFileCreationValidation: a.skipFileCreationValidation || b.skipFileCreationValidation,
    skipBatchHeaderCompanyValidation: a.skipBatchHeaderCompanyValidation || b.skipBatchHeaderCompanyValidation,
  };

  if (a.checkTransactionCode) {
    out.checkTransactionCode = a.checkTransactionCode;
  }
  if (b.checkTransactionCode) {
    out.checkTransactionCode = b.checkTransactionCode;
  }

  // Merge validationLevels maps: b overrides a for same keys
  if (a.validationLevels || b.validationLevels) {
    out.validationLevels = { ...a.validationLevels, ...b.validationLevels };
  }

  return out;
}

/**
 * Check whether a validation identified by flagName should be skipped.
 * Returns true if the boolean flag is truthy OR validationLevels maps it to 'skip'.
 */
export function isSkipped(opts: ValidateOpts | undefined, flagName: keyof ValidateOpts): boolean {
  if (!opts) return false;
  if (opts[flagName]) return true;
  return opts.validationLevels?.[flagName] === 'skip';
}

/**
 * Look up the validation level for a flag name from validationLevels.
 * Returns undefined if not set (caller should use default behavior).
 * Does NOT check the boolean flag — use isSkipped() for skip logic.
 */
export function getFlagLevel(opts: ValidateOpts | undefined, flagName: string): ValidationLevel | undefined {
  return opts?.validationLevels?.[flagName];
}

/**
 * Apply validation-level severity overrides to a single error.
 * Checks the error's code (and FieldError/BatchError cause code) against validationLevels.
 * Also checks flag-name overrides when flagName is provided.
 * Returns null if the resolved level is 'skip'. Otherwise sets severity and returns the error.
 */
export function applyErrorLevel(
  err: Error | null,
  opts: ValidateOpts | undefined,
  flagName?: string,
): Error | null {
  if (!err || !opts?.validationLevels) return err;

  let level: ValidationLevel | undefined;

  // Check flag-name override first
  if (flagName) {
    level = opts.validationLevels[flagName];
  }

  // Check error-code override (more specific, so it wins if set)
  const code = (err as { code?: string }).code;
  if (code && opts.validationLevels[code] !== undefined) {
    level = opts.validationLevels[code];
  }

  // Check cause error-code (for FieldError/BatchError wrapping sentinel errors)
  const cause = (err as { cause?: Error }).cause;
  if (cause) {
    const causeCode = (cause as { code?: string }).code;
    if (causeCode && opts.validationLevels[causeCode] !== undefined) {
      level = opts.validationLevels[causeCode];
    }
  }

  if (level === undefined) return err;
  if (level === 'skip') return null;

  // Set severity on ACHError instances
  if ('severity' in err) {
    (err as { severity: string }).severity = level;
  }

  return err;
}

/**
 * Apply validation-level severity overrides to an array of errors.
 * Filters out errors whose resolved level is 'skip'.
 */
export function applyErrorLevels(
  errors: Error[],
  opts: ValidateOpts | undefined,
): Error[] {
  if (!opts?.validationLevels || errors.length === 0) return errors;
  const out: Error[] = [];
  for (const err of errors) {
    const result = applyErrorLevel(err, opts);
    if (result) out.push(result);
  }
  return out;
}
