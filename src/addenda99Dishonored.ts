import { entryAddendaPos } from './constants.js';
import type { ValidateOpts } from './validateOpts.js';
import { Converters } from './utils/converters.js';
import {
  fieldError,
  ErrConstructor,
  ErrAddendaTypeCode,
  ErrAddenda99DishonoredReturnCode,
} from './errors/index.js';

/** Valid dishonored return reason codes */
const dishonoredReturnCodes = new Set(['R61', 'R62', 'R67', 'R68', 'R69', 'R70']);

export function isDishonoredReturnCode(code: string): boolean {
  return dishonoredReturnCodes.has(code);
}

/**
 * Addenda99Dishonored provides information for dishonored return entries.
 */
export class Addenda99Dishonored {
  id = '';
  typeCode = '99';
  dishonoredReturnReasonCode = '';
  originalEntryTraceNumber = '';
  originalReceivingDFIIdentification = '';
  returnTraceNumber = '';
  returnSettlementDate = '';
  returnReasonCode = '';
  addendaInformation = '';
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
    // 4-6 DishonoredReturnReasonCode
    this.dishonoredReturnReasonCode = runes.slice(3, 6).join('').trim();
    // 7-21 OriginalEntryTraceNumber
    this.originalEntryTraceNumber = runes.slice(6, 21).join('').trim();
    // 22-27 Reserved
    // 28-35 OriginalReceivingDFIIdentification
    this.originalReceivingDFIIdentification = runes.slice(27, 35).join('').trim();
    // 36-38 Reserved
    // 39-53 ReturnTraceNumber
    this.returnTraceNumber = runes.slice(38, 53).join('').trim();
    // 54-56 ReturnSettlementDate
    this.returnSettlementDate = runes.slice(53, 56).join('').trim();
    // 57-58 ReturnReasonCode
    this.returnReasonCode = runes.slice(56, 58).join('').trim();
    // 59-79 AddendaInformation
    this.addendaInformation = runes.slice(58, 79).join('').trim();
    // 80-94 TraceNumber
    this.traceNumber = runes.slice(79, 94).join('').trim();
  }

  setValidation(opts: ValidateOpts | undefined): void { this.validateOpts = opts; }

  string(): string {
    return (
      entryAddendaPos +
      this.typeCode +
      this.dishonoredReturnReasonCodeField() +
      this.originalEntryTraceNumberField() +
      '      ' +
      this.originalReceivingDFIIdentificationField() +
      '   ' +
      this.returnTraceNumberField() +
      this.returnSettlementDateField() +
      this.returnReasonCodeField() +
      this.addendaInformationField() +
      this.traceNumberField()
    );
  }

  validate(): Error | null {
    if (this.typeCode === '') return fieldError('TypeCode', ErrConstructor, this.typeCode);
    if (this.typeCode !== '99') return fieldError('TypeCode', ErrAddendaTypeCode, this.typeCode);

    if (!this.validateOpts?.customReturnCodes) {
      if (!isDishonoredReturnCode(this.dishonoredReturnReasonCode)) {
        return fieldError('DishonoredReturnReasonCode', ErrAddenda99DishonoredReturnCode, this.dishonoredReturnReasonCode);
      }
    }
    return null;
  }

  dishonoredReturnReasonCodeField(): string { return this.converters.stringField(this.dishonoredReturnReasonCode, 3); }
  originalEntryTraceNumberField(): string { return this.converters.stringField(this.originalEntryTraceNumber, 15); }
  originalReceivingDFIIdentificationField(): string { return this.converters.stringField(this.originalReceivingDFIIdentification, 8); }
  returnTraceNumberField(): string { return this.converters.stringField(this.returnTraceNumber, 15); }
  returnSettlementDateField(): string { return this.converters.stringField(this.returnSettlementDate, 3); }
  returnReasonCodeField(): string { return this.converters.stringField(this.returnReasonCode, 2); }
  addendaInformationField(): string { return this.converters.alphaField(this.addendaInformation, 21); }
  traceNumberField(): string { return this.converters.stringField(this.traceNumber, 15); }
}

export function newAddenda99Dishonored(): Addenda99Dishonored { return new Addenda99Dishonored(); }
