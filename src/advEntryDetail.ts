import { entryDetailPos, CategoryForward } from './constants.js';
import { enrichErrors, advEntryDetailFieldPositions } from './fieldPositions.js';
import type { ValidateOpts } from './validateOpts.js';
import { Converters } from './utils/converters.js';
import { Validators, CalculateCheckDigit } from './utils/validators.js';
import {
  fieldError,
  ErrConstructor,
  ErrFieldRequired,
  ErrValidCheckDigit,
} from './errors/index.js';

/**
 * ADVEntryDetail contains the actual transaction data for an individual ADV entry.
 * Transaction codes represent accounting entries (81-88).
 */
export class ADVEntryDetail {
  id = '';
  transactionCode = 0;
  rdfiIdentification = '';
  checkDigit = '';
  dfiAccountNumber = '';
  amount = 0;
  adviceRoutingNumber = '';
  fileIdentification = '';
  achOperatorData = '';
  individualName = '';
  discretionaryData = '';
  addendaRecordIndicator = 0;
  achOperatorRoutingNumber = '';
  julianDay = 0;
  sequenceNumber = 0;
  category: string = CategoryForward;
  lineNumber = 0;

  /** Addenda99 for use with Returns */
  addenda99: import('./addenda99.js').Addenda99 | null = null;

  private converters = new Converters();
  private validators = new Validators();
  validateOpts?: ValidateOpts;

  parse(record: string): void {
    const runes = [...record];
    if (runes.length !== 94) return;

    // 1-1 Always "6"
    // 2-3 TransactionCode
    this.transactionCode = this.converters.parseNumField(runes.slice(1, 3).join(''));
    // 4-11 RDFIIdentification
    this.rdfiIdentification = this.converters.parseStringField(runes.slice(3, 11).join(''));
    // 12-12 CheckDigit
    this.checkDigit = this.converters.parseStringField(runes.slice(11, 12).join(''));
    // 13-27 DFIAccountNumber
    this.dfiAccountNumber = runes.slice(12, 27).join('');
    // 28-39 Amount
    this.amount = this.converters.parseNumField(runes.slice(27, 39).join(''));
    // 40-48 AdviceRoutingNumber
    this.adviceRoutingNumber = this.converters.parseStringField(runes.slice(39, 48).join(''));
    // 49-53 FileIdentification
    this.fileIdentification = this.converters.parseStringField(runes.slice(48, 53).join(''));
    // 54-54 ACHOperatorData
    this.achOperatorData = this.converters.parseStringField(runes.slice(53, 54).join(''));
    // 55-76 IndividualName
    this.individualName = runes.slice(54, 76).join('');
    // 77-78 DiscretionaryData
    this.discretionaryData = runes.slice(76, 78).join('');
    // 79-79 AddendaRecordIndicator
    this.addendaRecordIndicator = this.converters.parseNumField(runes.slice(78, 79).join(''));
    // 80-87 ACHOperatorRoutingNumber
    this.achOperatorRoutingNumber = this.converters.parseStringField(runes.slice(79, 87).join(''));
    // 88-90 JulianDay
    this.julianDay = this.converters.parseNumField(runes.slice(87, 90).join(''));
    // 91-94 SequenceNumber
    this.sequenceNumber = this.converters.parseNumField(runes.slice(90, 94).join(''));
  }

  setValidation(opts: ValidateOpts | undefined): void {
    this.validateOpts = opts;
  }

  string(): string {
    return (
      entryDetailPos +
      String(this.transactionCode) +
      this.rdfiIdentificationField() +
      this.checkDigit +
      this.dfiAccountNumberField() +
      this.amountField() +
      this.adviceRoutingNumberField() +
      this.fileIdentificationField() +
      this.achOperatorDataField() +
      this.individualNameField() +
      this.discretionaryDataField() +
      String(this.addendaRecordIndicator) +
      this.achOperatorRoutingNumberField() +
      this.julianDateDayField() +
      this.sequenceNumberField()
    );
  }

  validate(): Error | null {
    const inclErr = this.fieldInclusion();
    if (inclErr) return inclErr;

    if (this.validators.isTransactionCode(this.transactionCode)) {
      return fieldError('TransactionCode', new Error('invalid transaction code'), String(this.transactionCode));
    }

    if (!this.validateOpts?.allowSpecialCharacters) {
      for (const [name, val] of [
        ['DFIAccountNumber', this.dfiAccountNumber],
        ['AdviceRoutingNumber', this.adviceRoutingNumber],
        ['IndividualName', this.individualName],
        ['DiscretionaryData', this.discretionaryData],
        ['ACHOperatorRoutingNumber', this.achOperatorRoutingNumber],
      ] as const) {
        const err = this.validators.isAlphanumeric(val);
        if (err) return fieldError(name, err, val);
      }
    }

    const calculated = CalculateCheckDigit(this.rdfiIdentificationField());
    const edCheckDigit = parseInt(this.checkDigit, 10) || 0;
    if (calculated !== edCheckDigit) {
      return fieldError('RDFIIdentification', new ErrValidCheckDigit(calculated), this.checkDigit);
    }

    return null;
  }

  /** ValidateAll performs all NACHA format rule checks and returns all errors found */
  validateAll(): Error[] {
    const errors: Error[] = [];
    const push = (err: Error | null | undefined) => { if (err) errors.push(err); };

    // Field inclusion checks (inlined to collect all)
    if (this.transactionCode === 0) push(fieldError('TransactionCode', ErrConstructor, String(this.transactionCode)));
    if (this.rdfiIdentification === '') push(fieldError('RDFIIdentification', ErrConstructor, this.rdfiIdentificationField()));
    if (this.dfiAccountNumber === '') push(fieldError('DFIAccountNumber', ErrConstructor, this.dfiAccountNumber));
    if (this.adviceRoutingNumber === '') push(fieldError('AdviceRoutingNumber', ErrConstructor, this.adviceRoutingNumber));
    if (this.individualName === '') push(fieldError('IndividualName', ErrFieldRequired, this.individualName));
    if (this.achOperatorRoutingNumber === '') push(fieldError('ACHOperatorRoutingNumber', ErrConstructor, this.achOperatorRoutingNumber));
    if (this.julianDay <= 0) push(fieldError('JulianDay', ErrConstructor, String(this.julianDay)));
    if (this.sequenceNumber === 0) push(fieldError('SequenceNumber', ErrConstructor, String(this.sequenceNumber)));

    if (this.validators.isTransactionCode(this.transactionCode)) {
      push(fieldError('TransactionCode', new Error('invalid transaction code'), String(this.transactionCode)));
    }
    if (!this.validateOpts?.allowSpecialCharacters) {
      for (const [name, val] of [
        ['DFIAccountNumber', this.dfiAccountNumber],
        ['AdviceRoutingNumber', this.adviceRoutingNumber],
        ['IndividualName', this.individualName],
        ['DiscretionaryData', this.discretionaryData],
        ['ACHOperatorRoutingNumber', this.achOperatorRoutingNumber],
      ] as const) {
        push(fieldError(name, this.validators.isAlphanumeric(val), val));
      }
    }
    const calculated = CalculateCheckDigit(this.rdfiIdentificationField());
    const edCheckDigit = parseInt(this.checkDigit, 10) || 0;
    if (calculated !== edCheckDigit) {
      push(fieldError('RDFIIdentification', new ErrValidCheckDigit(calculated), this.checkDigit));
    }

    return enrichErrors(errors, this.lineNumber, advEntryDetailFieldPositions);
  }

  private fieldInclusion(): Error | null {
    if (this.transactionCode === 0) return fieldError('TransactionCode', ErrConstructor, String(this.transactionCode));
    if (this.rdfiIdentification === '') return fieldError('RDFIIdentification', ErrConstructor, this.rdfiIdentificationField());
    if (this.dfiAccountNumber === '') return fieldError('DFIAccountNumber', ErrConstructor, this.dfiAccountNumber);
    if (this.adviceRoutingNumber === '') return fieldError('AdviceRoutingNumber', ErrConstructor, this.adviceRoutingNumber);
    if (this.individualName === '') return fieldError('IndividualName', ErrFieldRequired, this.individualName);
    if (this.achOperatorRoutingNumber === '') return fieldError('ACHOperatorRoutingNumber', ErrConstructor, this.achOperatorRoutingNumber);
    if (this.julianDay <= 0) return fieldError('JulianDay', ErrConstructor, String(this.julianDay));
    if (this.sequenceNumber === 0) return fieldError('SequenceNumber', ErrConstructor, String(this.sequenceNumber));
    return null;
  }

  setRDFI(rdfi: string): this {
    const s = this.converters.stringField(rdfi, 9);
    this.rdfiIdentification = this.converters.parseStringField(s.substring(0, 8));
    this.checkDigit = this.converters.parseStringField(s.substring(8, 9));
    return this;
  }

  rdfiIdentificationField(): string { return this.converters.stringField(this.rdfiIdentification, 8); }
  dfiAccountNumberField(): string { return this.converters.alphaField(this.dfiAccountNumber, 15); }
  amountField(): string { return this.converters.numericField(this.amount, 12); }
  adviceRoutingNumberField(): string { return this.converters.stringField(this.adviceRoutingNumber, 9); }
  fileIdentificationField(): string { return this.converters.alphaField(this.fileIdentification, 5); }
  achOperatorDataField(): string { return this.converters.alphaField(this.achOperatorData, 1); }
  individualNameField(): string { return this.converters.alphaField(this.individualName, 22); }
  discretionaryDataField(): string { return this.converters.alphaField(this.discretionaryData, 2); }
  achOperatorRoutingNumberField(): string { return this.converters.alphaField(this.achOperatorRoutingNumber, 8); }
  julianDateDayField(): string { return this.converters.numericField(this.julianDay, 3); }
  sequenceNumberField(): string { return this.converters.numericField(this.sequenceNumber, 4); }
}

export function newADVEntryDetail(): ADVEntryDetail {
  return new ADVEntryDetail();
}
