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

/** Base error class for all ACH errors */
export class ACHError extends Error {
  /** Stable error code for programmatic identification (e.g. 'fieldInclusion', 'serviceClass') */
  code?: string;
  /** Error severity: 'error' | 'warning' | 'info'. Defaults to 'error' when undefined. */
  severity?: 'error' | 'warning' | 'info';

  constructor(message: string) {
    super(message);
    this.name = 'ACHError';
  }
}

// --- Field-level errors ---

/** FieldError is returned for errors at a field level in a record */
export class FieldError extends ACHError {
  fieldName: string;
  value: unknown;
  cause: Error | undefined;
  /** 1-based line number in the ACH file (set by enrichErrors) */
  line?: number;
  /** 0-based inclusive start column (set by enrichErrors) */
  startColumn?: number;
  /** 0-based exclusive end column (set by enrichErrors) */
  endColumn?: number;

  constructor(fieldName: string, err: Error, value?: unknown) {
    // Format: "FieldName value error message"
    const msg = `${fieldName} ${value !== undefined ? value + ' ' : ''}${err.message}`;
    super(msg);
    this.name = 'FieldError';
    this.fieldName = fieldName;
    this.value = value;
    this.cause = err;
    // Inherit code from cause if it's an ACHError
    if (err instanceof ACHError && err.code) {
      this.code = err.code;
    }
  }
}

/**
 * Create a FieldError (mirrors Go's fieldError helper).
 * Returns null if err is null/undefined.
 */
export function fieldError(field: string, err: Error | null | undefined, value?: unknown): FieldError | null {
  if (!err) return null;
  if (err instanceof FieldError) return err;
  return new FieldError(field, err, value);
}

// --- Sentinel errors for field validation ---

export const ErrNonAlphanumeric = new ACHError('has non alphanumeric characters');
ErrNonAlphanumeric.code = 'nonAlphanumeric';
ErrNonAlphanumeric.severity = 'warning';
Object.freeze(ErrNonAlphanumeric);
export const ErrUpperAlpha = new ACHError('is not uppercase A-Z or 0-9');
ErrUpperAlpha.code = 'upperAlpha';
ErrUpperAlpha.severity = 'warning';
Object.freeze(ErrUpperAlpha);
export const ErrFieldInclusion = new ACHError('is a mandatory field and has a default value');
ErrFieldInclusion.code = 'fieldInclusion';
Object.freeze(ErrFieldInclusion);
export const ErrConstructor = new ACHError('is a mandatory field and has a default value, did you use the constructor?');
ErrConstructor.code = 'constructor';
Object.freeze(ErrConstructor);
export const ErrFieldRequired = new ACHError('is a required field');
ErrFieldRequired.code = 'fieldRequired';
Object.freeze(ErrFieldRequired);
export const ErrServiceClass = new ACHError('is an invalid Service Class Code');
ErrServiceClass.code = 'serviceClass';
Object.freeze(ErrServiceClass);
export const ErrSECCode = new ACHError('is an invalid Standard Entry Class Code');
ErrSECCode.code = 'secCode';
Object.freeze(ErrSECCode);
export const ErrOrigStatusCode = new ACHError('is an invalid Originator Status Code');
ErrOrigStatusCode.code = 'origStatusCode';
Object.freeze(ErrOrigStatusCode);
export const ErrAddendaTypeCode = new ACHError('is an invalid Addenda Type Code');
ErrAddendaTypeCode.code = 'addendaTypeCode';
Object.freeze(ErrAddendaTypeCode);
export const ErrTransactionCode = new ACHError('is an invalid Transaction Code');
ErrTransactionCode.code = 'transactionCode';
Object.freeze(ErrTransactionCode);
export const ErrIdentificationNumber = new ACHError('is an invalid identification number');
ErrIdentificationNumber.code = 'identificationNumber';
Object.freeze(ErrIdentificationNumber);
export const ErrCardTransactionType = new ACHError('is an invalid Card Transaction Type');
ErrCardTransactionType.code = 'cardTransactionType';
Object.freeze(ErrCardTransactionType);
export const ErrValidMonth = new ACHError('is an invalid month');
ErrValidMonth.code = 'validMonth';
Object.freeze(ErrValidMonth);
export const ErrValidDay = new ACHError('is an invalid day');
ErrValidDay.code = 'validDay';
Object.freeze(ErrValidDay);
export const ErrValidYear = new ACHError('is an invalid year');
ErrValidYear.code = 'validYear';
Object.freeze(ErrValidYear);
export const ErrValidState = new ACHError('is an invalid US state or territory');
ErrValidState.code = 'validState';
Object.freeze(ErrValidState);
export const ErrValidISO3166 = new ACHError('is an invalid ISO 3166-1-alpha-2 code');
ErrValidISO3166.code = 'validISO3166';
Object.freeze(ErrValidISO3166);
export const ErrValidISO4217 = new ACHError('is an invalid ISO 4217 code');
ErrValidISO4217.code = 'validISO4217';
Object.freeze(ErrValidISO4217);
export const ErrNegativeAmount = new ACHError('amounts cannot be negative');
ErrNegativeAmount.code = 'negativeAmount';
Object.freeze(ErrNegativeAmount);
export const ErrAddenda98ChangeCode = new ACHError('found is not a valid addenda Change Code');
ErrAddenda98ChangeCode.code = 'addenda98ChangeCode';
Object.freeze(ErrAddenda98ChangeCode);
export const ErrAddenda98RefusedChangeCode = new ACHError('found is not a valid addenda Refused Change Code');
ErrAddenda98RefusedChangeCode.code = 'addenda98RefusedChangeCode';
Object.freeze(ErrAddenda98RefusedChangeCode);
export const ErrAddenda98RefusedTraceSequenceNumber = new ACHError('found is not a valid addenda trace sequence number');
ErrAddenda98RefusedTraceSequenceNumber.code = 'addenda98RefusedTraceSequenceNumber';
Object.freeze(ErrAddenda98RefusedTraceSequenceNumber);
export const ErrAddenda98CorrectedData = new ACHError('must contain the corrected information corresponding to the Change Code');
ErrAddenda98CorrectedData.code = 'addenda98CorrectedData';
Object.freeze(ErrAddenda98CorrectedData);
export const ErrAddenda99ReturnCode = new ACHError('found is not a valid return code');
ErrAddenda99ReturnCode.code = 'addenda99ReturnCode';
Object.freeze(ErrAddenda99ReturnCode);
export const ErrAddenda99DishonoredReturnCode = new ACHError('found is not a valid dishonored return code');
ErrAddenda99DishonoredReturnCode.code = 'addenda99DishonoredReturnCode';
Object.freeze(ErrAddenda99DishonoredReturnCode);
export const ErrAddenda99ContestedReturnCode = new ACHError('found is not a valid contested dishonored return code');
ErrAddenda99ContestedReturnCode.code = 'addenda99ContestedReturnCode';
Object.freeze(ErrAddenda99ContestedReturnCode);
export const ErrBatchCORAddenda = new ACHError('one Addenda98 or Addenda98Refused record is required for each entry in SEC Type COR');
ErrBatchCORAddenda.code = 'batchCORAddenda';
Object.freeze(ErrBatchCORAddenda);
export const ErrRecordSize = new ACHError('is not 094');
ErrRecordSize.code = 'recordSize';
Object.freeze(ErrRecordSize);
export const ErrBlockingFactor = new ACHError('is not 10');
ErrBlockingFactor.code = 'blockingFactor';
Object.freeze(ErrBlockingFactor);
export const ErrFormatCode = new ACHError('is not 1');
ErrFormatCode.code = 'formatCode';
Object.freeze(ErrFormatCode);
export const ErrExceedsFieldLength = new ACHError('exceeds the Nacha field length');
ErrExceedsFieldLength.code = 'exceedsFieldLength';
Object.freeze(ErrExceedsFieldLength);
export const ErrForeignExchangeIndicator = new ACHError('is an invalid Foreign Exchange Indicator');
ErrForeignExchangeIndicator.code = 'foreignExchangeIndicator';
Object.freeze(ErrForeignExchangeIndicator);
export const ErrForeignExchangeReferenceIndicator = new ACHError('is an invalid Foreign Exchange Reference Indicator');
ErrForeignExchangeReferenceIndicator.code = 'foreignExchangeReferenceIndicator';
Object.freeze(ErrForeignExchangeReferenceIndicator);
export const ErrTransactionTypeCode = new ACHError('is an invalid Addenda10 Transaction Type Code');
ErrTransactionTypeCode.code = 'transactionTypeCode';
Object.freeze(ErrTransactionTypeCode);
export const ErrIDNumberQualifier = new ACHError('is an invalid Identification Number Qualifier');
ErrIDNumberQualifier.code = 'idNumberQualifier';
Object.freeze(ErrIDNumberQualifier);
export const ErrIATBatchAddendaIndicator = new ACHError('is invalid for addenda record(s) found');
ErrIATBatchAddendaIndicator.code = 'iatBatchAddendaIndicator';
Object.freeze(ErrIATBatchAddendaIndicator);
export const ErrOnlyZeros = new ACHError('contains only spaces and zeros');
ErrOnlyZeros.code = 'onlyZeros';
Object.freeze(ErrOnlyZeros);

// --- Structured error types ---

export class ErrValidCheckDigit extends ACHError {
  calculatedCheckDigit: number;
  override code = 'validCheckDigit';
  constructor(digit: number) {
    super(`does not match calculated check digit ${digit}`);
    this.name = 'ErrValidCheckDigit';
    this.calculatedCheckDigit = digit;
  }
}

export class ErrValidFieldLength extends ACHError {
  expectedLength: number;
  override code = 'validFieldLength';
  constructor(expectedLength: number) {
    super(`is not length ${expectedLength}`);
    this.name = 'ErrValidFieldLength';
    this.expectedLength = expectedLength;
  }
}

export class ErrRecordType extends ACHError {
  expectedType: number;
  override code = 'recordType';
  constructor(expectedType: number) {
    super(`received expecting ${expectedType}`);
    this.name = 'ErrRecordType';
    this.expectedType = expectedType;
  }
}

// --- Batch errors ---

/** Related location for cross-record diagnostic context */
export interface RelatedLocation {
  line: number;
  startColumn: number;
  endColumn: number;
  message: string;
}

export class BatchError extends ACHError {
  batchNumber: number;
  batchType: string;
  fieldName: string;
  fieldValue: unknown;
  /** 1-based line number in the ACH file (set during batch validation) */
  line?: number;
  /** 0-based inclusive start column */
  startColumn?: number;
  /** 0-based exclusive end column */
  endColumn?: number;
  /** Related locations for cross-record errors (e.g. header vs control mismatch) */
  relatedLocations?: RelatedLocation[];

  constructor(batchNumber: number, batchType: string, fieldName: string, err: Error, fieldValue?: unknown) {
    const msg = fieldValue !== undefined
      ? `batch #${batchNumber} (${batchType}) ${fieldName} ${err.message}: ${fieldValue}`
      : `batch #${batchNumber} (${batchType}) ${fieldName} ${err.message}`;
    super(msg);
    this.name = 'BatchError';
    this.batchNumber = batchNumber;
    this.batchType = batchType;
    this.fieldName = fieldName;
    this.fieldValue = fieldValue;
    this.cause = err;
    // Inherit code from cause if it's an ACHError
    if (err instanceof ACHError && err.code) {
      this.code = err.code;
    }
  }
}

// Batch sentinel errors
export const ErrBatchNoEntries = new ACHError('must have Entry Record(s) to be built');
ErrBatchNoEntries.code = 'batchNoEntries';
Object.freeze(ErrBatchNoEntries);
export const ErrBatchADVCount = new ACHError('there can be a maximum of 9999 ADV Sequence Numbers (ADV Entry Detail Records)');
ErrBatchADVCount.code = 'batchADVCount';
Object.freeze(ErrBatchADVCount);
export const ErrBatchAddendaIndicator = new ACHError('is 0 but found addenda record(s)');
ErrBatchAddendaIndicator.code = 'batchAddendaIndicator';
Object.freeze(ErrBatchAddendaIndicator);
export const ErrBatchOriginatorDNE = new ACHError('only government agencies (originator status code 2) can originate a DNE');
ErrBatchOriginatorDNE.code = 'batchOriginatorDNE';
Object.freeze(ErrBatchOriginatorDNE);
export const ErrBatchInvalidCardTransactionType = new ACHError('invalid card transaction type');
ErrBatchInvalidCardTransactionType.code = 'batchInvalidCardTransactionType';
Object.freeze(ErrBatchInvalidCardTransactionType);
export const ErrBatchDebitOnly = new ACHError('this batch type does not allow credit transaction codes');
ErrBatchDebitOnly.code = 'batchDebitOnly';
Object.freeze(ErrBatchDebitOnly);
export const ErrBatchCheckSerialNumber = new ACHError('this batch type requires entries to have Check Serial Numbers');
ErrBatchCheckSerialNumber.code = 'batchCheckSerialNumber';
Object.freeze(ErrBatchCheckSerialNumber);
export const ErrBatchSECType = new ACHError("header SEC does not match this batch's type");
ErrBatchSECType.code = 'batchSECType';
Object.freeze(ErrBatchSECType);
export const ErrBatchServiceClassCode = new ACHError("header SCC is not valid for this batch's type");
ErrBatchServiceClassCode.code = 'batchServiceClassCode';
Object.freeze(ErrBatchServiceClassCode);
export const ErrBatchTransactionCode = new ACHError("transaction code is not valid for this batch's type");
ErrBatchTransactionCode.code = 'batchTransactionCode';
Object.freeze(ErrBatchTransactionCode);
export const ErrBatchTransactionCodeAddenda = new ACHError('this batch type does not allow an addenda for this transaction code');
ErrBatchTransactionCodeAddenda.code = 'batchTransactionCodeAddenda';
Object.freeze(ErrBatchTransactionCodeAddenda);
export const ErrBatchAmountNonZero = new ACHError('this batch type requires that the amount is zero');
ErrBatchAmountNonZero.code = 'batchAmountNonZero';
Object.freeze(ErrBatchAmountNonZero);
export const ErrBatchAmountZero = new ACHError('this batch type requires that the amount is non-zero');
ErrBatchAmountZero.code = 'batchAmountZero';
Object.freeze(ErrBatchAmountZero);
export const ErrBatchCompanyEntryDescriptionAutoenroll = new ACHError('this batch type requires that the Company Entry Description is AUTOENROLL');
ErrBatchCompanyEntryDescriptionAutoenroll.code = 'batchCompanyEntryDescriptionAutoenroll';
Object.freeze(ErrBatchCompanyEntryDescriptionAutoenroll);
export const ErrBatchCompanyEntryDescriptionREDEPCHECK = new ACHError('this batch type requires that the Company Entry Description is REDEPCHECK');
ErrBatchCompanyEntryDescriptionREDEPCHECK.code = 'batchCompanyEntryDescriptionREDEPCHECK';
Object.freeze(ErrBatchCompanyEntryDescriptionREDEPCHECK);
export const ErrBatchAddendaCategory = new ACHError('this batch type does not allow this addenda for category');
ErrBatchAddendaCategory.code = 'batchAddendaCategory';
Object.freeze(ErrBatchAddendaCategory);

// Batch structured errors
export class ErrBatchHeaderControlEquality extends ACHError {
  headerValue: unknown;
  controlValue: unknown;
  override code = 'batchHeaderControlEquality';
  constructor(header: unknown, control: unknown) {
    super(`header ${header} is not equal to control ${control}`);
    this.name = 'ErrBatchHeaderControlEquality';
    this.headerValue = header;
    this.controlValue = control;
  }
}

export class ErrBatchCalculatedControlEquality extends ACHError {
  calculatedValue: unknown;
  controlValue: unknown;
  override code = 'batchCalculatedControlEquality';
  constructor(calculated: unknown, control: unknown) {
    super(`calculated ${calculated} is out-of-balance with batch control ${control}`);
    this.name = 'ErrBatchCalculatedControlEquality';
    this.calculatedValue = calculated;
    this.controlValue = control;
  }
}

export class ErrBatchAscending extends ACHError {
  previousTrace: unknown;
  currentTrace: unknown;
  override code = 'batchAscending';
  constructor(previous: unknown, current: unknown) {
    super(`must be in ascending order, ${current} is less than or equal to last number ${previous}`);
    this.name = 'ErrBatchAscending';
    this.previousTrace = previous;
    this.currentTrace = current;
  }
}

export class ErrBatchCategory extends ACHError {
  categoryA: string;
  categoryB: string;
  override code = 'batchCategory';
  constructor(categoryA: string, categoryB: string) {
    super(`${categoryA} category found in batch with category ${categoryB}`);
    this.name = 'ErrBatchCategory';
    this.categoryA = categoryA;
    this.categoryB = categoryB;
  }
}

export class ErrBatchTraceNumberNotODFI extends ACHError {
  odfi: string;
  traceNumber: string;
  override code = 'batchTraceNumberNotODFI';
  constructor(odfi: string, trace: string) {
    super(`${odfi} in header does not match entry trace number ${trace}`);
    this.name = 'ErrBatchTraceNumberNotODFI';
    this.odfi = odfi;
    this.traceNumber = trace;
  }
}

export class ErrBatchAddendaTraceNumber extends ACHError {
  entryDetailNumber: string;
  traceNumber: string;
  override code = 'batchAddendaTraceNumber';
  constructor(entryDetail: string, trace: string) {
    super(`${entryDetail} does not match proceeding entry detail trace number ${trace}`);
    this.name = 'ErrBatchAddendaTraceNumber';
    this.entryDetailNumber = entryDetail;
    this.traceNumber = trace;
  }
}

export class ErrBatchAddendaCount extends ACHError {
  foundCount: number;
  allowedCount: number;
  override code = 'batchAddendaCount';
  constructor(found: number, allowed: number) {
    super(`${found} addendum found where ${allowed} is allowed for this batch type`);
    this.name = 'ErrBatchAddendaCount';
    this.foundCount = found;
    this.allowedCount = allowed;
  }
}

export class ErrBatchRequiredAddendaCount extends ACHError {
  foundCount: number;
  requiredCount: number;
  override code = 'batchRequiredAddendaCount';
  constructor(found: number, required: number) {
    super(`${found} addendum found where ${required} are required for this batch type`);
    this.name = 'ErrBatchRequiredAddendaCount';
    this.foundCount = found;
    this.requiredCount = required;
  }
}

export class ErrBatchExpectedAddendaCount extends ACHError {
  foundCount: number;
  expectedCount: number;
  override code = 'batchExpectedAddendaCount';
  constructor(found: number, expected: number) {
    super(`${found} addendum found where ${expected} are expected for this batch type`);
    this.name = 'ErrBatchExpectedAddendaCount';
    this.foundCount = found;
    this.expectedCount = expected;
  }
}

export class ErrBatchServiceClassTranCode extends ACHError {
  serviceClassCode: number;
  transactionCode: number;
  override code = 'batchServiceClassTranCode';
  constructor(serviceClassCode: number, transactionCode: number) {
    super(`service class code ${serviceClassCode} does not support transaction code ${transactionCode}`);
    this.name = 'ErrBatchServiceClassTranCode';
    this.serviceClassCode = serviceClassCode;
    this.transactionCode = transactionCode;
  }
}

export class ErrBatchAmount extends ACHError {
  amount: number;
  limit: number;
  override code = 'batchAmount';
  constructor(amount: number, limit: number) {
    super(`amounts in this batch type are limited to ${limit}, found amount of ${amount}`);
    this.name = 'ErrBatchAmount';
    this.amount = amount;
    this.limit = limit;
  }
}

export class ErrBatchIATNOC extends ACHError {
  found: unknown;
  expected: unknown;
  override code = 'batchIATNOC';
  constructor(found: unknown, expected: unknown) {
    super(`${found} invalid for IAT NOC, should be ${expected}`);
    this.name = 'ErrBatchIATNOC';
    this.found = found;
    this.expected = expected;
  }
}

// --- File errors ---

export class FileError extends ACHError {
  fieldName: string;
  value: string;
  /** 1-based line number in the ACH file */
  line?: number;
  /** 0-based inclusive start column */
  startColumn?: number;
  /** 0-based exclusive end column */
  endColumn?: number;

  constructor(fieldName: string, msg: string, value?: string) {
    super(`${fieldName} ${msg}`);
    this.name = 'FileError';
    this.fieldName = fieldName;
    this.value = value ?? '';
  }
}

// File sentinel errors
export const ErrFileTooLong = new ACHError('file exceeds maximum possible number of lines');
ErrFileTooLong.code = 'fileTooLong';
Object.freeze(ErrFileTooLong);
export const ErrFileHeader = new ACHError('none or more than one file headers exists');
ErrFileHeader.code = 'fileHeader';
Object.freeze(ErrFileHeader);
export const ErrFileControl = new ACHError('none or more than one file control exists');
ErrFileControl.code = 'fileControl';
Object.freeze(ErrFileControl);
export const ErrMisplacedFileHeader = new ACHError('file header is not the first record');
ErrMisplacedFileHeader.code = 'misplacedFileHeader';
Object.freeze(ErrMisplacedFileHeader);
export const ErrExtraRecordsAfterFileControl = new ACHError('records found after file control');
ErrExtraRecordsAfterFileControl.code = 'extraRecordsAfterFileControl';
Object.freeze(ErrExtraRecordsAfterFileControl);
export const ErrFileEntryOutsideBatch = new ACHError('entry outside of batch');
ErrFileEntryOutsideBatch.code = 'fileEntryOutsideBatch';
Object.freeze(ErrFileEntryOutsideBatch);
export const ErrFileAddendaOutsideBatch = new ACHError('addenda outside of batch');
ErrFileAddendaOutsideBatch.code = 'fileAddendaOutsideBatch';
Object.freeze(ErrFileAddendaOutsideBatch);
export const ErrFileAddendaOutsideEntry = new ACHError('addenda outside of entry');
ErrFileAddendaOutsideEntry.code = 'fileAddendaOutsideEntry';
Object.freeze(ErrFileAddendaOutsideEntry);
export const ErrFileBatchControlOutsideBatch = new ACHError('batch control outside of batch');
ErrFileBatchControlOutsideBatch.code = 'fileBatchControlOutsideBatch';
Object.freeze(ErrFileBatchControlOutsideBatch);
export const ErrFileConsecutiveBatchHeaders = new ACHError('consecutive Batch Headers in file');
ErrFileConsecutiveBatchHeaders.code = 'fileConsecutiveBatchHeaders';
Object.freeze(ErrFileConsecutiveBatchHeaders);
export const ErrFileADVOnly = new ACHError('file can only have ADV Batches');
ErrFileADVOnly.code = 'fileADVOnly';
Object.freeze(ErrFileADVOnly);
export const ErrFileIATSEC = new ACHError('IAT Standard Entry Class Code should use iatBatch');
ErrFileIATSEC.code = 'fileIATSEC';
Object.freeze(ErrFileIATSEC);
export const ErrFileNoBatches = new ACHError('must have []*Batches or []*IATBatches to be built');
ErrFileNoBatches.code = 'fileNoBatches';
Object.freeze(ErrFileNoBatches);
export const ErrInvalidJSON = new ACHError('invalid JSON');
ErrInvalidJSON.code = 'invalidJSON';
Object.freeze(ErrInvalidJSON);

// File structured errors
export class RecordWrongLengthErr extends ACHError {
  length: number;
  override code = 'recordWrongLength';
  constructor(length: number) {
    super(`must be 94 characters and found ${length}`);
    this.name = 'RecordWrongLengthErr';
    this.length = length;
  }
}

export class ErrUnknownRecordType extends ACHError {
  type: string;
  override code = 'unknownRecordType';
  constructor(recordType: string) {
    super(`${recordType} is an unknown record type`);
    this.name = 'ErrUnknownRecordType';
    this.type = recordType;
  }
}

export class ErrFileUnknownSEC extends ACHError {
  sec: string;
  override code = 'fileUnknownSEC';
  constructor(secType: string) {
    super(`${secType} Standard Entry Class Code is not implemented`);
    this.name = 'ErrFileUnknownSEC';
    this.sec = secType;
  }
}

export class ErrFileCalculatedControlEquality extends ACHError {
  field: string;
  calculatedValue: number;
  controlValue: number;
  override code = 'fileCalculatedControlEquality';
  /** 1-based line number in the ACH file */
  line?: number;
  /** 0-based inclusive start column */
  startColumn?: number;
  /** 0-based exclusive end column */
  endColumn?: number;
  /** Related locations for cross-record errors */
  relatedLocations?: RelatedLocation[];
  constructor(field: string, calculated: number, control: number) {
    super(`${field} calculated ${calculated} is out-of-balance with file control ${control}`);
    this.name = 'ErrFileCalculatedControlEquality';
    this.field = field;
    this.calculatedValue = calculated;
    this.controlValue = control;
  }
}

export class ErrFileBatchNumberAscending extends ACHError {
  previousBatch: number;
  currentBatch: number;
  override code = 'fileBatchNumberAscending';
  /** 1-based line number in the ACH file */
  line?: number;
  /** 0-based inclusive start column */
  startColumn?: number;
  /** 0-based exclusive end column */
  endColumn?: number;
  constructor(previous: number, current: number) {
    super(`Batch numbers must be in ascending order, batch ${current} is less than or equal to the previous batch: ${previous}`);
    this.name = 'ErrFileBatchNumberAscending';
    this.previousBatch = previous;
    this.currentBatch = current;
  }
}

// ParseError wraps an error with line number and record name context
export class ParseError extends ACHError {
  line: number;
  record: string;
  /** 0-based inclusive start column */
  startColumn?: number;
  /** 0-based exclusive end column */
  endColumn?: number;

  constructor(line: number, record: string, err: Error) {
    super(`line:${line} record:${record} ${err.message}`);
    this.name = 'ParseError';
    this.line = line;
    this.record = record;
    this.cause = err;
    // Inherit code from cause if it's an ACHError
    if (err instanceof ACHError && err.code) {
      this.code = err.code;
    }
  }
}
