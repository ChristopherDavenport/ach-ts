import { entryAddendaPos } from './constants.js';
import { enrichErrors, addenda98RefusedFieldPositions } from './fieldPositions.js';
import { Converters } from './utils/converters.js';
import { lookupChangeCode, type ChangeCode } from './addenda98.js';
import {
  fieldError,
  ErrConstructor,
  ErrAddendaTypeCode,
  ErrAddenda98RefusedChangeCode,
  ErrAddenda98ChangeCode,
  ErrAddenda98CorrectedData,
  ErrAddenda98RefusedTraceSequenceNumber,
} from './errors/index.js';

/**
 * Addenda98Refused is used when an RDFI refuses a Notification of Change (NOC).
 */
export class Addenda98Refused {
  id = '';
  typeCode = '98';
  refusedChangeCode = '';
  originalTrace = '';
  originalDFI = '';
  correctedData = '';
  changeCode = '';
  traceSequenceNumber = '';
  traceNumber = '';
  lineNumber = 0;

  private converters = new Converters();

  parse(record: string): void {
    const runes = [...record];
    if (runes.length !== 94) return;

    // 1 Always "7"
    // 2-3 TypeCode "98"
    this.typeCode = runes.slice(1, 3).join('').trim();
    // 4-6 RefusedChangeCode
    this.refusedChangeCode = runes.slice(3, 6).join('').trim();
    // 7-21 OriginalTrace
    this.originalTrace = runes.slice(6, 21).join('').trim();
    // 22-27 Reserved
    // 28-35 OriginalDFI
    this.originalDFI = this.converters.parseStringField(runes.slice(27, 35).join(''));
    // 36-64 CorrectedData
    this.correctedData = runes.slice(35, 64).join('').trim();
    // 65-67 ChangeCode
    this.changeCode = runes.slice(64, 67).join('').trim();
    // 68-74 TraceSequenceNumber
    this.traceSequenceNumber = runes.slice(67, 74).join('').trim();
    // 75-79 Reserved
    // 80-94 TraceNumber
    this.traceNumber = runes.slice(79, 94).join('').trim();
  }

  string(): string {
    return (
      entryAddendaPos +
      this.typeCode +
      this.refusedChangeCode +
      this.originalTraceField() +
      '      ' +
      this.originalDFIField() +
      this.correctedDataField() +
      this.changeCode +
      this.traceSequenceNumberField() +
      '     ' +
      this.traceNumberField()
    );
  }

  validate(): Error | null {
    if (this.typeCode === '') return fieldError('TypeCode', ErrConstructor, this.typeCode);
    if (this.typeCode !== '98') return fieldError('TypeCode', ErrAddendaTypeCode, this.typeCode);

    if (!lookupChangeCode(this.refusedChangeCode)) {
      return fieldError('RefusedChangeCode', ErrAddenda98RefusedChangeCode, this.refusedChangeCode);
    }
    if (this.correctedData === '') {
      return fieldError('CorrectedData', ErrAddenda98CorrectedData, this.correctedData);
    }
    if (!lookupChangeCode(this.changeCode)) {
      return fieldError('ChangeCode', ErrAddenda98ChangeCode, this.changeCode);
    }
    if (this.traceSequenceNumber === '') {
      return fieldError('TraceSequenceNumber', ErrAddenda98RefusedTraceSequenceNumber, this.traceSequenceNumber);
    }
    return null;
  }

  /** ValidateAll performs all NACHA format rule checks and returns all errors found */
  validateAll(): Error[] {
    const errors: Error[] = [];
    const push = (err: Error | null | undefined) => { if (err) errors.push(err); };

    if (this.typeCode === '') push(fieldError('TypeCode', ErrConstructor, this.typeCode));
    if (this.typeCode !== '98') push(fieldError('TypeCode', ErrAddendaTypeCode, this.typeCode));
    if (!lookupChangeCode(this.refusedChangeCode)) push(fieldError('RefusedChangeCode', ErrAddenda98RefusedChangeCode, this.refusedChangeCode));
    if (this.correctedData === '') push(fieldError('CorrectedData', ErrAddenda98CorrectedData, this.correctedData));
    if (!lookupChangeCode(this.changeCode)) push(fieldError('ChangeCode', ErrAddenda98ChangeCode, this.changeCode));
    if (this.traceSequenceNumber === '') push(fieldError('TraceSequenceNumber', ErrAddenda98RefusedTraceSequenceNumber, this.traceSequenceNumber));

    return enrichErrors(errors, this.lineNumber, addenda98RefusedFieldPositions);
  }

  refusedChangeCodeField(): ChangeCode | null { return lookupChangeCode(this.refusedChangeCode); }
  changeCodeField(): ChangeCode | null { return lookupChangeCode(this.changeCode); }

  originalTraceField(): string { return this.converters.stringField(this.originalTrace, 15); }
  originalDFIField(): string { return this.converters.stringField(this.originalDFI, 8); }
  correctedDataField(): string { return this.converters.alphaField(this.correctedData, 29); }
  traceSequenceNumberField(): string { return this.converters.stringField(this.traceSequenceNumber, 7); }
  traceNumberField(): string { return this.converters.stringField(this.traceNumber, 15); }
}

export function newAddenda98Refused(): Addenda98Refused { return new Addenda98Refused(); }
