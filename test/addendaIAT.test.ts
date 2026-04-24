import { describe, it, expect } from 'vitest';
import {
  Addenda10, Addenda11, Addenda12, Addenda13,
  Addenda14, Addenda15, Addenda16, Addenda17, Addenda18,
} from '../src/index.js';

// =========================================================================
// Addenda10 Tests
// =========================================================================
describe('Addenda10', () => {
  const mockRecord =
    '710ANN000000000000100000928383-23938          BEK Enterprises                          0000001';

  it('should parse a record string', () => {
    const a = new Addenda10();
    a.parse(mockRecord);

    expect(a.typeCode).toBe('10');
    expect(a.transactionTypeCode).toBe('ANN');
    expect(a.foreignPaymentAmount).toBe(100000);
    expect(a.foreignTraceNumber).toBe('928383-23938');
    expect(a.name).toBe('BEK Enterprises');
    expect(a.entryDetailSequenceNumber).toBe(1);
  });

  it('should round-trip parse and string', () => {
    const a = new Addenda10();
    a.parse(mockRecord);
    expect(a.string()).toBe(mockRecord);
  });

  it('should reject invalid TypeCode', () => {
    const a = new Addenda10();
    a.parse(mockRecord);
    a.typeCode = '65';
    const err = a.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('TypeCode');
  });

  it('should reject TypeCode "05"', () => {
    const a = new Addenda10();
    a.parse(mockRecord);
    a.typeCode = '05';
    const err = a.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('TypeCode');
  });

  it('should reject invalid TransactionTypeCode', () => {
    const a = new Addenda10();
    a.parse(mockRecord);
    a.transactionTypeCode = 'ABC';
    const err = a.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('TransactionTypeCode');
  });

  it('should reject non-alphanumeric Name unless special chars allowed', () => {
    const a = new Addenda10();
    a.parse(mockRecord);
    a.name = 'Łomża';
    const err = a.validate();
    expect(err).not.toBeNull();

    a.setValidation({ allowSpecialCharacters: true });
    expect(a.validate()).toBeNull();
  });

  it('should fail field inclusion when TransactionTypeCode is empty', () => {
    const a = new Addenda10();
    a.parse(mockRecord);
    a.transactionTypeCode = '';
    const err = a.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('TransactionTypeCode');
  });

  it('should fail field inclusion when Name is empty', () => {
    const a = new Addenda10();
    a.parse(mockRecord);
    a.name = '';
    const err = a.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('Name');
  });
});

// =========================================================================
// Addenda11 Tests
// =========================================================================
describe('Addenda11', () => {
  function mockAddenda11(): Addenda11 {
    const a = new Addenda11();
    a.originatorName = 'Wells Fargo';
    a.originatorStreetAddress = '123 Main St';
    a.entryDetailSequenceNumber = 1;
    return a;
  }

  it('should round-trip string and parse', () => {
    const a = mockAddenda11();
    const s = a.string();
    expect(s.length).toBe(94);

    const b = new Addenda11();
    b.parse(s);
    expect(b.typeCode).toBe('11');
    expect(b.originatorName).toBe('Wells Fargo');
    expect(b.originatorStreetAddress).toBe('123 Main St');
    expect(b.entryDetailSequenceNumber).toBe(1);
  });

  it('should reject invalid TypeCode', () => {
    const a = mockAddenda11();
    a.typeCode = '05';
    const err = a.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('TypeCode');
  });

  it('should fail field inclusion when OriginatorName is empty', () => {
    const a = mockAddenda11();
    a.originatorName = '';
    const err = a.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('OriginatorName');
  });
});

// =========================================================================
// Addenda12 Tests
// =========================================================================
describe('Addenda12', () => {
  function mockAddenda12(): Addenda12 {
    const a = new Addenda12();
    a.originatorCityStateProvince = 'San Francisco*CA\\';
    a.originatorCountryPostalCode = 'US*10036\\';
    a.originatorDateOfBirth = '1990-01-15';
    a.entryDetailSequenceNumber = 1;
    return a;
  }

  it('should round-trip string and parse', () => {
    const a = mockAddenda12();
    const s = a.string();
    expect(s.length).toBe(94);

    const b = new Addenda12();
    b.parse(s);
    expect(b.typeCode).toBe('12');
    expect(b.originatorCityStateProvince).toBe('San Francisco*CA\\');
    expect(b.originatorCountryPostalCode).toBe('US*10036\\');
  });

  it('should reject invalid TypeCode', () => {
    const a = mockAddenda12();
    a.typeCode = '99';
    const err = a.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('TypeCode');
  });
});

// =========================================================================
// Addenda13 Tests
// =========================================================================
describe('Addenda13', () => {
  const mockRecord =
    '713Wells Fargo                        01121042882                         US           0000001';

  it('should parse a record string', () => {
    const a = new Addenda13();
    a.parse(mockRecord);

    expect(a.typeCode).toBe('13');
    expect(a.odfiName).toBe('Wells Fargo');
    expect(a.odfiIDNumberQualifier).toBe('01');
    expect(a.odfiIdentification).toBe('121042882');
    expect(a.odfiBranchCountryCode).toBe('US');
    expect(a.entryDetailSequenceNumber).toBe(1);
  });

  it('should round-trip parse and string', () => {
    const a = new Addenda13();
    a.parse(mockRecord);
    expect(a.string()).toBe(mockRecord);
  });

  it('should reject invalid TypeCode "65"', () => {
    const a = new Addenda13();
    a.parse(mockRecord);
    a.typeCode = '65';
    const err = a.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('TypeCode');
  });

  it('should reject non-alphanumeric ODFIName', () => {
    const a = new Addenda13();
    a.parse(mockRecord);
    a.odfiName = 'Wells®Fargo';
    const err = a.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('ODFIName');
  });

  it('should fail field inclusion when ODFIIdentification is empty', () => {
    const a = new Addenda13();
    a.parse(mockRecord);
    a.odfiIdentification = '';
    const err = a.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('ODFIIdentification');
  });
});

// =========================================================================
// Addenda14 Tests
// =========================================================================
describe('Addenda14', () => {
  function mockAddenda14(): Addenda14 {
    const a = new Addenda14();
    a.rdfiName = 'Deutsche Bank';
    a.rdfiIDNumberQualifier = '02';
    a.rdfiIdentification = 'DEUTDEFF';
    a.rdfiBranchCountryCode = 'DE';
    a.entryDetailSequenceNumber = 1;
    return a;
  }

  it('should round-trip string and parse', () => {
    const a = mockAddenda14();
    const s = a.string();
    expect(s.length).toBe(94);

    const b = new Addenda14();
    b.parse(s);
    expect(b.typeCode).toBe('14');
    expect(b.rdfiName).toBe('Deutsche Bank');
    expect(b.rdfiIDNumberQualifier).toBe('02');
    expect(b.rdfiIdentification).toBe('DEUTDEFF');
    expect(b.rdfiBranchCountryCode).toBe('DE');
  });

  it('should reject invalid TypeCode', () => {
    const a = mockAddenda14();
    a.typeCode = '13';
    const err = a.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('TypeCode');
  });

  it('should fail field inclusion when RDFIName is empty', () => {
    const a = mockAddenda14();
    a.rdfiName = '';
    const err = a.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('RDFIName');
  });
});

// =========================================================================
// Addenda15 Tests
// =========================================================================
describe('Addenda15', () => {
  function mockAddenda15(): Addenda15 {
    const a = new Addenda15();
    a.receiverIDNumber = 'AB123';
    a.receiverStreetAddress = '456 Oak Ave';
    a.entryDetailSequenceNumber = 1;
    return a;
  }

  it('should round-trip string and parse', () => {
    const a = mockAddenda15();
    const s = a.string();
    expect(s.length).toBe(94);

    const b = new Addenda15();
    b.parse(s);
    expect(b.typeCode).toBe('15');
    expect(b.receiverIDNumber).toBe('AB123');
    expect(b.receiverStreetAddress).toBe('456 Oak Ave');
  });

  it('should reject invalid TypeCode', () => {
    const a = mockAddenda15();
    a.typeCode = '14';
    const err = a.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('TypeCode');
  });

  it('should fail field inclusion when ReceiverStreetAddress is empty', () => {
    const a = mockAddenda15();
    a.receiverStreetAddress = '';
    const err = a.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('ReceiverStreetAddress');
  });
});

// =========================================================================
// Addenda16 Tests
// =========================================================================
describe('Addenda16', () => {
  function mockAddenda16(): Addenda16 {
    const a = new Addenda16();
    a.receiverCityStateProvince = 'London*ENG\\';
    a.receiverCountryPostalCode = 'GB*SW1A1AA\\';
    a.receiverDateOfBirth = '1985-06-15';
    a.entryDetailSequenceNumber = 1;
    return a;
  }

  it('should round-trip string and parse', () => {
    const a = mockAddenda16();
    const s = a.string();
    expect(s.length).toBe(94);

    const b = new Addenda16();
    b.parse(s);
    expect(b.typeCode).toBe('16');
    expect(b.receiverCityStateProvince).toBe('London*ENG\\');
    expect(b.receiverCountryPostalCode).toBe('GB*SW1A1AA\\');
  });

  it('should reject invalid TypeCode', () => {
    const a = mockAddenda16();
    a.typeCode = '17';
    const err = a.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('TypeCode');
  });
});

// =========================================================================
// Addenda17 Tests
// =========================================================================
describe('Addenda17', () => {
  const mockRecord =
    '717This is an international payment                                                00010000001';

  it('should parse a record string', () => {
    const a = new Addenda17();
    a.parse(mockRecord);

    expect(a.typeCode).toBe('17');
    expect(a.paymentRelatedInformation).toBe('This is an international payment');
    expect(a.sequenceNumber).toBe(1);
    expect(a.entryDetailSequenceNumber).toBe(1);
  });

  it('should round-trip parse and string', () => {
    const a = new Addenda17();
    a.parse(mockRecord);
    expect(a.string()).toBe(mockRecord);
  });

  it('should reject invalid TypeCode', () => {
    const a = new Addenda17();
    a.parse(mockRecord);
    a.typeCode = '05';
    const err = a.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('TypeCode');
  });

  it('should fail field inclusion when TypeCode is empty', () => {
    const a = new Addenda17();
    a.parse(mockRecord);
    a.typeCode = '';
    const err = a.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('TypeCode');
  });

  it('should fail field inclusion when SequenceNumber is 0', () => {
    const a = new Addenda17();
    a.parse(mockRecord);
    a.sequenceNumber = 0;
    const err = a.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('SequenceNumber');
  });

  it('should reject non-alphanumeric PaymentRelatedInformation', () => {
    const a = new Addenda17();
    a.parse(mockRecord);
    a.paymentRelatedInformation = '®©';
    const err = a.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('PaymentRelatedInformation');
  });
});

// =========================================================================
// Addenda18 Tests
// =========================================================================
describe('Addenda18', () => {
  function mockAddenda18(): Addenda18 {
    const a = new Addenda18();
    a.foreignCorrespondentBankName = 'Bank of China';
    a.foreignCorrespondentBankIDNumberQualifier = '01';
    a.foreignCorrespondentBankIDNumber = '123456789';
    a.foreignCorrespondentBankBranchCountryCode = 'CN';
    a.sequenceNumber = 1;
    a.entryDetailSequenceNumber = 1;
    return a;
  }

  it('should round-trip string and parse', () => {
    const a = mockAddenda18();
    const s = a.string();
    expect(s.length).toBe(94);

    const b = new Addenda18();
    b.parse(s);
    expect(b.typeCode).toBe('18');
    expect(b.foreignCorrespondentBankName).toBe('Bank of China');
    expect(b.foreignCorrespondentBankIDNumberQualifier).toBe('01');
    expect(b.foreignCorrespondentBankIDNumber).toBe('123456789');
    expect(b.foreignCorrespondentBankBranchCountryCode).toBe('CN');
    expect(b.sequenceNumber).toBe(1);
  });

  it('should reject invalid TypeCode', () => {
    const a = mockAddenda18();
    a.typeCode = '17';
    const err = a.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('TypeCode');
  });

  it('should fail field inclusion when bank name is empty', () => {
    const a = mockAddenda18();
    a.foreignCorrespondentBankName = '';
    const err = a.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('ForeignCorrespondentBankName');
  });

  it('should fail field inclusion when SequenceNumber is 0', () => {
    const a = mockAddenda18();
    a.sequenceNumber = 0;
    const err = a.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('SequenceNumber');
  });

  it('should reject non-alphanumeric bank fields', () => {
    const a = mockAddenda18();
    a.foreignCorrespondentBankName = 'Bank®China';
    const err = a.validate();
    expect(err).not.toBeNull();
    expect(err!.message).toContain('ForeignCorrespondentBankName');
  });
});
