import { entryAddendaPos } from './constants.js';
import { Converters } from './utils/converters.js';
import {
  fieldError,
  ErrConstructor,
  ErrAddendaTypeCode,
  ErrAddenda98ChangeCode,
  ErrAddenda98CorrectedData,
} from './errors/index.js';

export interface ChangeCode {
  code: string;
  reason: string;
  description: string;
}

const changeCodeDict: Map<string, ChangeCode> = new Map();

function initChangeCodeDict(): void {
  const codes: ChangeCode[] = [
    { code: 'C01', reason: 'Incorrect bank account number', description: 'Bank account number incorrect or formatted incorrectly' },
    { code: 'C02', reason: 'Incorrect transit/routing number', description: 'Once valid transit/routing number must be changed' },
    { code: 'C03', reason: 'Incorrect transit/routing number and bank account number', description: 'Once valid transit/routing number must be changed and causes a change to bank account number structure' },
    { code: 'C04', reason: 'Bank account name change', description: 'Customer has changed name or ODFI submitted name incorrectly' },
    { code: 'C05', reason: 'Incorrect transaction code', description: 'Entry posted to demand account should contain savings transaction codes or vice versa' },
    { code: 'C06', reason: 'Incorrect bank account number and transit code', description: 'Bank account number must be changed and transaction code should indicate posting to another account type (demand/savings)' },
    { code: 'C07', reason: 'Incorrect transit/routing number, bank account number and transaction code', description: 'Changes required in three fields indicated' },
    { code: 'C08', reason: 'Incorrect Receiving transit/routing number (IAT only)', description: 'Once valid transit/routing number must be changed' },
    { code: 'C09', reason: 'Incorrect individual ID number', description: "Individual's ID number is incorrect" },
    { code: 'C13', reason: 'Addenda Format Error', description: 'Entry Detail Record was correct and processed, however unclear or incorrect data was found in the addenda record' },
    { code: 'C14', reason: 'Incorrect SEC Code for outbound IAT payment', description: 'Outbound international payments must use the IAT SEC code and convey required information for OFAC compliance.' },
    // Change codes used when refusing a Notification of Change
    { code: 'C61', reason: 'Misrouted Notification of Change', description: '' },
    { code: 'C62', reason: 'Incorrect Trace Number', description: '' },
    { code: 'C63', reason: 'Incorrect Company Identification Number', description: '' },
    { code: 'C64', reason: 'Incorrect Individual Identification Number or Identification Number', description: '' },
    { code: 'C65', reason: 'Incorrectly Formatted Corrected Data', description: '' },
    { code: 'C66', reason: 'Incorrect Discretionary Data', description: '' },
    { code: 'C67', reason: 'Routing Number not from Original Entry Detail Record', description: '' },
    { code: 'C68', reason: 'DFI Account Number not from Original Entry Detail Record', description: '' },
    { code: 'C69', reason: 'Incorrect Transaction Code', description: '' },
  ];
  for (const c of codes) {
    changeCodeDict.set(c.code, c);
  }
}
initChangeCodeDict();

export function lookupChangeCode(code: string): ChangeCode | null {
  return changeCodeDict.get(code.toUpperCase()) ?? null;
}

export function isRefusedChangeCode(code: string): boolean {
  switch (code.toUpperCase()) {
    case 'C61': case 'C62': case 'C63': case 'C64': case 'C65':
    case 'C66': case 'C67': case 'C68': case 'C69':
      return true;
  }
  return false;
}

/**
 * Addenda98 is used for Notification of Change (NOC/COR) entries.
 */
export class Addenda98 {
  id = '';
  typeCode = '98';
  changeCode = '';
  originalTrace = '';
  originalDFI = '';
  correctedData = '';
  traceNumber = '';
  lineNumber = 0;

  /** IAT corrected data - additional space for IAT corrections */
  private iatCorrectedData = '';

  private converters = new Converters();

  parse(record: string): void {
    const runes = [...record];
    if (runes.length !== 94) return;

    // 1 Always "7"
    // 2-3 TypeCode "98"
    this.typeCode = runes.slice(1, 3).join('');
    // 4-6 ChangeCode
    this.changeCode = runes.slice(3, 6).join('');
    // 7-21 OriginalTrace
    this.originalTrace = runes.slice(6, 21).join('').trim();
    // 22-27 Reserved
    // 28-35 OriginalDFI
    this.originalDFI = this.converters.parseStringField(runes.slice(27, 35).join(''));
    // 36-64 CorrectedData
    this.correctedData = runes.slice(35, 64).join('').trim();
    // 65-70 IAT Corrected Data (reserved for non-IAT)
    this.iatCorrectedData = runes.slice(64, 70).join('').trim();
    // 71-79 Reserved
    // 80-94 TraceNumber
    this.traceNumber = runes.slice(79, 94).join('').trim();
  }

  string(): string {
    return (
      entryAddendaPos +
      this.typeCode +
      this.changeCode +
      this.originalTraceField() +
      '      ' + // 6 char reserved
      this.originalDFIField() +
      this.correctedDataField() +
      '               ' + // 15 char reserved
      this.traceNumberField()
    );
  }

  validate(): Error | null {
    if (this.typeCode === '') {
      return fieldError('TypeCode', ErrConstructor, this.typeCode);
    }
    if (this.typeCode !== '98') {
      return fieldError('TypeCode', ErrAddendaTypeCode, this.typeCode);
    }
    if (!changeCodeDict.has(this.changeCode)) {
      return fieldError('ChangeCode', ErrAddenda98ChangeCode, this.changeCode);
    }
    if (this.correctedData === '') {
      return fieldError('CorrectedData', ErrAddenda98CorrectedData, this.correctedData);
    }
    return null;
  }

  changeCodeField(): ChangeCode | null {
    return changeCodeDict.get(this.changeCode) ?? null;
  }

  originalTraceField(): string { return this.converters.stringField(this.originalTrace, 15); }
  originalDFIField(): string { return this.converters.stringField(this.originalDFI, 8); }

  correctedDataField(): string {
    if (this.iatCorrectedData === '') {
      return this.converters.alphaField(this.correctedData, 29);
    }
    return this.iatCorrectedDataField();
  }

  iatCorrectedDataField(): string {
    return this.converters.alphaField(this.correctedData, 29) +
      this.converters.alphaField(this.iatCorrectedData, 6);
  }

  traceNumberField(): string { return this.converters.stringField(this.traceNumber, 15); }
}

export function newAddenda98(): Addenda98 {
  return new Addenda98();
}

/** CorrectedData represents parsed correction data from an Addenda98 record */
export interface CorrectedData {
  accountNumber?: string;
  routingNumber?: string;
  name?: string;
  transactionCode?: number;
  identification?: string;
}

/** WriteCorrectionData formats corrected data for an Addenda98 CorrectedData field */
export function writeCorrectionData(code: string, data: CorrectedData): string {
  const c = new Converters();
  const len = 29;
  switch (code.toUpperCase()) {
    case 'C01':
      return c.alphaField(data.accountNumber ?? '', len);
    case 'C02':
      return c.alphaField(data.routingNumber ?? '', len);
    case 'C03': {
      const rn = data.routingNumber ?? '';
      const an = data.accountNumber ?? '';
      const spaces = ' '.repeat(len - rn.length - an.length);
      return `${rn}${spaces}${an}`;
    }
    case 'C04':
      return c.alphaField(data.name ?? '', len);
    case 'C05':
      return c.alphaField(String(data.transactionCode ?? 0), len);
    case 'C06': {
      const an = data.accountNumber ?? '';
      const tc = String(data.transactionCode ?? 0);
      const spaces = ' '.repeat(len - an.length - tc.length);
      return `${an}${spaces}${tc}`;
    }
    case 'C07': {
      const rn = data.routingNumber ?? '';
      const an = data.accountNumber ?? '';
      const tc = String(data.transactionCode ?? 0);
      const spaces = ' '.repeat(len - 9 - an.length - tc.length);
      return `${rn}${an}${spaces}${tc}`;
    }
    case 'C09':
      return c.alphaField(data.identification ?? '', len);
  }
  return c.alphaField('', len);
}
