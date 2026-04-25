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

import { fileHeaderPos } from './constants.js';
import { enrichErrors, enrichError, fileHeaderFieldPositions } from './fieldPositions.js';
import type { ValidateOpts } from './validateOpts.js';
import { isSkipped, applyErrorLevel, applyErrorLevels } from './validateOpts.js';
import { Converters, converters } from './utils/converters.js';
import { Validators, validators, CheckRoutingNumber } from './utils/validators.js';
import {
  fieldError,
  ErrConstructor,
  ErrRecordSize,
  ErrBlockingFactor,
  ErrFormatCode,
  ErrValidFieldLength,
} from './errors/index.js';

/**
 * FileHeader is a Record designating physical file characteristics and identifying
 * the origin (sending point) and destination (receiving point) of the entries
 * contained in the file.
 */
export class FileHeader {
  /** ID is an identifier used by the HTTP server */
  id = '';

  /** PriorityCode consists of the numerals 01 */
  private priorityCode = '01';

  /** ImmediateDestination contains the Routing Number of the ACH Operator or receiving point */
  immediateDestination = '';

  /** ImmediateOrigin contains the Routing Number of the ACH Operator or sending point */
  immediateOrigin = '';

  /** FileCreationDate is the date on which the file is prepared (YYMMDD format) */
  fileCreationDate = '';

  /** FileCreationTime is the system time when the ACH file was created (HHmm format) */
  fileCreationTime = '';

  /** FileIDModifier: start at 0, increment by 1 up to 9, then A-Z */
  fileIDModifier = 'A';

  /** RecordSize indicates the number of characters contained in each record. Always "094" */
  private recordSize = '094';

  /** BlockingFactor defines the number of physical records within a block. Always "10" */
  private blockingFactor = '10';

  /** FormatCode allows for future format variations. Currently "1" */
  formatCode = '1';

  /** ImmediateDestinationName is the name of the ACH or receiving point */
  immediateDestinationName = '';

  /** ImmediateOriginName is the name of the ACH operator or sending point */
  immediateOriginName = '';

  /** ReferenceCode is reserved for information pertinent to the Originator */
  referenceCode = '';

  /** Line number at which the record appears in the file */
  lineNumber = 0;

  // Composed utilities
  /** ValidateOpts for overriding default NACHA validation */
  validateOpts?: ValidateOpts;

  /**
   * Parse takes the input record string and parses the FileHeader values.
   * Record must be exactly 94 characters.
   */
  parse(record: string): void {
    const runes = [...record];
    if (runes.length !== 94) return;

    // (1-1) Always "1"
    // (2-3) Always "01"
    this.priorityCode = '01';
    // (4-13) Routing number with leading space
    this.immediateDestination = trimRoutingNumberLeadingZero(
      converters.parseStringField(runes.slice(3, 13).join(''))
    );
    // (14-23) Origin routing number
    this.immediateOrigin = trimRoutingNumberLeadingZero(
      converters.parseStringField(runes.slice(13, 23).join(''))
    );
    // (24-29) Creation date YYMMDD
    this.fileCreationDate = validators.validateSimpleDate(runes.slice(23, 29).join(''));
    // (30-33) Creation time HHmm
    this.fileCreationTime = validators.validateSimpleTime(runes.slice(29, 33).join(''));
    // (34) File ID Modifier
    this.fileIDModifier = runes.slice(33, 34).join('');
    // (35-37) Record size always "094"
    this.recordSize = '094';
    // (38-39) Blocking factor always "10"
    this.blockingFactor = '10';
    // (40) Format code
    this.formatCode = converters.parseStringField(runes.slice(39, 40).join(''));
    // (41-63) Destination name
    this.immediateDestinationName = converters.parseStringFieldWithOpts(
      runes.slice(40, 63).join(''), this.validateOpts
    );
    // (64-86) Origin name
    this.immediateOriginName = converters.parseStringFieldWithOpts(
      runes.slice(63, 86).join(''), this.validateOpts
    );
    // (87-94) Reference code
    this.referenceCode = converters.parseStringFieldWithOpts(
      runes.slice(86, 94).join(''), this.validateOpts
    );
  }

  /** String writes the FileHeader struct to a 94 character string */
  string(): string {
    return (
      fileHeaderPos +
      this.priorityCode +
      this.immediateDestinationField() +
      this.immediateOriginField() +
      this.fileCreationDateField() +
      this.fileCreationTimeField() +
      this.fileIDModifier +
      this.recordSize +
      this.blockingFactor +
      this.formatCode +
      this.immediateDestinationNameField() +
      this.immediateOriginNameField() +
      this.referenceCodeField()
    );
  }

  /** SetValidation stores ValidateOpts on the FileHeader */
  setValidation(opts: ValidateOpts | undefined): void {
    this.validateOpts = opts;
  }

  /** Validate performs NACHA format rule checks */
  validate(): Error | null {
    let err = this.validateWith(this.validateOpts);
    if (err) enrichError(err, this.lineNumber, fileHeaderFieldPositions);
    err = applyErrorLevel(err, this.validateOpts);
    return err;
  }

  /** ValidateWith performs NACHA format rule checks with custom options */
  validateWith(opts?: ValidateOpts): Error | null {
    if (!opts) opts = {};

    const inclErr = this.fieldInclusion();
    if (inclErr) return inclErr;

    // FileIDModifier must be uppercase alphanumeric
    const upperErr = validators.isUpperASCII(this.fileIDModifier);
    if (upperErr) return fieldError('FileIDModifier', upperErr, this.fileIDModifier);

    if ([...this.fileIDModifier].length !== 1) {
      return fieldError('FileIDModifier', new ErrValidFieldLength(1), this.fileIDModifier);
    }

    if (this.recordSize !== '094') {
      return fieldError('recordSize', ErrRecordSize, this.recordSize);
    }
    if (this.blockingFactor !== '10') {
      return fieldError('blockingFactor', ErrBlockingFactor, this.blockingFactor);
    }
    if (this.formatCode !== '1') {
      return fieldError('FormatCode', ErrFormatCode, this.formatCode);
    }

    // ImmediateOrigin validation
    if (!isSkipped(opts, 'bypassOriginValidation')) {
      if (this.immediateOrigin === '000000000' || this.immediateOrigin === '0000000000') {
        return fieldError('ImmediateOrigin', ErrConstructor, this.immediateOrigin);
      }
      if (opts.requireABAOrigin) {
        const err = CheckRoutingNumber(this.immediateOrigin);
        if (err) return fieldError('ImmediateOrigin', err, this.immediateOrigin);
      }
    }

    // ImmediateDestination validation
    if (!isSkipped(opts, 'bypassDestinationValidation')) {
      if (this.immediateDestination === '000000000') {
        return fieldError('ImmediateDestination', ErrConstructor, this.immediateDestination);
      }
      const err = CheckRoutingNumber(this.immediateDestination);
      if (err) return fieldError('ImmediateDestination', err, this.immediateDestination);
    }

    // Alphanumeric checks (unless special characters allowed)
    if (!isSkipped(this.validateOpts, 'allowSpecialCharacters')) {
      const destNameErr = validators.isAlphanumeric(this.immediateDestinationName);
      if (destNameErr) return fieldError('ImmediateDestinationName', destNameErr, this.immediateDestinationName);

      const origNameErr = validators.isAlphanumeric(this.immediateOriginName);
      if (origNameErr) return fieldError('ImmediateOriginName', origNameErr, this.immediateOriginName);

      const refErr = validators.isAlphanumeric(this.referenceCode);
      if (refErr) return fieldError('ReferenceCode', refErr, this.referenceCode);
    }

    // File creation date/time validation
    if (!isSkipped(this.validateOpts, 'skipFileCreationValidation')) {
      if (this.fileCreationDate !== '') {
        const when = this.fileCreationDateField();
        if (when === '') {
          return fieldError('FileCreationDate', new Error('invalid FileCreationDate'), this.fileCreationDate);
        }
      }
      if (this.fileCreationTime !== '') {
        const when = this.fileCreationTimeField();
        if (when === '') {
          return fieldError('FileCreationTime', new Error('invalid FileCreationTime'), this.fileCreationTime);
        }
      }
    }

    return null;
  }

  /** ValidateAll performs all NACHA format rule checks and returns all errors found */
  validateAll(): Error[] {
    return this.validateAllWith(this.validateOpts);
  }

  /** ValidateAllWith performs all NACHA format rule checks with custom options and returns all errors found */
  validateAllWith(opts?: ValidateOpts): Error[] {
    if (!opts) opts = {};
    const errors: Error[] = [];
    const push = (err: Error | null | undefined) => { if (err) errors.push(err); };

    // Field inclusion checks (inlined to collect all)
    if (!opts.allowMissingFileHeader) {
      if (this.immediateDestination === '') push(fieldError('ImmediateDestination', ErrConstructor, this.immediateDestinationField()));
      if (this.immediateOrigin === '') push(fieldError('ImmediateOrigin', ErrConstructor, this.immediateOriginField()));
      if (this.fileCreationDate === '') push(fieldError('FileCreationDate', ErrConstructor, this.fileCreationDate));
      if (this.fileIDModifier === '') push(fieldError('FileIDModifier', ErrConstructor, this.fileIDModifier));
      if (this.recordSize === '') push(fieldError('recordSize', ErrConstructor, this.recordSize));
      if (this.blockingFactor === '') push(fieldError('blockingFactor', ErrConstructor, this.blockingFactor));
      if (this.formatCode === '') push(fieldError('FormatCode', ErrConstructor, this.formatCode));
    }

    // FileIDModifier must be uppercase alphanumeric
    push(fieldError('FileIDModifier', validators.isUpperASCII(this.fileIDModifier), this.fileIDModifier));
    if ([...this.fileIDModifier].length !== 1) {
      push(fieldError('FileIDModifier', new ErrValidFieldLength(1), this.fileIDModifier));
    }
    if (this.recordSize !== '094') push(fieldError('recordSize', ErrRecordSize, this.recordSize));
    if (this.blockingFactor !== '10') push(fieldError('blockingFactor', ErrBlockingFactor, this.blockingFactor));
    if (this.formatCode !== '1') push(fieldError('FormatCode', ErrFormatCode, this.formatCode));

    // ImmediateOrigin validation
    if (!isSkipped(opts, 'bypassOriginValidation')) {
      if (this.immediateOrigin === '000000000' || this.immediateOrigin === '0000000000') {
        push(fieldError('ImmediateOrigin', ErrConstructor, this.immediateOrigin));
      }
      if (opts.requireABAOrigin) {
        push(fieldError('ImmediateOrigin', CheckRoutingNumber(this.immediateOrigin), this.immediateOrigin));
      }
    }

    // ImmediateDestination validation
    if (!isSkipped(opts, 'bypassDestinationValidation')) {
      if (this.immediateDestination === '000000000') {
        push(fieldError('ImmediateDestination', ErrConstructor, this.immediateDestination));
      }
      push(fieldError('ImmediateDestination', CheckRoutingNumber(this.immediateDestination), this.immediateDestination));
    }

    // Alphanumeric checks (unless special characters allowed)
    if (!isSkipped(this.validateOpts, 'allowSpecialCharacters')) {
      push(fieldError('ImmediateDestinationName', validators.isAlphanumeric(this.immediateDestinationName), this.immediateDestinationName));
      push(fieldError('ImmediateOriginName', validators.isAlphanumeric(this.immediateOriginName), this.immediateOriginName));
      push(fieldError('ReferenceCode', validators.isAlphanumeric(this.referenceCode), this.referenceCode));
    }

    // File creation date/time validation
    if (!isSkipped(this.validateOpts, 'skipFileCreationValidation')) {
      if (this.fileCreationDate !== '' && this.fileCreationDateField() === '') {
        push(fieldError('FileCreationDate', new Error('invalid FileCreationDate'), this.fileCreationDate));
      }
      if (this.fileCreationTime !== '' && this.fileCreationTimeField() === '') {
        push(fieldError('FileCreationTime', new Error('invalid FileCreationTime'), this.fileCreationTime));
      }
    }

    return applyErrorLevels(
      enrichErrors(errors, this.lineNumber, fileHeaderFieldPositions),
      this.validateOpts,
    );
  }

  /** fieldInclusion validates mandatory fields are not default values */
  private fieldInclusion(): Error | null {
    if (isSkipped(this.validateOpts, 'allowMissingFileHeader')) return null;

    if (this.immediateDestination === '') {
      return fieldError('ImmediateDestination', ErrConstructor, this.immediateDestinationField());
    }
    if (this.immediateOrigin === '') {
      return fieldError('ImmediateOrigin', ErrConstructor, this.immediateOriginField());
    }
    if (this.fileCreationDate === '') {
      return fieldError('FileCreationDate', ErrConstructor, this.fileCreationDate);
    }
    if (this.fileIDModifier === '') {
      return fieldError('FileIDModifier', ErrConstructor, this.fileIDModifier);
    }
    if (this.recordSize === '') {
      return fieldError('recordSize', ErrConstructor, this.recordSize);
    }
    if (this.blockingFactor === '') {
      return fieldError('blockingFactor', ErrConstructor, this.blockingFactor);
    }
    if (this.formatCode === '') {
      return fieldError('FormatCode', ErrConstructor, this.formatCode);
    }
    return null;
  }

  /** ImmediateDestinationField gets the immediate destination number with space padding */
  immediateDestinationField(): string {
    if (this.immediateDestination === '') {
      return ' '.repeat(10);
    }
    this.immediateDestination = this.immediateDestination.trim();
    if (this.validateOpts?.bypassDestinationValidation && this.immediateDestination.length === 10) {
      return this.immediateDestination;
    }
    return ' ' + converters.stringField(this.immediateDestination, 9);
  }

  /** ImmediateOriginField gets the immediate origin number with space padding */
  immediateOriginField(): string {
    if (this.immediateOrigin === '') {
      return ' '.repeat(10);
    }
    this.immediateOrigin = this.immediateOrigin.trim();
    if (this.validateOpts?.bypassOriginValidation && this.immediateOrigin.length === 10) {
      return this.immediateOrigin;
    }
    return ' ' + converters.stringField(this.immediateOrigin, 9);
  }

  /** FileCreationDateField gets the file creation date in YYMMDD format */
  fileCreationDateField(): string {
    const runes = [...this.fileCreationDate];
    switch (runes.length) {
      case 0: {
        // Return current date in YYMMDD format
        const now = new Date();
        const yy = String(now.getFullYear() % 100).padStart(2, '0');
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        return `${yy}${mm}${dd}`;
      }
      case 6:
        return converters.formatSimpleDate(this.fileCreationDate);
    }
    // Try ISO 8601 parsing
    const d = new Date(this.fileCreationDate);
    if (isNaN(d.getTime())) return '';
    const yy = String(d.getFullYear() % 100).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yy}${mm}${dd}`;
  }

  /** FileCreationTimeField gets the file creation time in HHmm format */
  fileCreationTimeField(): string {
    const runes = [...this.fileCreationTime];
    switch (runes.length) {
      case 0: {
        // Return current time in HHmm format
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        return `${hh}${mm}`;
      }
      case 4:
        return converters.formatSimpleTime(this.fileCreationTime);
    }
    // Try ISO 8601 parsing
    const d = new Date(this.fileCreationTime);
    if (isNaN(d.getTime())) return '';
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}${mm}`;
  }

  /** ImmediateDestinationNameField gets the padded destination name */
  immediateDestinationNameField(): string {
    return converters.alphaField(this.immediateDestinationName, 23);
  }

  /** ImmediateOriginNameField gets the padded origin name */
  immediateOriginNameField(): string {
    return converters.alphaField(this.immediateOriginName, 23);
  }

  /** ReferenceCodeField gets the padded reference code */
  referenceCodeField(): string {
    return converters.alphaField(this.referenceCode, 8);
  }
}

/**
 * NewFileHeader returns a new FileHeader with default values for non-exported fields
 */
export function newFileHeader(): FileHeader {
  return new FileHeader();
}

/**
 * trimRoutingNumberLeadingZero trims leading zero from routing number fields
 */
function trimRoutingNumberLeadingZero(s: string): string {
  const runes = [...s];
  if (runes.length === 10 && s[0] === '0' && s !== '0000000000') {
    return s.substring(1).trim();
  }
  return s.trim();
}
