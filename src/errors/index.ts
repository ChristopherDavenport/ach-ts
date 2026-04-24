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

  constructor(fieldName: string, err: Error, value?: unknown) {
    // Format: "FieldName value error message"
    const msg = `${fieldName} ${value !== undefined ? value + ' ' : ''}${err.message}`;
    super(msg);
    this.name = 'FieldError';
    this.fieldName = fieldName;
    this.value = value;
    this.cause = err;
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
export const ErrUpperAlpha = new ACHError('is not uppercase A-Z or 0-9');
export const ErrFieldInclusion = new ACHError('is a mandatory field and has a default value');
export const ErrConstructor = new ACHError('is a mandatory field and has a default value, did you use the constructor?');
export const ErrFieldRequired = new ACHError('is a required field');
export const ErrServiceClass = new ACHError('is an invalid Service Class Code');
export const ErrSECCode = new ACHError('is an invalid Standard Entry Class Code');
export const ErrOrigStatusCode = new ACHError('is an invalid Originator Status Code');
export const ErrAddendaTypeCode = new ACHError('is an invalid Addenda Type Code');
export const ErrTransactionCode = new ACHError('is an invalid Transaction Code');
export const ErrIdentificationNumber = new ACHError('is an invalid identification number');
export const ErrCardTransactionType = new ACHError('is an invalid Card Transaction Type');
export const ErrValidMonth = new ACHError('is an invalid month');
export const ErrValidDay = new ACHError('is an invalid day');
export const ErrValidYear = new ACHError('is an invalid year');
export const ErrValidState = new ACHError('is an invalid US state or territory');
export const ErrValidISO3166 = new ACHError('is an invalid ISO 3166-1-alpha-2 code');
export const ErrValidISO4217 = new ACHError('is an invalid ISO 4217 code');
export const ErrNegativeAmount = new ACHError('amounts cannot be negative');
export const ErrAddenda98ChangeCode = new ACHError('found is not a valid addenda Change Code');
export const ErrAddenda98RefusedChangeCode = new ACHError('found is not a valid addenda Refused Change Code');
export const ErrAddenda98RefusedTraceSequenceNumber = new ACHError('found is not a valid addenda trace sequence number');
export const ErrAddenda98CorrectedData = new ACHError('must contain the corrected information corresponding to the Change Code');
export const ErrAddenda99ReturnCode = new ACHError('found is not a valid return code');
export const ErrAddenda99DishonoredReturnCode = new ACHError('found is not a valid dishonored return code');
export const ErrAddenda99ContestedReturnCode = new ACHError('found is not a valid contested dishonored return code');
export const ErrBatchCORAddenda = new ACHError('one Addenda98 or Addenda98Refused record is required for each entry in SEC Type COR');
export const ErrRecordSize = new ACHError('is not 094');
export const ErrBlockingFactor = new ACHError('is not 10');
export const ErrFormatCode = new ACHError('is not 1');
export const ErrExceedsFieldLength = new ACHError('exceeds the Nacha field length');
export const ErrForeignExchangeIndicator = new ACHError('is an invalid Foreign Exchange Indicator');
export const ErrForeignExchangeReferenceIndicator = new ACHError('is an invalid Foreign Exchange Reference Indicator');
export const ErrTransactionTypeCode = new ACHError('is an invalid Addenda10 Transaction Type Code');
export const ErrIDNumberQualifier = new ACHError('is an invalid Identification Number Qualifier');
export const ErrIATBatchAddendaIndicator = new ACHError('is invalid for addenda record(s) found');
export const ErrOnlyZeros = new ACHError('contains only spaces and zeros');

// --- Structured error types ---

export class ErrValidCheckDigit extends ACHError {
  calculatedCheckDigit: number;
  constructor(digit: number) {
    super(`does not match calculated check digit ${digit}`);
    this.name = 'ErrValidCheckDigit';
    this.calculatedCheckDigit = digit;
  }
}

export class ErrValidFieldLength extends ACHError {
  expectedLength: number;
  constructor(expectedLength: number) {
    super(`is not length ${expectedLength}`);
    this.name = 'ErrValidFieldLength';
    this.expectedLength = expectedLength;
  }
}

export class ErrRecordType extends ACHError {
  expectedType: number;
  constructor(expectedType: number) {
    super(`received expecting ${expectedType}`);
    this.name = 'ErrRecordType';
    this.expectedType = expectedType;
  }
}

// --- Batch errors ---

export class BatchError extends ACHError {
  batchNumber: number;
  batchType: string;
  fieldName: string;
  fieldValue: unknown;

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
  }
}

// Batch sentinel errors
export const ErrBatchNoEntries = new ACHError('must have Entry Record(s) to be built');
export const ErrBatchADVCount = new ACHError('there can be a maximum of 9999 ADV Sequence Numbers (ADV Entry Detail Records)');
export const ErrBatchAddendaIndicator = new ACHError('is 0 but found addenda record(s)');
export const ErrBatchOriginatorDNE = new ACHError('only government agencies (originator status code 2) can originate a DNE');
export const ErrBatchInvalidCardTransactionType = new ACHError('invalid card transaction type');
export const ErrBatchDebitOnly = new ACHError('this batch type does not allow credit transaction codes');
export const ErrBatchCheckSerialNumber = new ACHError('this batch type requires entries to have Check Serial Numbers');
export const ErrBatchSECType = new ACHError("header SEC does not match this batch's type");
export const ErrBatchServiceClassCode = new ACHError("header SCC is not valid for this batch's type");
export const ErrBatchTransactionCode = new ACHError("transaction code is not valid for this batch's type");
export const ErrBatchTransactionCodeAddenda = new ACHError('this batch type does not allow an addenda for this transaction code');
export const ErrBatchAmountNonZero = new ACHError('this batch type requires that the amount is zero');
export const ErrBatchAmountZero = new ACHError('this batch type requires that the amount is non-zero');
export const ErrBatchCompanyEntryDescriptionAutoenroll = new ACHError('this batch type requires that the Company Entry Description is AUTOENROLL');
export const ErrBatchCompanyEntryDescriptionREDEPCHECK = new ACHError('this batch type requires that the Company Entry Description is REDEPCHECK');
export const ErrBatchAddendaCategory = new ACHError('this batch type does not allow this addenda for category');

// Batch structured errors
export class ErrBatchHeaderControlEquality extends ACHError {
  headerValue: unknown;
  controlValue: unknown;
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

  constructor(fieldName: string, msg: string, value?: string) {
    super(`${fieldName} ${msg}`);
    this.name = 'FileError';
    this.fieldName = fieldName;
    this.value = value ?? '';
  }
}

// File sentinel errors
export const ErrFileTooLong = new ACHError('file exceeds maximum possible number of lines');
export const ErrFileHeader = new ACHError('none or more than one file headers exists');
export const ErrFileControl = new ACHError('none or more than one file control exists');
export const ErrMisplacedFileHeader = new ACHError('file header is not the first record');
export const ErrExtraRecordsAfterFileControl = new ACHError('records found after file control');
export const ErrFileEntryOutsideBatch = new ACHError('entry outside of batch');
export const ErrFileAddendaOutsideBatch = new ACHError('addenda outside of batch');
export const ErrFileAddendaOutsideEntry = new ACHError('addenda outside of entry');
export const ErrFileBatchControlOutsideBatch = new ACHError('batch control outside of batch');
export const ErrFileConsecutiveBatchHeaders = new ACHError('consecutive Batch Headers in file');
export const ErrFileADVOnly = new ACHError('file can only have ADV Batches');
export const ErrFileIATSEC = new ACHError('IAT Standard Entry Class Code should use iatBatch');
export const ErrFileNoBatches = new ACHError('must have []*Batches or []*IATBatches to be built');
export const ErrInvalidJSON = new ACHError('invalid JSON');

// File structured errors
export class RecordWrongLengthErr extends ACHError {
  length: number;
  constructor(length: number) {
    super(`must be 94 characters and found ${length}`);
    this.name = 'RecordWrongLengthErr';
    this.length = length;
  }
}

export class ErrUnknownRecordType extends ACHError {
  type: string;
  constructor(recordType: string) {
    super(`${recordType} is an unknown record type`);
    this.name = 'ErrUnknownRecordType';
    this.type = recordType;
  }
}

export class ErrFileUnknownSEC extends ACHError {
  sec: string;
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

  constructor(line: number, record: string, err: Error) {
    super(`line:${line} record:${record} ${err.message}`);
    this.name = 'ParseError';
    this.line = line;
    this.record = record;
    this.cause = err;
  }
}
