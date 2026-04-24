import { entryAddendaPos } from './constants.js';
import type { ValidateOpts } from './validateOpts.js';
import { Converters } from './utils/converters.js';
import { Validators } from './utils/validators.js';
import {
  fieldError,
  ErrConstructor,
  ErrAddendaTypeCode,
  ErrIDNumberQualifier,
} from './errors/index.js';

/**
 * Addenda13 is an IAT addenda record providing ODFI information
 * (name, ID qualifier, identification, branch country code).
 */
export class Addenda13 {
  id = '';
  typeCode = '13';
  odfiName = '';
  odfiIDNumberQualifier = '';
  odfiIdentification = '';
  odfiBranchCountryCode = '';
  entryDetailSequenceNumber = 0;
  lineNumber = 0;

  private converters = new Converters();
  private validators = new Validators();
  validateOpts?: ValidateOpts;

  parse(record: string): void {
    const runes = [...record];
    if (runes.length !== 94) return;

    this.typeCode = runes.slice(1, 3).join('');
    this.odfiName = runes.slice(3, 38).join('').trim();
    this.odfiIDNumberQualifier = runes.slice(38, 40).join('').trim();
    this.odfiIdentification = this.converters.parseStringField(runes.slice(40, 74).join(''));
    this.odfiBranchCountryCode = runes.slice(74, 77).join('').trim();
    // 78-87 Reserved
    this.entryDetailSequenceNumber = this.converters.parseNumField(runes.slice(87, 94).join(''));
  }

  setValidation(opts: ValidateOpts | undefined): void { this.validateOpts = opts; }

  string(): string {
    return (
      entryAddendaPos +
      this.typeCode +
      this.odfiNameField() +
      this.odfiIDNumberQualifierField() +
      this.odfiIdentificationField() +
      this.odfiBranchCountryCodeField() +
      '          ' +
      this.entryDetailSequenceNumberField()
    );
  }

  validate(): Error | null {
    const inclErr = this.fieldInclusion();
    if (inclErr) return inclErr;

    if (this.typeCode !== '13') return fieldError('TypeCode', ErrAddendaTypeCode, this.typeCode);

    if (this.validators.isIDNumberQualifier(this.odfiIDNumberQualifier)) {
      return fieldError('ODFIIDNumberQualifier', ErrIDNumberQualifier, this.odfiIDNumberQualifier);
    }

    if (!this.validateOpts?.allowSpecialCharacters) {
      const nameErr = this.validators.isAlphanumeric(this.odfiName);
      if (nameErr) return fieldError('ODFIName', nameErr, this.odfiName);
      const idErr = this.validators.isAlphanumeric(this.odfiIdentification);
      if (idErr) return fieldError('ODFIIdentification', idErr, this.odfiIdentification);
      const ccErr = this.validators.isAlphanumeric(this.odfiBranchCountryCode);
      if (ccErr) return fieldError('ODFIBranchCountryCode', ccErr, this.odfiBranchCountryCode);
    }
    return null;
  }

  private fieldInclusion(): Error | null {
    if (this.typeCode === '') return fieldError('TypeCode', ErrConstructor, this.typeCode);
    if (this.odfiName === '') return fieldError('ODFIName', ErrConstructor, this.odfiName);
    if (this.odfiIDNumberQualifier === '') return fieldError('ODFIIDNumberQualifier', ErrConstructor, this.odfiIDNumberQualifier);
    if (this.odfiIdentification === '') return fieldError('ODFIIdentification', ErrConstructor, this.odfiIdentification);
    if (this.odfiBranchCountryCode === '') return fieldError('ODFIBranchCountryCode', ErrConstructor, this.odfiBranchCountryCode);
    if (this.entryDetailSequenceNumber < 0) return fieldError('EntryDetailSequenceNumber', ErrConstructor, this.entryDetailSequenceNumberField());
    return null;
  }

  odfiNameField(): string { return this.converters.alphaField(this.odfiName, 35); }
  odfiIDNumberQualifierField(): string { return this.converters.alphaField(this.odfiIDNumberQualifier, 2); }
  odfiIdentificationField(): string { return this.converters.alphaField(this.odfiIdentification, 34); }
  odfiBranchCountryCodeField(): string { return this.converters.alphaField(this.odfiBranchCountryCode, 3); }
  entryDetailSequenceNumberField(): string { return this.converters.numericField(this.entryDetailSequenceNumber, 7); }
}

export function newAddenda13(): Addenda13 { return new Addenda13(); }
