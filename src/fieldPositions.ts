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

import { FieldError } from './errors/index.js';

/** A field's column position within a 94-character ACH record line. 0-based, exclusive end. */
export interface FieldPosition {
  start: number;
  end: number;
}

/** A field specification: name + column range. Ordered arrays of these cover the full 94-char line. */
export interface FieldSpec {
  /** Field name (camelCase property name from the record class) */
  name: string;
  /** 0-based start column (inclusive) */
  start: number;
  /** 0-based end column (exclusive) */
  end: number;
}

/**
 * Build a position lookup map from a FieldSpec array.
 * Optionally adds error-name aliases so FieldError.fieldName (PascalCase) resolves to the same position.
 */
export function buildPositionMap(
  specs: FieldSpec[],
  errorNames?: Record<string, string>, // errorFieldName -> propertyName
): Record<string, FieldPosition> {
  const map: Record<string, FieldPosition> = {};
  for (const { name, start, end } of specs) {
    map[name] = { start, end };
  }
  if (errorNames) {
    for (const [errorName, propName] of Object.entries(errorNames)) {
      if (map[propName]) {
        map[errorName] = map[propName];
      }
    }
  }
  return map;
}

/**
 * Enrich FieldError instances with positional data (line, startColumn, endColumn).
 * Mutates errors in-place and returns the same array.
 */
export function enrichErrors(
  errors: Error[],
  lineNumber: number,
  positions: Record<string, FieldPosition>,
): Error[] {
  for (const err of errors) {
    if (err instanceof FieldError) {
      err.line = lineNumber;
      const pos = positions[err.fieldName];
      if (pos) {
        err.startColumn = pos.start;
        err.endColumn = pos.end;
      }
    }
  }
  return errors;
}

// ============================================================
// FileHeader (record type "1")
// ============================================================

export const fileHeaderFields: FieldSpec[] = [
  { name: 'recordType',               start: 0,  end: 1  },
  { name: 'priorityCode',             start: 1,  end: 3  },
  { name: 'immediateDestination',     start: 3,  end: 13 },
  { name: 'immediateOrigin',          start: 13, end: 23 },
  { name: 'fileCreationDate',         start: 23, end: 29 },
  { name: 'fileCreationTime',         start: 29, end: 33 },
  { name: 'fileIDModifier',           start: 33, end: 34 },
  { name: 'recordSize',               start: 34, end: 37 },
  { name: 'blockingFactor',           start: 37, end: 39 },
  { name: 'formatCode',               start: 39, end: 40 },
  { name: 'immediateDestinationName', start: 40, end: 63 },
  { name: 'immediateOriginName',      start: 63, end: 86 },
  { name: 'referenceCode',            start: 86, end: 94 },
];

const fileHeaderErrorNames: Record<string, string> = {
  'ImmediateDestination':     'immediateDestination',
  'ImmediateOrigin':          'immediateOrigin',
  'FileCreationDate':         'fileCreationDate',
  'FileCreationTime':         'fileCreationTime',
  'FileIDModifier':           'fileIDModifier',
  'FormatCode':               'formatCode',
  'ImmediateDestinationName': 'immediateDestinationName',
  'ImmediateOriginName':      'immediateOriginName',
  'ReferenceCode':            'referenceCode',
  // These two already match camelCase in the source
  'recordSize':               'recordSize',
  'blockingFactor':           'blockingFactor',
};

export const fileHeaderFieldPositions = buildPositionMap(fileHeaderFields, fileHeaderErrorNames);

// ============================================================
// BatchHeader (record type "5")
// ============================================================

export const batchHeaderFields: FieldSpec[] = [
  { name: 'recordType',               start: 0,  end: 1  },
  { name: 'serviceClassCode',         start: 1,  end: 4  },
  { name: 'companyName',              start: 4,  end: 20 },
  { name: 'companyDiscretionaryData', start: 20, end: 40 },
  { name: 'companyIdentification',    start: 40, end: 50 },
  { name: 'standardEntryClassCode',   start: 50, end: 53 },
  { name: 'companyEntryDescription',  start: 53, end: 63 },
  { name: 'companyDescriptiveDate',   start: 63, end: 69 },
  { name: 'effectiveEntryDate',       start: 69, end: 75 },
  { name: 'settlementDate',           start: 75, end: 78 },
  { name: 'originatorStatusCode',     start: 78, end: 79 },
  { name: 'odfiIdentification',       start: 79, end: 87 },
  { name: 'batchNumber',              start: 87, end: 94 },
];

const batchHeaderErrorNames: Record<string, string> = {
  'ServiceClassCode':         'serviceClassCode',
  'CompanyName':              'companyName',
  'CompanyDiscretionaryData': 'companyDiscretionaryData',
  'CompanyIdentification':    'companyIdentification',
  'StandardEntryClassCode':   'standardEntryClassCode',
  'CompanyEntryDescription':  'companyEntryDescription',
  'OriginatorStatusCode':     'originatorStatusCode',
  'ODFIIdentification':       'odfiIdentification',
};

export const batchHeaderFieldPositions = buildPositionMap(batchHeaderFields, batchHeaderErrorNames);

// ============================================================
// EntryDetail (record type "6")
// ============================================================

export const entryDetailFields: FieldSpec[] = [
  { name: 'recordType',             start: 0,  end: 1  },
  { name: 'transactionCode',        start: 1,  end: 3  },
  { name: 'rdfiIdentification',     start: 3,  end: 11 },
  { name: 'checkDigit',             start: 11, end: 12 },
  { name: 'dfiAccountNumber',       start: 12, end: 29 },
  { name: 'amount',                 start: 29, end: 39 },
  { name: 'identificationNumber',   start: 39, end: 54 },
  { name: 'individualName',         start: 54, end: 76 },
  { name: 'discretionaryData',      start: 76, end: 78 },
  { name: 'addendaRecordIndicator', start: 78, end: 79 },
  { name: 'traceNumber',            start: 79, end: 94 },
];

const entryDetailErrorNames: Record<string, string> = {
  'TransactionCode':        'transactionCode',
  'RDFIIdentification':     'rdfiIdentification',
  'CheckDigit':             'checkDigit',
  'DFIAccountNumber':       'dfiAccountNumber',
  'Amount':                 'amount',
  'IdentificationNumber':   'identificationNumber',
  'IndividualName':         'individualName',
  'DiscretionaryData':      'discretionaryData',
  'AddendaRecordIndicator': 'addendaRecordIndicator',
  'TraceNumber':            'traceNumber',
};

export const entryDetailFieldPositions = buildPositionMap(entryDetailFields, entryDetailErrorNames);

// ============================================================
// BatchControl (record type "8")
// ============================================================

export const batchControlFields: FieldSpec[] = [
  { name: 'recordType',                   start: 0,  end: 1  },
  { name: 'serviceClassCode',             start: 1,  end: 4  },
  { name: 'entryAddendaCount',            start: 4,  end: 10 },
  { name: 'entryHash',                    start: 10, end: 20 },
  { name: 'totalDebitEntryDollarAmount',   start: 20, end: 32 },
  { name: 'totalCreditEntryDollarAmount',  start: 32, end: 44 },
  { name: 'companyIdentification',        start: 44, end: 54 },
  { name: 'messageAuthenticationCode',    start: 54, end: 73 },
  { name: 'reserved',                     start: 73, end: 79 },
  { name: 'odfiIdentification',           start: 79, end: 87 },
  { name: 'batchNumber',                  start: 87, end: 94 },
];

const batchControlErrorNames: Record<string, string> = {
  'ServiceClassCode':              'serviceClassCode',
  'CompanyIdentification':         'companyIdentification',
  'TotalDebitEntryDollarAmount':   'totalDebitEntryDollarAmount',
  'TotalCreditEntryDollarAmount':  'totalCreditEntryDollarAmount',
  'ODFIIdentification':            'odfiIdentification',
};

export const batchControlFieldPositions = buildPositionMap(batchControlFields, batchControlErrorNames);

// ============================================================
// FileControl (record type "9")
// ============================================================

export const fileControlFields: FieldSpec[] = [
  { name: 'recordType',                        start: 0,  end: 1  },
  { name: 'batchCount',                        start: 1,  end: 7  },
  { name: 'blockCount',                        start: 7,  end: 13 },
  { name: 'entryAddendaCount',                 start: 13, end: 21 },
  { name: 'entryHash',                         start: 21, end: 31 },
  { name: 'totalDebitEntryDollarAmountInFile',  start: 31, end: 43 },
  { name: 'totalCreditEntryDollarAmountInFile', start: 43, end: 55 },
  { name: 'reserved',                          start: 55, end: 94 },
];

const fileControlErrorNames: Record<string, string> = {
  'BatchCount':                    'batchCount',
  'BlockCount':                    'blockCount',
  'EntryAddendaCount':             'entryAddendaCount',
  'EntryHash':                     'entryHash',
  'TotalDebitEntryDollarAmount':   'totalDebitEntryDollarAmountInFile',
  'TotalCreditEntryDollarAmount':  'totalCreditEntryDollarAmountInFile',
};

export const fileControlFieldPositions = buildPositionMap(fileControlFields, fileControlErrorNames);

// ============================================================
// IATBatchHeader (record type "5", SEC=IAT)
// ============================================================

export const iatBatchHeaderFields: FieldSpec[] = [
  { name: 'recordType',                        start: 0,  end: 1  },
  { name: 'serviceClassCode',                  start: 1,  end: 4  },
  { name: 'iatIndicator',                      start: 4,  end: 20 },
  { name: 'foreignExchangeIndicator',          start: 20, end: 22 },
  { name: 'foreignExchangeReferenceIndicator', start: 22, end: 23 },
  { name: 'foreignExchangeReference',          start: 23, end: 38 },
  { name: 'isoDestinationCountryCode',         start: 38, end: 40 },
  { name: 'originatorIdentification',          start: 40, end: 50 },
  { name: 'standardEntryClassCode',            start: 50, end: 53 },
  { name: 'companyEntryDescription',           start: 53, end: 63 },
  { name: 'isoOriginatingCurrencyCode',        start: 63, end: 66 },
  { name: 'isoDestinationCurrencyCode',        start: 66, end: 69 },
  { name: 'effectiveEntryDate',                start: 69, end: 75 },
  { name: 'settlementDate',                    start: 75, end: 78 },
  { name: 'originatorStatusCode',              start: 78, end: 79 },
  { name: 'odfiIdentification',               start: 79, end: 87 },
  { name: 'batchNumber',                       start: 87, end: 94 },
];

const iatBatchHeaderErrorNames: Record<string, string> = {
  'ServiceClassCode':                  'serviceClassCode',
  'ForeignExchangeIndicator':          'foreignExchangeIndicator',
  'ForeignExchangeReferenceIndicator': 'foreignExchangeReferenceIndicator',
  'ISODestinationCountryCode':         'isoDestinationCountryCode',
  'OriginatorIdentification':          'originatorIdentification',
  'StandardEntryClassCode':            'standardEntryClassCode',
  'CompanyEntryDescription':           'companyEntryDescription',
  'ISOOriginatingCurrencyCode':        'isoOriginatingCurrencyCode',
  'ISODestinationCurrencyCode':        'isoDestinationCurrencyCode',
  'OriginatorStatusCode':              'originatorStatusCode',
  'ODFIIdentification':                'odfiIdentification',
};

export const iatBatchHeaderFieldPositions = buildPositionMap(iatBatchHeaderFields, iatBatchHeaderErrorNames);

// ============================================================
// IATEntryDetail (record type "6", IAT)
// ============================================================

export const iatEntryDetailFields: FieldSpec[] = [
  { name: 'recordType',                      start: 0,  end: 1  },
  { name: 'transactionCode',                 start: 1,  end: 3  },
  { name: 'rdfiIdentification',              start: 3,  end: 11 },
  { name: 'checkDigit',                      start: 11, end: 12 },
  { name: 'addendaRecords',                  start: 12, end: 16 },
  { name: 'reserved',                        start: 16, end: 29 },
  { name: 'amount',                          start: 29, end: 39 },
  { name: 'dfiAccountNumber',                start: 39, end: 74 },
  { name: 'reserved2',                       start: 74, end: 76 },
  { name: 'ofacScreeningIndicator',          start: 76, end: 77 },
  { name: 'secondaryOFACScreeningIndicator', start: 77, end: 78 },
  { name: 'addendaRecordIndicator',          start: 78, end: 79 },
  { name: 'traceNumber',                     start: 79, end: 94 },
];

const iatEntryDetailErrorNames: Record<string, string> = {
  'TransactionCode':        'transactionCode',
  'RDFIIdentification':     'rdfiIdentification',
  'DFIAccountNumber':       'dfiAccountNumber',
  'AddendaRecords':         'addendaRecords',
  'AddendaRecordIndicator': 'addendaRecordIndicator',
  'TraceNumber':            'traceNumber',
};

export const iatEntryDetailFieldPositions = buildPositionMap(iatEntryDetailFields, iatEntryDetailErrorNames);

// ============================================================
// ADVBatchControl (record type "8", ADV)
// ============================================================

export const advBatchControlFields: FieldSpec[] = [
  { name: 'recordType',                   start: 0,  end: 1  },
  { name: 'serviceClassCode',             start: 1,  end: 4  },
  { name: 'entryAddendaCount',            start: 4,  end: 10 },
  { name: 'entryHash',                    start: 10, end: 20 },
  { name: 'totalDebitEntryDollarAmount',   start: 20, end: 40 },
  { name: 'totalCreditEntryDollarAmount',  start: 40, end: 60 },
  { name: 'achOperatorData',              start: 60, end: 79 },
  { name: 'odfiIdentification',           start: 79, end: 87 },
  { name: 'batchNumber',                  start: 87, end: 94 },
];

const advBatchControlErrorNames: Record<string, string> = {
  'ServiceClassCode':   'serviceClassCode',
  'ODFIIdentification': 'odfiIdentification',
  'ACHOperatorData':    'achOperatorData',
};

export const advBatchControlFieldPositions = buildPositionMap(advBatchControlFields, advBatchControlErrorNames);

// ============================================================
// ADVEntryDetail (record type "6", ADV)
// ============================================================

export const advEntryDetailFields: FieldSpec[] = [
  { name: 'recordType',               start: 0,  end: 1  },
  { name: 'transactionCode',          start: 1,  end: 3  },
  { name: 'rdfiIdentification',       start: 3,  end: 11 },
  { name: 'checkDigit',               start: 11, end: 12 },
  { name: 'dfiAccountNumber',         start: 12, end: 27 },
  { name: 'amount',                   start: 27, end: 39 },
  { name: 'adviceRoutingNumber',      start: 39, end: 48 },
  { name: 'fileIdentification',       start: 48, end: 53 },
  { name: 'achOperatorData',          start: 53, end: 54 },
  { name: 'individualName',           start: 54, end: 76 },
  { name: 'discretionaryData',        start: 76, end: 78 },
  { name: 'addendaRecordIndicator',   start: 78, end: 79 },
  { name: 'achOperatorRoutingNumber', start: 79, end: 87 },
  { name: 'julianDay',                start: 87, end: 90 },
  { name: 'sequenceNumber',           start: 90, end: 94 },
];

const advEntryDetailErrorNames: Record<string, string> = {
  'TransactionCode':          'transactionCode',
  'RDFIIdentification':       'rdfiIdentification',
  'DFIAccountNumber':         'dfiAccountNumber',
  'AdviceRoutingNumber':      'adviceRoutingNumber',
  'IndividualName':           'individualName',
  'DiscretionaryData':        'discretionaryData',
  'ACHOperatorRoutingNumber': 'achOperatorRoutingNumber',
  'JulianDay':                'julianDay',
  'SequenceNumber':           'sequenceNumber',
};

export const advEntryDetailFieldPositions = buildPositionMap(advEntryDetailFields, advEntryDetailErrorNames);

// ============================================================
// ADVFileControl (record type "9", ADV)
// ============================================================

export const advFileControlFields: FieldSpec[] = [
  { name: 'recordType',                        start: 0,  end: 1  },
  { name: 'batchCount',                        start: 1,  end: 7  },
  { name: 'blockCount',                        start: 7,  end: 13 },
  { name: 'entryAddendaCount',                 start: 13, end: 21 },
  { name: 'entryHash',                         start: 21, end: 31 },
  { name: 'totalDebitEntryDollarAmountInFile',  start: 31, end: 51 },
  { name: 'totalCreditEntryDollarAmountInFile', start: 51, end: 71 },
  { name: 'reserved',                          start: 71, end: 94 },
];

const advFileControlErrorNames: Record<string, string> = {
  'BatchCount':       'batchCount',
  'BlockCount':       'blockCount',
  'EntryAddendaCount': 'entryAddendaCount',
  'EntryHash':        'entryHash',
};

export const advFileControlFieldPositions = buildPositionMap(advFileControlFields, advFileControlErrorNames);

// ============================================================
// Addenda02 (record type "7", typeCode "02")
// ============================================================

export const addenda02Fields: FieldSpec[] = [
  { name: 'recordType',                    start: 0,  end: 1  },
  { name: 'typeCode',                      start: 1,  end: 3  },
  { name: 'referenceInformationOne',       start: 3,  end: 10 },
  { name: 'referenceInformationTwo',       start: 10, end: 13 },
  { name: 'terminalIdentificationCode',    start: 13, end: 19 },
  { name: 'transactionSerialNumber',       start: 19, end: 25 },
  { name: 'transactionDate',              start: 25, end: 29 },
  { name: 'authorizationCodeOrExpireDate', start: 29, end: 35 },
  { name: 'terminalLocation',             start: 35, end: 62 },
  { name: 'terminalCity',                 start: 62, end: 77 },
  { name: 'terminalState',                start: 77, end: 79 },
  { name: 'traceNumber',                  start: 79, end: 94 },
];

const addenda02ErrorNames: Record<string, string> = {
  'TypeCode':                     'typeCode',
  'ReferenceInformationOne':      'referenceInformationOne',
  'ReferenceInformationTwo':      'referenceInformationTwo',
  'TerminalIdentificationCode':   'terminalIdentificationCode',
  'TransactionSerialNumber':      'transactionSerialNumber',
  'TransactionDate':              'transactionDate',
  'AuthorizationCodeOrExpireDate': 'authorizationCodeOrExpireDate',
  'TerminalLocation':             'terminalLocation',
  'TerminalCity':                 'terminalCity',
  'TerminalState':                'terminalState',
};

export const addenda02FieldPositions = buildPositionMap(addenda02Fields, addenda02ErrorNames);

// ============================================================
// Addenda05 (record type "7", typeCode "05")
// ============================================================

export const addenda05Fields: FieldSpec[] = [
  { name: 'recordType',                start: 0,  end: 1  },
  { name: 'typeCode',                  start: 1,  end: 3  },
  { name: 'paymentRelatedInformation', start: 3,  end: 83 },
  { name: 'sequenceNumber',           start: 83, end: 87 },
  { name: 'entryDetailSequenceNumber', start: 87, end: 94 },
];

const addenda05ErrorNames: Record<string, string> = {
  'TypeCode':                  'typeCode',
  'PaymentRelatedInformation': 'paymentRelatedInformation',
  'SequenceNumber':            'sequenceNumber',
  'EntryDetailSequenceNumber': 'entryDetailSequenceNumber',
};

export const addenda05FieldPositions = buildPositionMap(addenda05Fields, addenda05ErrorNames);

// ============================================================
// Addenda10 (record type "7", typeCode "10")
// ============================================================

export const addenda10Fields: FieldSpec[] = [
  { name: 'recordType',               start: 0,  end: 1  },
  { name: 'typeCode',                 start: 1,  end: 3  },
  { name: 'transactionTypeCode',      start: 3,  end: 6  },
  { name: 'foreignPaymentAmount',     start: 6,  end: 24 },
  { name: 'foreignTraceNumber',       start: 24, end: 46 },
  { name: 'name',                     start: 46, end: 81 },
  { name: 'reserved',                 start: 81, end: 87 },
  { name: 'entryDetailSequenceNumber', start: 87, end: 94 },
];

const addenda10ErrorNames: Record<string, string> = {
  'TypeCode':                  'typeCode',
  'TransactionTypeCode':       'transactionTypeCode',
  'ForeignTraceNumber':        'foreignTraceNumber',
  'Name':                      'name',
  'EntryDetailSequenceNumber': 'entryDetailSequenceNumber',
};

export const addenda10FieldPositions = buildPositionMap(addenda10Fields, addenda10ErrorNames);

// ============================================================
// Addenda11 (record type "7", typeCode "11")
// ============================================================

export const addenda11Fields: FieldSpec[] = [
  { name: 'recordType',               start: 0,  end: 1  },
  { name: 'typeCode',                 start: 1,  end: 3  },
  { name: 'originatorName',           start: 3,  end: 38 },
  { name: 'originatorStreetAddress',  start: 38, end: 73 },
  { name: 'reserved',                 start: 73, end: 87 },
  { name: 'entryDetailSequenceNumber', start: 87, end: 94 },
];

const addenda11ErrorNames: Record<string, string> = {
  'TypeCode':                  'typeCode',
  'OriginatorName':            'originatorName',
  'OriginatorStreetAddress':   'originatorStreetAddress',
  'EntryDetailSequenceNumber': 'entryDetailSequenceNumber',
};

export const addenda11FieldPositions = buildPositionMap(addenda11Fields, addenda11ErrorNames);

// ============================================================
// Addenda12 (record type "7", typeCode "12")
// ============================================================

export const addenda12Fields: FieldSpec[] = [
  { name: 'recordType',                  start: 0,  end: 1  },
  { name: 'typeCode',                    start: 1,  end: 3  },
  { name: 'originatorCityStateProvince', start: 3,  end: 38 },
  { name: 'originatorCountryPostalCode', start: 38, end: 73 },
  { name: 'originatorDateOfBirth',       start: 73, end: 83 },
  { name: 'reserved',                    start: 83, end: 87 },
  { name: 'entryDetailSequenceNumber',   start: 87, end: 94 },
];

const addenda12ErrorNames: Record<string, string> = {
  'TypeCode':                    'typeCode',
  'OriginatorCityStateProvince': 'originatorCityStateProvince',
  'OriginatorCountryPostalCode': 'originatorCountryPostalCode',
  'EntryDetailSequenceNumber':   'entryDetailSequenceNumber',
};

export const addenda12FieldPositions = buildPositionMap(addenda12Fields, addenda12ErrorNames);

// ============================================================
// Addenda13 (record type "7", typeCode "13")
// ============================================================

export const addenda13Fields: FieldSpec[] = [
  { name: 'recordType',               start: 0,  end: 1  },
  { name: 'typeCode',                 start: 1,  end: 3  },
  { name: 'odfiName',                 start: 3,  end: 38 },
  { name: 'odfiIDNumberQualifier',    start: 38, end: 40 },
  { name: 'odfiIdentification',       start: 40, end: 74 },
  { name: 'odfiBranchCountryCode',    start: 74, end: 77 },
  { name: 'reserved',                 start: 77, end: 87 },
  { name: 'entryDetailSequenceNumber', start: 87, end: 94 },
];

const addenda13ErrorNames: Record<string, string> = {
  'TypeCode':                  'typeCode',
  'ODFIName':                  'odfiName',
  'ODFIIDNumberQualifier':     'odfiIDNumberQualifier',
  'ODFIIdentification':        'odfiIdentification',
  'ODFIBranchCountryCode':     'odfiBranchCountryCode',
  'EntryDetailSequenceNumber': 'entryDetailSequenceNumber',
};

export const addenda13FieldPositions = buildPositionMap(addenda13Fields, addenda13ErrorNames);

// ============================================================
// Addenda14 (record type "7", typeCode "14")
// ============================================================

export const addenda14Fields: FieldSpec[] = [
  { name: 'recordType',               start: 0,  end: 1  },
  { name: 'typeCode',                 start: 1,  end: 3  },
  { name: 'rdfiName',                 start: 3,  end: 38 },
  { name: 'rdfiIDNumberQualifier',    start: 38, end: 40 },
  { name: 'rdfiIdentification',       start: 40, end: 74 },
  { name: 'rdfiBranchCountryCode',    start: 74, end: 77 },
  { name: 'reserved',                 start: 77, end: 87 },
  { name: 'entryDetailSequenceNumber', start: 87, end: 94 },
];

const addenda14ErrorNames: Record<string, string> = {
  'TypeCode':                  'typeCode',
  'RDFIName':                  'rdfiName',
  'RDFIIDNumberQualifier':     'rdfiIDNumberQualifier',
  'RDFIIdentification':        'rdfiIdentification',
  'RDFIBranchCountryCode':     'rdfiBranchCountryCode',
  'EntryDetailSequenceNumber': 'entryDetailSequenceNumber',
};

export const addenda14FieldPositions = buildPositionMap(addenda14Fields, addenda14ErrorNames);

// ============================================================
// Addenda15 (record type "7", typeCode "15")
// ============================================================

export const addenda15Fields: FieldSpec[] = [
  { name: 'recordType',               start: 0,  end: 1  },
  { name: 'typeCode',                 start: 1,  end: 3  },
  { name: 'receiverIDNumber',         start: 3,  end: 18 },
  { name: 'receiverStreetAddress',    start: 18, end: 53 },
  { name: 'reserved',                 start: 53, end: 87 },
  { name: 'entryDetailSequenceNumber', start: 87, end: 94 },
];

const addenda15ErrorNames: Record<string, string> = {
  'TypeCode':                  'typeCode',
  'ReceiverIDNumber':          'receiverIDNumber',
  'ReceiverStreetAddress':     'receiverStreetAddress',
  'EntryDetailSequenceNumber': 'entryDetailSequenceNumber',
};

export const addenda15FieldPositions = buildPositionMap(addenda15Fields, addenda15ErrorNames);

// ============================================================
// Addenda16 (record type "7", typeCode "16")
// ============================================================

export const addenda16Fields: FieldSpec[] = [
  { name: 'recordType',                start: 0,  end: 1  },
  { name: 'typeCode',                  start: 1,  end: 3  },
  { name: 'receiverCityStateProvince', start: 3,  end: 38 },
  { name: 'receiverCountryPostalCode', start: 38, end: 73 },
  { name: 'receiverDateOfBirth',       start: 73, end: 83 },
  { name: 'reserved',                  start: 83, end: 87 },
  { name: 'entryDetailSequenceNumber', start: 87, end: 94 },
];

const addenda16ErrorNames: Record<string, string> = {
  'TypeCode':                    'typeCode',
  'ReceiverCityStateProvince':   'receiverCityStateProvince',
  'ReceiverCountryPostalCode':   'receiverCountryPostalCode',
  'EntryDetailSequenceNumber':   'entryDetailSequenceNumber',
};

export const addenda16FieldPositions = buildPositionMap(addenda16Fields, addenda16ErrorNames);

// ============================================================
// Addenda17 (record type "7", typeCode "17")
// ============================================================

export const addenda17Fields: FieldSpec[] = [
  { name: 'recordType',                start: 0,  end: 1  },
  { name: 'typeCode',                  start: 1,  end: 3  },
  { name: 'paymentRelatedInformation', start: 3,  end: 83 },
  { name: 'sequenceNumber',            start: 83, end: 87 },
  { name: 'entryDetailSequenceNumber', start: 87, end: 94 },
];

const addenda17ErrorNames: Record<string, string> = {
  'TypeCode':                  'typeCode',
  'PaymentRelatedInformation': 'paymentRelatedInformation',
  'SequenceNumber':            'sequenceNumber',
  'EntryDetailSequenceNumber': 'entryDetailSequenceNumber',
};

export const addenda17FieldPositions = buildPositionMap(addenda17Fields, addenda17ErrorNames);

// ============================================================
// Addenda18 (record type "7", typeCode "18")
// ============================================================

export const addenda18Fields: FieldSpec[] = [
  { name: 'recordType',                                start: 0,  end: 1  },
  { name: 'typeCode',                                  start: 1,  end: 3  },
  { name: 'foreignCorrespondentBankName',              start: 3,  end: 38 },
  { name: 'foreignCorrespondentBankIDNumberQualifier', start: 38, end: 40 },
  { name: 'foreignCorrespondentBankIDNumber',          start: 40, end: 74 },
  { name: 'foreignCorrespondentBankBranchCountryCode', start: 74, end: 77 },
  { name: 'reserved',                                  start: 77, end: 83 },
  { name: 'sequenceNumber',                            start: 83, end: 87 },
  { name: 'entryDetailSequenceNumber',                 start: 87, end: 94 },
];

const addenda18ErrorNames: Record<string, string> = {
  'TypeCode':                                       'typeCode',
  'ForeignCorrespondentBankName':                    'foreignCorrespondentBankName',
  'ForeignCorrespondentBankIDNumberQualifier':       'foreignCorrespondentBankIDNumberQualifier',
  'ForeignCorrespondentBankIDNumber':                'foreignCorrespondentBankIDNumber',
  'ForeignCorrespondentBankBranchCountryCode':       'foreignCorrespondentBankBranchCountryCode',
  'SequenceNumber':                                  'sequenceNumber',
  'EntryDetailSequenceNumber':                       'entryDetailSequenceNumber',
};

export const addenda18FieldPositions = buildPositionMap(addenda18Fields, addenda18ErrorNames);

// ============================================================
// Addenda98 (record type "7", typeCode "98")
// ============================================================

export const addenda98Fields: FieldSpec[] = [
  { name: 'recordType',       start: 0,  end: 1  },
  { name: 'typeCode',         start: 1,  end: 3  },
  { name: 'changeCode',       start: 3,  end: 6  },
  { name: 'originalTrace',    start: 6,  end: 21 },
  { name: 'reserved',         start: 21, end: 27 },
  { name: 'originalDFI',      start: 27, end: 35 },
  { name: 'correctedData',    start: 35, end: 64 },
  { name: 'iatCorrectedData', start: 64, end: 70 },
  { name: 'reserved2',        start: 70, end: 79 },
  { name: 'traceNumber',      start: 79, end: 94 },
];

const addenda98ErrorNames: Record<string, string> = {
  'TypeCode':      'typeCode',
  'ChangeCode':    'changeCode',
  'CorrectedData': 'correctedData',
};

export const addenda98FieldPositions = buildPositionMap(addenda98Fields, addenda98ErrorNames);

// ============================================================
// Addenda98Refused (record type "7", typeCode "98")
// ============================================================

export const addenda98RefusedFields: FieldSpec[] = [
  { name: 'recordType',          start: 0,  end: 1  },
  { name: 'typeCode',            start: 1,  end: 3  },
  { name: 'refusedChangeCode',   start: 3,  end: 6  },
  { name: 'originalTrace',       start: 6,  end: 21 },
  { name: 'reserved',            start: 21, end: 27 },
  { name: 'originalDFI',         start: 27, end: 35 },
  { name: 'correctedData',       start: 35, end: 64 },
  { name: 'changeCode',          start: 64, end: 67 },
  { name: 'traceSequenceNumber', start: 67, end: 74 },
  { name: 'reserved2',           start: 74, end: 79 },
  { name: 'traceNumber',         start: 79, end: 94 },
];

const addenda98RefusedErrorNames: Record<string, string> = {
  'TypeCode':              'typeCode',
  'RefusedChangeCode':     'refusedChangeCode',
  'CorrectedData':         'correctedData',
  'ChangeCode':            'changeCode',
  'TraceSequenceNumber':   'traceSequenceNumber',
};

export const addenda98RefusedFieldPositions = buildPositionMap(addenda98RefusedFields, addenda98RefusedErrorNames);

// ============================================================
// Addenda99 (record type "7", typeCode "99")
// ============================================================

export const addenda99Fields: FieldSpec[] = [
  { name: 'recordType',         start: 0,  end: 1  },
  { name: 'typeCode',           start: 1,  end: 3  },
  { name: 'returnCode',         start: 3,  end: 6  },
  { name: 'originalTrace',      start: 6,  end: 21 },
  { name: 'dateOfDeath',        start: 21, end: 27 },
  { name: 'originalDFI',        start: 27, end: 35 },
  { name: 'addendaInformation', start: 35, end: 79 },
  { name: 'traceNumber',        start: 79, end: 94 },
];

const addenda99ErrorNames: Record<string, string> = {
  'TypeCode':   'typeCode',
  'ReturnCode': 'returnCode',
};

export const addenda99FieldPositions = buildPositionMap(addenda99Fields, addenda99ErrorNames);

// ============================================================
// Addenda99Dishonored (record type "7", typeCode "99")
// ============================================================

export const addenda99DishonoredFields: FieldSpec[] = [
  { name: 'recordType',                          start: 0,  end: 1  },
  { name: 'typeCode',                            start: 1,  end: 3  },
  { name: 'dishonoredReturnReasonCode',          start: 3,  end: 6  },
  { name: 'originalEntryTraceNumber',            start: 6,  end: 21 },
  { name: 'reserved',                            start: 21, end: 27 },
  { name: 'originalReceivingDFIIdentification',  start: 27, end: 35 },
  { name: 'reserved2',                           start: 35, end: 38 },
  { name: 'returnTraceNumber',                   start: 38, end: 53 },
  { name: 'returnSettlementDate',                start: 53, end: 56 },
  { name: 'returnReasonCode',                    start: 56, end: 58 },
  { name: 'addendaInformation',                  start: 58, end: 79 },
  { name: 'traceNumber',                         start: 79, end: 94 },
];

const addenda99DishonoredErrorNames: Record<string, string> = {
  'TypeCode':                     'typeCode',
  'DishonoredReturnReasonCode':   'dishonoredReturnReasonCode',
};

export const addenda99DishonoredFieldPositions = buildPositionMap(addenda99DishonoredFields, addenda99DishonoredErrorNames);

// ============================================================
// Addenda99Contested (record type "7", typeCode "99")
// ============================================================

export const addenda99ContestedFields: FieldSpec[] = [
  { name: 'recordType',                        start: 0,  end: 1  },
  { name: 'typeCode',                           start: 1,  end: 3  },
  { name: 'contestedReturnCode',                start: 3,  end: 6  },
  { name: 'originalEntryTraceNumber',           start: 6,  end: 21 },
  { name: 'dateOriginalEntryReturned',          start: 21, end: 27 },
  { name: 'originalReceivingDFIIdentification', start: 27, end: 35 },
  { name: 'originalSettlementDate',             start: 35, end: 38 },
  { name: 'returnTraceNumber',                  start: 38, end: 53 },
  { name: 'returnSettlementDate',               start: 53, end: 56 },
  { name: 'returnReasonCode',                   start: 56, end: 58 },
  { name: 'dishonoredReturnTraceNumber',        start: 58, end: 73 },
  { name: 'dishonoredReturnSettlementDate',     start: 73, end: 76 },
  { name: 'dishonoredReturnReasonCode',         start: 76, end: 78 },
  { name: 'reserved',                           start: 78, end: 79 },
  { name: 'traceNumber',                        start: 79, end: 94 },
];

const addenda99ContestedErrorNames: Record<string, string> = {
  'TypeCode':              'typeCode',
  'ContestedReturnCode':   'contestedReturnCode',
};

export const addenda99ContestedFieldPositions = buildPositionMap(addenda99ContestedFields, addenda99ContestedErrorNames);

// ============================================================
// Addenda field position lookup by typeCode
// ============================================================

/**
 * Return the field position map for an addenda record, keyed by typeCode.
 * For typeCode '98' and '99', pass isRefused/isDishonored/isContested to disambiguate.
 */
export function getAddendaFieldPositions(
  typeCode: string,
  opts?: { isRefused?: boolean; isDishonored?: boolean; isContested?: boolean },
): Record<string, FieldPosition> | undefined {
  switch (typeCode) {
    case '02': return addenda02FieldPositions;
    case '05': return addenda05FieldPositions;
    case '10': return addenda10FieldPositions;
    case '11': return addenda11FieldPositions;
    case '12': return addenda12FieldPositions;
    case '13': return addenda13FieldPositions;
    case '14': return addenda14FieldPositions;
    case '15': return addenda15FieldPositions;
    case '16': return addenda16FieldPositions;
    case '17': return addenda17FieldPositions;
    case '18': return addenda18FieldPositions;
    case '98': return opts?.isRefused ? addenda98RefusedFieldPositions : addenda98FieldPositions;
    case '99':
      if (opts?.isContested) return addenda99ContestedFieldPositions;
      if (opts?.isDishonored) return addenda99DishonoredFieldPositions;
      return addenda99FieldPositions;
    default: return undefined;
  }
}

// ============================================================
// recordNameToFieldPositions — map Reader recordName to position map
// ============================================================

/**
 * Map from the Reader's recordName string to the corresponding field position map.
 * Used by parseError() to enrich ParseError with column data.
 */
export const recordNameToFieldPositions: Record<string, Record<string, FieldPosition>> = {
  'FileHeader': fileHeaderFieldPositions,
  'BatchHeader': batchHeaderFieldPositions,
  'EntryDetail': entryDetailFieldPositions,
  'BatchControl': batchControlFieldPositions,
  'FileControl': fileControlFieldPositions,
};

// ============================================================
// recordTypeToFieldSpecs — decompose any raw line by record type
// ============================================================

/**
 * Return the FieldSpec array for a given record type code.
 * For type "5" (batch header), pass secCode to distinguish BatchHeader vs IATBatchHeader.
 * For type "6" (entry detail), pass secCode to distinguish EntryDetail, IATEntryDetail, or ADVEntryDetail.
 * For type "8" (batch control), pass isADV to distinguish BatchControl vs ADVBatchControl.
 * For type "9" (file control), pass isADV to distinguish FileControl vs ADVFileControl.
 */
export function recordTypeToFieldSpecs(
  recordType: string,
  opts?: { secCode?: string; isADV?: boolean },
): FieldSpec[] | undefined {
  switch (recordType) {
    case '1':
      return fileHeaderFields;
    case '5':
      return opts?.secCode === 'IAT' ? iatBatchHeaderFields : batchHeaderFields;
    case '6':
      if (opts?.isADV) return advEntryDetailFields;
      return opts?.secCode === 'IAT' ? iatEntryDetailFields : entryDetailFields;
    case '7':
      return undefined; // Addenda type depends on typeCode — use addenda-specific maps directly
    case '8':
      return opts?.isADV ? advBatchControlFields : batchControlFields;
    case '9':
      return opts?.isADV ? advFileControlFields : fileControlFields;
    default:
      return undefined;
  }
}
