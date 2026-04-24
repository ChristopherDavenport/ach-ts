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

  return out;
}
