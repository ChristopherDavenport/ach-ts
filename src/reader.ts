import {
  IAT, ADV, IATCOR, RecordLength,
  fileHeaderPos, batchHeaderPos, entryDetailPos, entryAddendaPos,
  batchControlPos, fileControlPos,
  CategoryReturn, CategoryNOC,
  CategoryDishonoredReturn, CategoryDishonoredReturnContested,
} from './constants.js';
import type { ValidateOpts } from './validateOpts.js';
import { File, newFile } from './file.js';
import { FileHeader, newFileHeader } from './fileHeader.js';
import { FileControl, newFileControl } from './fileControl.js';
import { ADVFileControl, newADVFileControl } from './advFileControl.js';
import { newBatchHeader } from './batchHeader.js';
import { newEntryDetail } from './entryDetail.js';
import { newADVEntryDetail } from './advEntryDetail.js';
import type { Batcher } from './batch.js';
import { newBatch } from './batch.js';
import { IATBatch } from './iatBatch.js';
import { IATBatchHeader } from './iatBatchHeader.js';
import { IATEntryDetail } from './iatEntryDetail.js';
import { newAddenda02 } from './addenda02.js';
import { newAddenda05 } from './addenda05.js';
import { newAddenda10 } from './addenda10.js';
import { newAddenda11 } from './addenda11.js';
import { newAddenda12 } from './addenda12.js';
import { newAddenda13 } from './addenda13.js';
import { newAddenda14 } from './addenda14.js';
import { newAddenda15 } from './addenda15.js';
import { newAddenda16 } from './addenda16.js';
import { newAddenda17 } from './addenda17.js';
import { newAddenda18 } from './addenda18.js';
import { newAddenda98, isRefusedChangeCode } from './addenda98.js';
import { newAddenda98Refused } from './addenda98Refused.js';
import { newAddenda99 } from './addenda99.js';
import { newAddenda99Dishonored, isDishonoredReturnCode } from './addenda99Dishonored.js';
import { newAddenda99Contested, isContestedReturnCode } from './addenda99Contested.js';
import {
  ParseError,
  ACHError,
  ErrFileTooLong,
  ErrFileHeader,
  ErrFileControl,
  ErrMisplacedFileHeader,
  ErrExtraRecordsAfterFileControl,
  ErrFileEntryOutsideBatch,
  ErrFileAddendaOutsideBatch,
  ErrFileAddendaOutsideEntry,
  ErrFileBatchControlOutsideBatch,
  ErrFileConsecutiveBatchHeaders,
  ErrBatchAddendaIndicator,
  ErrIATBatchAddendaIndicator,
  ErrUnknownRecordType,
  RecordWrongLengthErr,
  fieldError,
} from './errors/index.js';

// defaultMaxLines matches Go: 2 + 2_000_000 + 100_000_000 + 8
const defaultMaxLines = 102_002_010;

interface Validatable {
  validate(): Error | null;
}

function maybeValidate(rec: Validatable, opts?: ValidateOpts): Error | null {
  if (opts) {
    if (opts.skipAll) return null;
    if (opts.bypassBatchValidation) {
      // Only validate file-level records when bypass is set
      if (rec instanceof FileHeader || rec instanceof FileControl || rec instanceof ADVFileControl) {
        return rec.validate();
      }
      return null;
    }
  }
  return rec.validate();
}

function blankLine(line: string): boolean {
  return line.trim().length === 0;
}

function readRunes(start: number, length: number, input: string): string {
  const runes = [...input];
  return runes.slice(start, start + length).join('');
}

function trimSpacesFromLongLine(s: string): string {
  // Get first 94 runes, trim trailing spaces
  const runes = [...s];
  return runes.slice(0, RecordLength).join('').replace(/ +$/, '');
}

function rightPadShortLine(s: string): [string, Error | null] {
  if (s.length > RecordLength) {
    return [s, new RecordWrongLengthErr(s.length)];
  }
  return [s + ' '.repeat(RecordLength - s.length), null];
}

export class Reader {
  file: File;
  iatCurrentBatch: IATBatch;

  /** @internal */ line = '';
  /** @internal */ currentBatch: Batcher | null = null;
  /** @internal */ lineNum = 0;
  private maxLines: number;
  private recordName = '';
  private _errors: Error[] = [];
  /** @internal */ skipBatchAccumulation = false;

  constructor(input: string) {
    this.file = newFile();
    this.iatCurrentBatch = new IATBatch();
    this.maxLines = defaultMaxLines;
    this._input = input;
  }

  private _input: string;

  private parseError(err: Error | null): Error | null {
    if (!err) return null;
    if (err instanceof ParseError) return err;
    return new ParseError(this.lineNum, this.recordName, err);
  }

  setValidation(opts: ValidateOpts): void {
    this.file.setValidation(opts);
  }

  setMaxLines(max: number): void {
    this.maxLines = max;
  }

  read(): File {
    this.lineNum = 0;

    // Process rune-by-rune to match Go behavior
    const runes = [...this._input];
    let currentLine = '';
    let currentLineRuneCount = 0;

    for (const char of runes) {
      if (char === '\n' || char === '\r') {
        if (currentLineRuneCount > 0) {
          this.lineNum++;
          if (this.lineNum > this.maxLines) {
            this._errors.push(ErrFileTooLong);
            return this.returnFile();
          }
          if (!blankLine(currentLine)) {
            const err = this.readLine(currentLine);
            if (err) this._errors.push(err);
          }
          currentLine = '';
          currentLineRuneCount = 0;
        }
        continue;
      }

      currentLineRuneCount++;
      currentLine += char;

      if (currentLineRuneCount < RecordLength) {
        continue;
      }

      // We have a full line to parse
      this.lineNum++;
      if (this.lineNum > this.maxLines) {
        this._errors.push(ErrFileTooLong);
        return this.returnFile();
      }
      if (!blankLine(currentLine)) {
        const err = this.readLine(currentLine);
        if (err) this._errors.push(err);
      }
      currentLine = '';
      currentLineRuneCount = 0;
    }

    // Flush anything left over
    if (currentLineRuneCount > 0) {
      this.lineNum++;
      const err = this.readLine(currentLine);
      if (err) this._errors.push(err);
    }

    // Add a lingering Batch if there was no BatchControl record
    if (this.currentBatch !== null) {
      if (!this.skipBatchAccumulation) {
        this.file.addBatch(this.currentBatch);
      }
      this.currentBatch = null;
    }

    // Check for required FileHeader
    const emptyHeader = newFileHeader();
    emptyHeader.lineNumber = this.file.header.lineNumber;
    if (this.file.validateOpts) {
      emptyHeader.setValidation(this.file.validateOpts);
    }
    if (this.isEmptyFileHeader()) {
      if (!this.file.validateOpts?.allowMissingFileHeader) {
        this.recordName = 'FileHeader';
        this._errors.push(ErrFileHeader);
      }
    }

    // Remove trailing spaces from file control reserved unless PreserveSpaces is set
    if (!this.file.validateOpts?.preserveSpaces) {
      this.file.control.reserved = this.file.control.reserved.trim();
    }

    // Check for required FileControl
    if (!this.file.isADV()) {
      if (!this.file.validateOpts?.allowMissingFileControl) {
        if (this.isEmptyFileControl()) {
          this.recordName = 'FileControl';
          this._errors.push(ErrFileControl);
        }
      }
    } else {
      if (!this.file.validateOpts?.allowMissingFileControl) {
        if (this.isEmptyADVFileControl()) {
          this.recordName = 'FileControl';
          this._errors.push(ErrFileControl);
        }
      }
    }

    return this.returnFile();
  }

  private returnFile(): File {
    if (this._errors.length > 0) {
      // Collect all errors into a single error. Attach to file for inspection.
      const combined = new ACHError(this._errors.map(e => e.message).join('\n'));
      (combined as any).errors = this._errors;
      throw combined;
    }
    return this.file;
  }

  private isEmptyFileHeader(): boolean {
    const h = this.file.header;
    // Check if header is essentially empty (only lineNumber and validateOpts may differ)
    return !h.immediateDestination && !h.immediateOrigin &&
      !h.fileCreationDate && !h.immediateDestinationName && !h.immediateOriginName;
  }

  private isEmptyFileControl(): boolean {
    const c = this.file.control;
    return c.batchCount === 0 && c.blockCount === 0 && c.entryAddendaCount === 0 &&
      c.entryHash === 0 && c.totalDebitEntryDollarAmountInFile === 0 &&
      c.totalCreditEntryDollarAmountInFile === 0;
  }

  private isEmptyADVFileControl(): boolean {
    const c = this.file.advControl;
    return c.batchCount === 0 && c.entryAddendaCount === 0 && c.entryHash === 0;
  }

  /** @internal */ readLine(line: string): Error | null {
    const runeLen = [...line].length;

    if (this.lineNum === 1 && runeLen > RecordLength) {
      const extraChars = runeLen % RecordLength;
      if (extraChars !== 0) {
        return this.parseError(
          new ACHError(`${extraChars} extra character(s) in ACH file: must be ${runeLen - extraChars} but found ${runeLen}`)
        );
      }
      return this.processFixedWidthFile(line);
    }

    if (runeLen !== RecordLength) {
      if (runeLen > RecordLength) {
        line = trimSpacesFromLongLine(line);
      }
      const [padded, err] = rightPadShortLine(line);
      if (err) {
        return this.parseError(err);
      }
      this.line = padded;
      const parseErr = this.parseLine();
      if (parseErr) {
        this._errors.push(this.parseError(new RecordWrongLengthErr(runeLen))!);
        return parseErr;
      }
      return null;
    }

    this.line = line;
    return this.parseLine();
  }

  private processFixedWidthFile(line: string): Error | null {
    const runes = [...line];
    let record = '';
    for (let i = 0; i < runes.length; i++) {
      record += runes[i];
      if ((i + 1) % RecordLength === 0) {
        this.line = record;
        const err = this.parseLine();
        if (err) return err;
        record = '';
      }
    }
    return null;
  }

  private parseLine(): Error | null {
    // Break once we encounter padding records
    if (this.line.substring(0, 2) === '99') {
      return null;
    }

    // Reject everything after a FileControl is found
    if (this.file.control.lineNumber > 0) {
      return this.parseError(ErrExtraRecordsAfterFileControl);
    }

    switch (this.line[0]) {
      case fileHeaderPos:
        return this.parseFileHeader();
      case batchHeaderPos: {
        // Handle files with (BH, ED, ED...) without BatchControls
        if (this.currentBatch !== null) {
          if (this.currentBatch.getEntries().length === 0 && this.currentBatch.getADVEntries().length === 0) {
            return this.parseError(ErrFileConsecutiveBatchHeaders);
          }
          const batch = this.currentBatch;
          this.currentBatch = null;
          batch.setValidation(this.file.validateOpts);
          if (!this.skipBatchAccumulation) {
            this.file.addBatch(batch);
          }
        }
        return this.parseBH();
      }
      case entryDetailPos:
        return this.parseED();
      case entryAddendaPos:
        return this.parseEDAddenda();
      case batchControlPos: {
        const err = this.parseBatchControl();
        if (err) return err;

        if (this.currentBatch !== null) {
          const batch = this.currentBatch;
          this.currentBatch = null;
          batch.setValidation(this.file.validateOpts);
          if (!this.skipBatchAccumulation) {
            this.file.addBatch(batch);
          }
          const vErr = maybeValidate(batch as unknown as Validatable, this.file.validateOpts);
          if (vErr) {
            this.recordName = 'Batches';
            return this.parseError(vErr);
          }
        } else {
          const batch = this.iatCurrentBatch;
          this.iatCurrentBatch = new IATBatch();
          batch.setValidation(this.file.validateOpts!);
          if (!this.skipBatchAccumulation) {
            this.file.addIATBatch(batch);
          }
          const vErr = maybeValidate(batch, this.file.validateOpts);
          if (vErr) {
            this.recordName = 'Batches';
            return this.parseError(vErr);
          }
        }
        return null;
      }
      case fileControlPos:
        return this.parseFileControl();
      default:
        return new ErrUnknownRecordType(this.line[0]);
    }
  }

  private parseBH(): Error | null {
    if (this.line.substring(50, 53) === IAT || this.line.substring(4, 20).trim() === IATCOR) {
      return this.parseIATBatchHeader();
    }
    return this.parseBatchHeader();
  }

  private parseED(): Error | null {
    if (this.iatCurrentBatch.header && this.iatCurrentBatch.header.serviceClassCode > 0) {
      return this.parseIATEntryDetail();
    }
    return this.parseEntryDetail();
  }

  /** @internal */ parseEDAddenda(): Error | null {
    if (this.currentBatch !== null && this.currentBatch.getHeader().companyName !== IATCOR) {
      return this.parseAddenda();
    }
    return this.parseIATAddenda();
  }

  // --- Record parsers ---

  private parseFileHeader(): Error | null {
    if (this.currentBatch !== null || this.file.batches.length > 0 || this.file.iatBatches.length > 0) {
      return this.parseError(ErrMisplacedFileHeader);
    }

    this.recordName = 'FileHeader';
    if (!this.isEmptyFileHeader()) {
      return this.parseError(ErrFileHeader);
    }

    this.file.header.parse(this.line);
    this.file.header.lineNumber = this.lineNum;

    const err = maybeValidate(this.file.header, this.file.validateOpts);
    if (err) return this.parseError(err);
    return null;
  }

  private parseBatchHeader(): Error | null {
    this.recordName = 'BatchHeader';

    const bh = newBatchHeader();
    bh.setValidation(this.file.validateOpts);
    bh.parse(this.line);
    bh.lineNumber = this.lineNum;

    const vErr = maybeValidate(bh, this.file.validateOpts);
    if (vErr) return this.parseError(vErr);

    const [batch, err] = newBatch(bh);
    if (err) return this.parseError(err);

    this.currentBatch = batch!;
    return null;
  }

  private parseEntryDetail(): Error | null {
    this.recordName = 'EntryDetail';

    if (this.currentBatch === null) {
      return this.parseError(ErrFileEntryOutsideBatch);
    }

    if (this.currentBatch.getHeader().standardEntryClassCode !== ADV) {
      const ed = newEntryDetail();
      ed.setSECCode(this.currentBatch.getHeader().standardEntryClassCode);
      ed.setValidation(this.file.validateOpts);
      ed.parse(this.line);
      ed.lineNumber = this.lineNum;
      const err = maybeValidate(ed, this.file.validateOpts);
      if (err) return this.parseError(err);
      this.currentBatch.addEntry(ed);
    } else {
      const ed = newADVEntryDetail();
      ed.validateOpts = this.file.validateOpts;
      ed.parse(this.line);
      ed.lineNumber = this.lineNum;
      const err = maybeValidate(ed, this.file.validateOpts);
      if (err) return this.parseError(err);
      this.currentBatch.addADVEntry(ed);
    }
    return null;
  }

  private parseAddenda(): Error | null {
    this.recordName = 'Addenda';

    if (this.currentBatch === null) {
      return this.parseError(ErrFileAddendaOutsideBatch);
    }

    if (this.currentBatch.getHeader().standardEntryClassCode !== ADV) {
      const entries = this.currentBatch.getEntries();
      if (entries.length === 0) {
        return this.parseError(ErrFileAddendaOutsideEntry);
      }
      const entryIndex = entries.length - 1;
      const entry = entries[entryIndex];

      if (entry.addendaRecordIndicator === 1) {
        const typeCode = this.line.substring(1, 3);

        switch (typeCode) {
          case '02': {
            const addenda02 = newAddenda02();
            addenda02.setValidation(this.file.validateOpts);
            addenda02.parse(this.line);
            addenda02.lineNumber = this.lineNum;
            const err = maybeValidate(addenda02, this.file.validateOpts);
            if (err) return this.parseError(err);
            entries[entryIndex].addenda02 = addenda02;
            break;
          }
          case '05': {
            const addenda05 = newAddenda05();
            addenda05.setValidation(this.file.validateOpts);
            addenda05.parse(this.line);
            addenda05.lineNumber = this.lineNum;
            const err = maybeValidate(addenda05, this.file.validateOpts);
            if (err) return this.parseError(err);
            entries[entryIndex].addAddenda05(addenda05);
            break;
          }
          case '98': {
            if (isRefusedChangeCode(this.line.substring(3, 6))) {
              const addenda98Refused = newAddenda98Refused();
              addenda98Refused.parse(this.line);
              addenda98Refused.lineNumber = this.lineNum;
              const err = maybeValidate(addenda98Refused, this.file.validateOpts);
              if (err) return this.parseError(err);
              entries[entryIndex].category = CategoryNOC;
              entries[entryIndex].addenda98Refused = addenda98Refused;
            } else {
              const addenda98 = newAddenda98();
              addenda98.parse(this.line);
              addenda98.lineNumber = this.lineNum;
              const err = maybeValidate(addenda98, this.file.validateOpts);
              if (err) return this.parseError(err);
              entries[entryIndex].category = CategoryNOC;
              entries[entryIndex].addenda98 = addenda98;
            }
            break;
          }
          case '99': {
            if (isDishonoredReturnCode(this.line.substring(3, 6))) {
              const addenda99Dishonored = newAddenda99Dishonored();
              addenda99Dishonored.parse(this.line);
              addenda99Dishonored.lineNumber = this.lineNum;
              addenda99Dishonored.setValidation(this.file.validateOpts);
              const err = maybeValidate(addenda99Dishonored, this.file.validateOpts);
              if (err) return this.parseError(err);
              entries[entryIndex].addenda99Dishonored = addenda99Dishonored;
              entries[entryIndex].category = CategoryDishonoredReturn;
            } else if (isContestedReturnCode(this.line.substring(3, 6))) {
              const addenda99Contested = newAddenda99Contested();
              addenda99Contested.parse(this.line);
              addenda99Contested.lineNumber = this.lineNum;
              addenda99Contested.setValidation(this.file.validateOpts);
              const err = maybeValidate(addenda99Contested, this.file.validateOpts);
              if (err) return this.parseError(err);
              entries[entryIndex].addenda99Contested = addenda99Contested;
              entries[entryIndex].category = CategoryDishonoredReturnContested;
            } else {
              const addenda99 = newAddenda99();
              addenda99.parse(this.line);
              addenda99.lineNumber = this.lineNum;
              addenda99.setValidation(this.file.validateOpts);
              const err = maybeValidate(addenda99, this.file.validateOpts);
              if (err) return this.parseError(err);
              entries[entryIndex].addenda99 = addenda99;
              entries[entryIndex].category = CategoryReturn;
            }
            break;
          }
        }
      } else {
        return this.parseError(this.currentBatch.batchError('AddendaRecordIndicator', ErrBatchAddendaIndicator));
      }
    } else {
      return this.parseADVAddenda();
    }
    return null;
  }

  private parseADVAddenda(): Error | null {
    if (this.currentBatch === null) {
      return this.parseError(ErrFileAddendaOutsideBatch);
    }
    const advEntries = this.currentBatch.getADVEntries();
    if (advEntries.length === 0) {
      return this.parseError(ErrFileAddendaOutsideEntry);
    }
    const entryIndex = advEntries.length - 1;
    const entry = advEntries[entryIndex];

    if (entry.addendaRecordIndicator !== 1) {
      return this.parseError(this.currentBatch.batchError('AddendaRecordIndicator', ErrBatchAddendaIndicator));
    }

    const addenda99 = newAddenda99();
    addenda99.parse(this.line);
    addenda99.lineNumber = this.lineNum;
    const err = maybeValidate(addenda99, this.file.validateOpts);
    if (err) return this.parseError(err);

    advEntries[entryIndex].category = CategoryReturn;
    advEntries[entryIndex].addenda99 = addenda99;
    return null;
  }

  private parseBatchControl(): Error | null {
    this.recordName = 'BatchControl';

    if (this.currentBatch === null && this.iatCurrentBatch.entries.length === 0) {
      return this.parseError(ErrFileBatchControlOutsideBatch);
    }

    if (this.currentBatch !== null) {
      if (this.currentBatch.getHeader().standardEntryClassCode === ADV) {
        this.currentBatch.getADVControl().parse(this.line);
        this.currentBatch.getADVControl().lineNumber = this.lineNum;
        const err = maybeValidate(this.currentBatch.getADVControl(), this.file.validateOpts);
        if (err) return this.parseError(err);
      } else {
        this.currentBatch.getControl().setValidation(this.file.validateOpts);
        this.currentBatch.getControl().parse(this.line);
        this.currentBatch.getControl().lineNumber = this.lineNum;
        const err = maybeValidate(this.currentBatch.getControl(), this.file.validateOpts);
        if (err) return this.parseError(err);
      }
    } else {
      this.iatCurrentBatch.control.parse(this.line);
      this.iatCurrentBatch.control.lineNumber = this.lineNum;
      const err = maybeValidate(this.iatCurrentBatch.control, this.file.validateOpts);
      if (err) return this.parseError(err);
    }
    return null;
  }

  private parseFileControl(): Error | null {
    this.recordName = 'FileControl';

    if (!this.file.isADV()) {
      if (this.file.control.lineNumber > 0) {
        return this.parseError(ErrFileControl);
      }
      this.file.control.parse(this.line);
      this.file.control.lineNumber = this.lineNum;
      const err = maybeValidate(this.file.control, this.file.validateOpts);
      if (err) return this.parseError(err);
    } else {
      if (this.file.advControl.lineNumber > 0) {
        return this.parseError(ErrFileControl);
      }
      this.file.advControl.parse(this.line);
      this.file.advControl.lineNumber = this.lineNum;
      const err = maybeValidate(this.file.advControl, this.file.validateOpts);
      if (err) return this.parseError(err);
    }
    return null;
  }

  // --- IAT parsers ---

  private parseIATBatchHeader(): Error | null {
    this.recordName = 'BatchHeader';

    const bh = IATBatchHeader.newIATBatchHeader();
    bh.validateOpts = this.file.validateOpts;
    bh.parse(this.line);
    bh.lineNumber = this.lineNum;

    const err = maybeValidate(bh, this.file.validateOpts);
    if (err) return this.parseError(err);

    const iatBatch = new IATBatch(bh);
    this.iatCurrentBatch = iatBatch;
    return null;
  }

  private parseIATEntryDetail(): Error | null {
    this.recordName = 'EntryDetail';

    if (!this.iatCurrentBatch.header || this.iatCurrentBatch.header.serviceClassCode === 0) {
      return this.parseError(ErrFileEntryOutsideBatch);
    }

    const ed = new IATEntryDetail();
    ed.parse(this.line);
    ed.lineNumber = this.lineNum;
    const err = maybeValidate(ed, this.file.validateOpts);
    if (err) return this.parseError(err);
    this.iatCurrentBatch.addEntry(ed);
    return null;
  }

  private parseIATAddenda(): Error | null {
    this.recordName = 'Addenda';

    if (this.iatCurrentBatch.entries.length === 0) {
      return this.parseError(ErrFileAddendaOutsideEntry);
    }

    const entryIndex = this.iatCurrentBatch.entries.length - 1;
    const entry = this.iatCurrentBatch.entries[entryIndex];

    if (entry.addendaRecordIndicator === 1) {
      const err = this.switchIATAddenda(entryIndex);
      if (err) return this.parseError(err);
    } else {
      return this.parseError(fieldError('AddendaRecordIndicator', ErrIATBatchAddendaIndicator)!);
    }
    return null;
  }

  private switchIATAddenda(entryIndex: number): Error | null {
    const typeCode = this.line.substring(1, 3);

    switch (typeCode) {
      case '10': case '11': case '12': case '13': case '14':
      case '15': case '16': case '17': case '18':
        return this.mandatoryOptionalIATAddenda(entryIndex);
      case '98':
        return this.nocIATAddenda(entryIndex);
      case '99':
        return this.returnIATAddenda(entryIndex);
    }
    return null;
  }

  private mandatoryOptionalIATAddenda(entryIndex: number): Error | null {
    const typeCode = this.line.substring(1, 3);

    switch (typeCode) {
      case '10': {
        const a = newAddenda10();
        a.setValidation(this.file.validateOpts);
        a.parse(this.line);
        a.lineNumber = this.lineNum;
        const err = maybeValidate(a, this.file.validateOpts);
        if (err) return err;
        this.iatCurrentBatch.entries[entryIndex].addenda10 = a;
        break;
      }
      case '11': {
        const a = newAddenda11();
        a.setValidation(this.file.validateOpts);
        a.parse(this.line);
        a.lineNumber = this.lineNum;
        const err = maybeValidate(a, this.file.validateOpts);
        if (err) return err;
        this.iatCurrentBatch.entries[entryIndex].addenda11 = a;
        break;
      }
      case '12': {
        const a = newAddenda12();
        a.setValidation(this.file.validateOpts);
        a.parse(this.line);
        a.lineNumber = this.lineNum;
        const err = maybeValidate(a, this.file.validateOpts);
        if (err) return err;
        this.iatCurrentBatch.entries[entryIndex].addenda12 = a;
        break;
      }
      case '13': {
        const a = newAddenda13();
        a.setValidation(this.file.validateOpts);
        a.parse(this.line);
        a.lineNumber = this.lineNum;
        const err = maybeValidate(a, this.file.validateOpts);
        if (err) return err;
        this.iatCurrentBatch.entries[entryIndex].addenda13 = a;
        break;
      }
      case '14': {
        const a = newAddenda14();
        a.setValidation(this.file.validateOpts);
        a.parse(this.line);
        a.lineNumber = this.lineNum;
        const err = maybeValidate(a, this.file.validateOpts);
        if (err) return err;
        this.iatCurrentBatch.entries[entryIndex].addenda14 = a;
        break;
      }
      case '15': {
        const a = newAddenda15();
        a.setValidation(this.file.validateOpts);
        a.parse(this.line);
        a.lineNumber = this.lineNum;
        const err = maybeValidate(a, this.file.validateOpts);
        if (err) return err;
        this.iatCurrentBatch.entries[entryIndex].addenda15 = a;
        break;
      }
      case '16': {
        const a = newAddenda16();
        a.setValidation(this.file.validateOpts);
        a.parse(this.line);
        a.lineNumber = this.lineNum;
        const err = maybeValidate(a, this.file.validateOpts);
        if (err) return err;
        this.iatCurrentBatch.entries[entryIndex].addenda16 = a;
        break;
      }
      case '17': {
        const a = newAddenda17();
        a.setValidation(this.file.validateOpts);
        a.parse(this.line);
        a.lineNumber = this.lineNum;
        const err = maybeValidate(a, this.file.validateOpts);
        if (err) return err;
        this.iatCurrentBatch.entries[entryIndex].addenda17.push(a);
        break;
      }
      case '18': {
        const a = newAddenda18();
        a.setValidation(this.file.validateOpts);
        a.parse(this.line);
        a.lineNumber = this.lineNum;
        const err = maybeValidate(a, this.file.validateOpts);
        if (err) return err;
        this.iatCurrentBatch.entries[entryIndex].addenda18.push(a);
        break;
      }
    }
    return null;
  }

  private nocIATAddenda(entryIndex: number): Error | null {
    const addenda98 = newAddenda98();
    addenda98.parse(this.line);
    addenda98.lineNumber = this.lineNum;
    const err = maybeValidate(addenda98, this.file.validateOpts);
    if (err) return err;
    this.iatCurrentBatch.entries[entryIndex].addenda98 = addenda98;
    this.iatCurrentBatch.entries[entryIndex].category = CategoryNOC;
    return null;
  }

  private returnIATAddenda(entryIndex: number): Error | null {
    const addenda99 = newAddenda99();
    addenda99.parse(this.line);
    addenda99.lineNumber = this.lineNum;
    const err = maybeValidate(addenda99, this.file.validateOpts);
    if (err) return err;
    this.iatCurrentBatch.entries[entryIndex].addenda99 = addenda99;
    this.iatCurrentBatch.entries[entryIndex].category = CategoryReturn;
    return null;
  }
}

export { readRunes };

export function readACHFile(input: string): File {
  const r = new Reader(input);
  return r.read();
}

export function readACHFiles(inputs: string[]): File[] {
  return inputs.map(input => readACHFile(input));
}
