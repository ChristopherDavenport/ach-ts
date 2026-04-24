// Ported from moov-io/ach entryDetail_test.go (core tests)
import { describe, it, expect } from 'vitest';
import { EntryDetail, newEntryDetail } from '../src/entryDetail';
import { CheckingCredit, CheckingDebit, SavingsCredit, CategoryForward, PPD } from '../src/constants';

function mockEntryDetail(): EntryDetail {
  const ed = newEntryDetail();
  ed.transactionCode = CheckingCredit;
  ed.setRDFI('121042882');
  ed.dfiAccountNumber = '123456789';
  ed.amount = 100000000; // $1,000,000.00
  ed.identificationNumber = 'Location #1234';
  ed.individualName = 'John Doe';
  ed.discretionaryData = 'S ';
  ed.addendaRecordIndicator = 0;
  ed.traceNumber = '121042880000001';
  ed.secCode = PPD;
  return ed;
}

describe('EntryDetail', () => {
  it('mock validates', () => {
    const ed = mockEntryDetail();
    expect(ed.validate()).toBeNull();
    expect(ed.category).toBe(CategoryForward);
  });

  describe('parse', () => {
    it('parses a known entry detail line', () => {
      // Generate a properly formatted 94-char line from the mock
      const mock = mockEntryDetail();
      const line = mock.string();
      expect([...line].length).toBe(94);

      const ed = newEntryDetail();
      ed.secCode = PPD;
      ed.parse(line);

      expect(ed.transactionCode).toBe(CheckingCredit);
      expect(ed.rdfiIdentification).toBe('12104288');
      expect(ed.checkDigit).toBe('2');
      expect(ed.amount).toBe(100000000);
      expect(ed.traceNumber).toBe('121042880000001');
    });

    it('round-trips string → parse → string', () => {
      const ed = mockEntryDetail();
      const str = ed.string();
      expect([...str].length).toBe(94);

      const ed2 = newEntryDetail();
      ed2.secCode = PPD;
      ed2.parse(str);
      expect(ed2.string()).toBe(str);
    });
  });

  describe('field formatting', () => {
    it('RDFIIdentificationField is 8 chars zero-padded', () => {
      const ed = mockEntryDetail();
      expect(ed.rdfiIdentificationField()).toBe('12104288');
    });

    it('DFIAccountNumberField is 17 chars space-padded', () => {
      const ed = mockEntryDetail();
      expect([...ed.dfiAccountNumberField()].length).toBe(17);
    });

    it('AmountField is 10 chars zero-padded', () => {
      const ed = mockEntryDetail();
      expect(ed.amountField()).toBe('0100000000');
    });

    it('TraceNumberField is 15 chars', () => {
      const ed = mockEntryDetail();
      expect([...ed.traceNumberField()].length).toBe(15);
    });
  });

  describe('SetRDFI', () => {
    it('splits routing number into RDFI and check digit', () => {
      const ed = newEntryDetail();
      ed.setRDFI('121042882');
      expect(ed.rdfiIdentification).toBe('12104288');
      expect(ed.checkDigit).toBe('2');
    });
  });

  describe('SetTraceNumber', () => {
    it('formats ODFI + sequence number', () => {
      const ed = newEntryDetail();
      ed.setTraceNumber('12104288', 1);
      expect(ed.traceNumber).toBe('121042880000001');
    });
  });

  describe('CreditOrDebit', () => {
    it('returns C for credit transaction codes', () => {
      const ed = newEntryDetail();
      ed.transactionCode = CheckingCredit;
      expect(ed.creditOrDebit()).toBe('C');
    });

    it('returns D for debit transaction codes', () => {
      const ed = newEntryDetail();
      ed.transactionCode = CheckingDebit;
      expect(ed.creditOrDebit()).toBe('D');
    });
  });

  describe('validation', () => {
    it('rejects zero TransactionCode', () => {
      const ed = mockEntryDetail();
      ed.transactionCode = 0;
      const err = ed.validate();
      expect(err).not.toBeNull();
      expect(err!.message).toContain('TransactionCode');
    });

    it('rejects negative amount', () => {
      const ed = mockEntryDetail();
      ed.amount = -100;
      const err = ed.validate();
      expect(err).not.toBeNull();
      expect(err!.message).toContain('Amount');
    });

    it('rejects amount exceeding limit', () => {
      const ed = mockEntryDetail();
      ed.amount = 99_999_999_999; // over 10 digits
      const err = ed.validate();
      expect(err).not.toBeNull();
    });

    it('rejects empty RDFIIdentification', () => {
      const ed = mockEntryDetail();
      ed.rdfiIdentification = '';
      const err = ed.validate();
      expect(err).not.toBeNull();
      expect(err!.message).toContain('RDFIIdentification');
    });

    it('rejects empty DFIAccountNumber', () => {
      const ed = mockEntryDetail();
      ed.dfiAccountNumber = '';
      const err = ed.validate();
      expect(err).not.toBeNull();
      expect(err!.message).toContain('DFIAccountNumber');
    });

    it('rejects empty IndividualName', () => {
      const ed = mockEntryDetail();
      ed.individualName = '';
      const err = ed.validate();
      expect(err).not.toBeNull();
      expect(err!.message).toContain('IndividualName');
    });

    it('rejects empty TraceNumber', () => {
      const ed = mockEntryDetail();
      ed.traceNumber = '';
      const err = ed.validate();
      expect(err).not.toBeNull();
      expect(err!.message).toContain('TraceNumber');
    });

    it('allows invalid check digit with option', () => {
      const ed = mockEntryDetail();
      ed.checkDigit = '9'; // wrong
      ed.setValidation({ allowInvalidCheckDigit: true });
      expect(ed.validate()).toBeNull();
    });
  });

  describe('addenda', () => {
    it('counts addenda records', () => {
      const ed = mockEntryDetail();
      expect(ed.addendaCount()).toBe(0);

      ed.addenda99 = { traceNumber: '', validate: () => null, string: () => '' };
      expect(ed.addendaCount()).toBe(1);
    });
  });

  describe('SEC-specific helpers', () => {
    it('POP serial number helpers', () => {
      const ed = newEntryDetail();
      ed.setPOPCheckSerialNumber('12345');
      ed.setPOPTerminalCity('ABCD');
      ed.setPOPTerminalState('CA');
      expect(ed.popCheckSerialNumberField()).toBe('12345');
      expect(ed.popTerminalCityField()).toBe('ABCD');
      expect(ed.popTerminalStateField()).toBe('CA');
    });

    it('PaymentType for WEB/TEL', () => {
      const ed = newEntryDetail();
      ed.setPaymentType('R');
      expect(ed.discretionaryData).toBe('R');

      ed.setPaymentType('anything');
      expect(ed.discretionaryData).toBe('S');
    });
  });
});
