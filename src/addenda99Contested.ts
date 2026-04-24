import { entryAddendaPos } from './constants.js';
import { enrichErrors, addenda99ContestedFieldPositions } from './fieldPositions.js';
import type { ValidateOpts } from './validateOpts.js';
import { Converters } from './utils/converters.js';
import {
  fieldError,
  ErrConstructor,
  ErrAddendaTypeCode,
  ErrAddenda99ContestedReturnCode,
} from './errors/index.js';

/** Valid contested return codes */
const contestedReturnCodes = new Set(['R71', 'R72', 'R73', 'R74', 'R75', 'R76', 'R77']);

export function isContestedReturnCode(code: string): boolean {
  return contestedReturnCodes.has(code);
}

/**
 * Addenda99Contested provides information for contested dishonored return entries.
 */
export class Addenda99Contested {
  id = '';
  typeCode = '99';
  contestedReturnCode = '';
  originalEntryTraceNumber = '';
  dateOriginalEntryReturned = '';
  originalReceivingDFIIdentification = '';
  originalSettlementDate = '';
  returnTraceNumber = '';
  returnSettlementDate = '';
  returnReasonCode = '';
  dishonoredReturnTraceNumber = '';
  dishonoredReturnSettlementDate = '';
  dishonoredReturnReasonCode = '';
  traceNumber = '';
  lineNumber = 0;

  private converters = new Converters();
  validateOpts?: ValidateOpts;

  parse(record: string): void {
    const runes = [...record];
    if (runes.length !== 94) return;

    // 1 Always "7"
    // 2-3 TypeCode "99"
    this.typeCode = runes.slice(1, 3).join('').trim();
    // 4-6 ContestedReturnCode
    this.contestedReturnCode = runes.slice(3, 6).join('').trim();
    // 7-21 OriginalEntryTraceNumber
    this.originalEntryTraceNumber = runes.slice(6, 21).join('').trim();
    // 22-27 DateOriginalEntryReturned
    this.dateOriginalEntryReturned = runes.slice(21, 27).join('').trim();
    // 28-35 OriginalReceivingDFIIdentification
    this.originalReceivingDFIIdentification = runes.slice(27, 35).join('').trim();
    // 36-38 OriginalSettlementDate
    this.originalSettlementDate = runes.slice(35, 38).join('').trim();
    // 39-53 ReturnTraceNumber
    this.returnTraceNumber = runes.slice(38, 53).join('').trim();
    // 54-56 ReturnSettlementDate
    this.returnSettlementDate = runes.slice(53, 56).join('').trim();
    // 57-58 ReturnReasonCode
    this.returnReasonCode = runes.slice(56, 58).join('').trim();
    // 59-73 DishonoredReturnTraceNumber
    this.dishonoredReturnTraceNumber = runes.slice(58, 73).join('').trim();
    // 74-76 DishonoredReturnSettlementDate
    this.dishonoredReturnSettlementDate = runes.slice(73, 76).join('').trim();
    // 77-78 DishonoredReturnReasonCode
    this.dishonoredReturnReasonCode = runes.slice(76, 78).join('').trim();
    // 79 Reserved
    // 80-94 TraceNumber
    this.traceNumber = runes.slice(79, 94).join('').trim();
  }

  setValidation(opts: ValidateOpts | undefined): void { this.validateOpts = opts; }

  string(): string {
    return (
      entryAddendaPos +
      this.typeCode +
      this.contestedReturnCodeField() +
      this.originalEntryTraceNumberField() +
      this.dateOriginalEntryReturnedField() +
      this.originalReceivingDFIIdentificationField() +
      this.originalSettlementDateField() +
      this.returnTraceNumberField() +
      this.returnSettlementDateField() +
      this.returnReasonCodeField() +
      this.dishonoredReturnTraceNumberField() +
      this.dishonoredReturnSettlementDateField() +
      this.dishonoredReturnReasonCodeField() +
      ' ' +
      this.traceNumberField()
    );
  }

  validate(): Error | null {
    if (this.typeCode === '') return fieldError('TypeCode', ErrConstructor, this.typeCode);
    if (this.typeCode !== '99') return fieldError('TypeCode', ErrAddendaTypeCode, this.typeCode);

    if (!this.validateOpts?.customReturnCodes) {
      if (!isContestedReturnCode(this.contestedReturnCode)) {
        return fieldError('ContestedReturnCode', ErrAddenda99ContestedReturnCode, this.contestedReturnCode);
      }
    }
    return null;
  }

  /** ValidateAll performs all NACHA format rule checks and returns all errors found */
  validateAll(): Error[] {
    const errors: Error[] = [];
    const push = (err: Error | null | undefined) => { if (err) errors.push(err); };

    if (this.typeCode === '') push(fieldError('TypeCode', ErrConstructor, this.typeCode));
    if (this.typeCode !== '99') push(fieldError('TypeCode', ErrAddendaTypeCode, this.typeCode));
    if (!this.validateOpts?.customReturnCodes) {
      if (!isContestedReturnCode(this.contestedReturnCode)) {
        push(fieldError('ContestedReturnCode', ErrAddenda99ContestedReturnCode, this.contestedReturnCode));
      }
    }

    return enrichErrors(errors, this.lineNumber, addenda99ContestedFieldPositions);
  }

  contestedReturnCodeField(): string { return this.converters.stringField(this.contestedReturnCode, 3); }
  originalEntryTraceNumberField(): string { return this.converters.stringField(this.originalEntryTraceNumber, 15); }
  dateOriginalEntryReturnedField(): string { return this.converters.stringField(this.dateOriginalEntryReturned, 6); }
  originalReceivingDFIIdentificationField(): string { return this.converters.stringField(this.originalReceivingDFIIdentification, 8); }
  originalSettlementDateField(): string { return this.converters.stringField(this.originalSettlementDate, 3); }
  returnTraceNumberField(): string { return this.converters.stringField(this.returnTraceNumber, 15); }
  returnSettlementDateField(): string { return this.converters.stringField(this.returnSettlementDate, 3); }
  returnReasonCodeField(): string { return this.converters.stringField(this.returnReasonCode, 2); }
  dishonoredReturnTraceNumberField(): string { return this.converters.stringField(this.dishonoredReturnTraceNumber, 15); }
  dishonoredReturnSettlementDateField(): string { return this.converters.stringField(this.dishonoredReturnSettlementDate, 3); }
  dishonoredReturnReasonCodeField(): string { return this.converters.stringField(this.dishonoredReturnReasonCode, 2); }
  traceNumberField(): string { return this.converters.stringField(this.traceNumber, 15); }
}

export function newAddenda99Contested(): Addenda99Contested { return new Addenda99Contested(); }
