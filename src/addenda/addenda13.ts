import { entryAddendaPos } from '../constants.js';
import { enrichErrors, enrichError, addenda13FieldPositions } from '../fieldPositions.js';
import type { ValidateOpts } from '../validateOpts.js';
import { Converters, converters } from '../utils/converters.js';
import { Validators, validators } from '../utils/validators.js';
import {
  fieldError,
  ErrConstructor,
  ErrAddendaTypeCode,
  ErrIDNumberQualifier,
} from '../errors/index.js';

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
  validateOpts?: ValidateOpts;

  parse(record: string): void {
    const runes = [...record];
    if (runes.length !== 94) return;

    this.typeCode = runes.slice(1, 3).join('');
    this.odfiName = runes.slice(3, 38).join('').trim();
    this.odfiIDNumberQualifier = runes.slice(38, 40).join('').trim();
    this.odfiIdentification = converters.parseStringField(runes.slice(40, 74).join(''));
    this.odfiBranchCountryCode = runes.slice(74, 77).join('').trim();
    // 78-87 Reserved
    this.entryDetailSequenceNumber = converters.parseNumField(runes.slice(87, 94).join(''));
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
    const err = this._validate();
    if (err) enrichError(err, this.lineNumber, addenda13FieldPositions);
    return err;
  }

  private _validate(): Error | null {
    const inclErr = this.fieldInclusion();
    if (inclErr) return inclErr;

    if (this.typeCode !== '13') return fieldError('TypeCode', ErrAddendaTypeCode, this.typeCode);

    if (validators.isIDNumberQualifier(this.odfiIDNumberQualifier)) {
      return fieldError('ODFIIDNumberQualifier', ErrIDNumberQualifier, this.odfiIDNumberQualifier);
    }

    if (!this.validateOpts?.allowSpecialCharacters) {
      const nameErr = validators.isAlphanumeric(this.odfiName);
      if (nameErr) return fieldError('ODFIName', nameErr, this.odfiName);
      const idErr = validators.isAlphanumeric(this.odfiIdentification);
      if (idErr) return fieldError('ODFIIdentification', idErr, this.odfiIdentification);
      const ccErr = validators.isAlphanumeric(this.odfiBranchCountryCode);
      if (ccErr) return fieldError('ODFIBranchCountryCode', ccErr, this.odfiBranchCountryCode);
    }
    return null;
  }

  /** ValidateAll performs all NACHA format rule checks and returns all errors found */
  validateAll(): Error[] {
    const errors: Error[] = [];
    const push = (err: Error | null | undefined) => { if (err) errors.push(err); };

    if (this.typeCode === '') push(fieldError('TypeCode', ErrConstructor, this.typeCode));
    if (this.odfiName === '') push(fieldError('ODFIName', ErrConstructor, this.odfiName));
    if (this.odfiIDNumberQualifier === '') push(fieldError('ODFIIDNumberQualifier', ErrConstructor, this.odfiIDNumberQualifier));
    if (this.odfiIdentification === '') push(fieldError('ODFIIdentification', ErrConstructor, this.odfiIdentification));
    if (this.odfiBranchCountryCode === '') push(fieldError('ODFIBranchCountryCode', ErrConstructor, this.odfiBranchCountryCode));
    if (this.entryDetailSequenceNumber < 0) push(fieldError('EntryDetailSequenceNumber', ErrConstructor, this.entryDetailSequenceNumberField()));

    if (this.typeCode !== '13') push(fieldError('TypeCode', ErrAddendaTypeCode, this.typeCode));
    if (validators.isIDNumberQualifier(this.odfiIDNumberQualifier)) {
      push(fieldError('ODFIIDNumberQualifier', ErrIDNumberQualifier, this.odfiIDNumberQualifier));
    }
    if (!this.validateOpts?.allowSpecialCharacters) {
      push(fieldError('ODFIName', validators.isAlphanumeric(this.odfiName), this.odfiName));
      push(fieldError('ODFIIdentification', validators.isAlphanumeric(this.odfiIdentification), this.odfiIdentification));
      push(fieldError('ODFIBranchCountryCode', validators.isAlphanumeric(this.odfiBranchCountryCode), this.odfiBranchCountryCode));
    }

    return enrichErrors(errors, this.lineNumber, addenda13FieldPositions);
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

  odfiNameField(): string { return converters.alphaField(this.odfiName, 35); }
  odfiIDNumberQualifierField(): string { return converters.alphaField(this.odfiIDNumberQualifier, 2); }
  odfiIdentificationField(): string { return converters.alphaField(this.odfiIdentification, 34); }
  odfiBranchCountryCodeField(): string { return converters.alphaField(this.odfiBranchCountryCode, 3); }
  entryDetailSequenceNumberField(): string { return converters.numericField(this.entryDetailSequenceNumber, 7); }
}

export function newAddenda13(): Addenda13 { return new Addenda13(); }
