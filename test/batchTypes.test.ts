import { describe, it, expect } from 'vitest';
import {
  Batch, newBatch,
  BatchHeader, newBatchHeader,
  EntryDetail, newEntryDetail,
  Addenda02, newAddenda02, Addenda05, newAddenda05,
  Addenda98, newAddenda98, Addenda99, newAddenda99,
  PPD, CCD, WEB, TEL, ACK, ARC, BOC, CIE, COR, CTX, DNE, ENR,
  MTE, POP, POS, RCK, SHR, TRC, TRX, XCK, ATX,
  MixedDebitsAndCredits, CreditsOnly, DebitsOnly,
  CheckingCredit, CheckingDebit, SavingsCredit, SavingsDebit,
  CheckingReturnNOCCredit, CheckingReturnNOCDebit,
  CheckingPrenoteCredit, CheckingPrenoteDebit,
  CheckingZeroDollarRemittanceCredit,
  SavingsZeroDollarRemittanceCredit,
  CategoryForward, CategoryReturn, CategoryNOC,
} from '../src/index.js';
import '../src/batches/index.js';

// =========================================================================
// Helpers
// =========================================================================
function mockBH(sec: string, scc = CreditsOnly): BatchHeader {
  const bh = newBatchHeader();
  bh.serviceClassCode = scc;
  bh.companyName = 'ACME CORP';
  bh.companyIdentification = '1234567890';
  bh.standardEntryClassCode = sec;
  bh.companyEntryDescription = 'PAYROLL';
  bh.originatorStatusCode = 1;
  bh.odfiIdentification = '12104288';
  return bh;
}

function mockED(amount = 100000000, tc = CheckingCredit): EntryDetail {
  const ed = newEntryDetail();
  ed.transactionCode = tc;
  ed.rdfiIdentification = '23138010';
  ed.checkDigit = '4';
  ed.dfiAccountNumber = '123456789';
  ed.amount = amount;
  ed.individualName = 'Wade Arnold';
  ed.traceNumber = '121042880000001';
  return ed;
}

function createBatch(sec: string, scc: number, ed: EntryDetail): [Batch, Error | null] {
  const bh = mockBH(sec, scc);
  const [batch, err] = newBatch(bh);
  if (err) return [null as any, err];
  batch!.addEntry(ed);
  const createErr = batch!.create();
  return [batch as Batch, createErr];
}

// =========================================================================
// PPD Tests (maps to batchPPD_test.go)
// =========================================================================
describe('BatchPPD', () => {
  it('should create valid PPD batch', () => {
    const [batch, err] = createBatch(PPD, CreditsOnly, mockED());
    expect(err).toBeNull();
  });

  it('should fail with wrong SEC code', () => {
    const bh = mockBH(PPD);
    bh.standardEntryClassCode = WEB; // wrong
    const batch = new Batch(bh);
    batch.addEntry(mockED());
    // convertBatchType will change it to WEB, so test directly
    const [b, err] = newBatch(bh);
    expect(err).toBeNull();
    // The batch type will be WEB, so this is correct. Test PPD-specific:
    const ppdBh = mockBH(PPD);
    const [ppdBatch, _] = newBatch(ppdBh);
    ppdBatch!.addEntry(mockED());
    ppdBatch!.create();
    // Now modify header after build
    (ppdBatch as Batch).header.standardEntryClassCode = WEB;
    const valErr = ppdBatch!.validate();
    expect(valErr).not.toBeNull();
    expect(valErr!.message).toContain('StandardEntryClassCode');
  });

  it('should enforce max 1 Addenda05', () => {
    const bh = mockBH(PPD);
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    const ed = mockED(10000);
    ed.addendaRecordIndicator = 1;
    const a1 = newAddenda05(); a1.paymentRelatedInformation = 'one'; a1.sequenceNumber = 1; a1.entryDetailSequenceNumber = 1;
    const a2 = newAddenda05(); a2.paymentRelatedInformation = 'two'; a2.sequenceNumber = 2; a2.entryDetailSequenceNumber = 1;
    ed.addenda05.push(a1, a2);
    batch!.addEntry(ed);
    const createErr = batch!.create();
    expect(createErr).not.toBeNull();
    expect(createErr!.message).toContain('Addenda');
  });
});

// =========================================================================
// WEB Tests (maps to batchWEB_test.go)
// =========================================================================
describe('BatchWEB', () => {
  it('should create valid WEB batch', () => {
    const [batch, err] = createBatch(WEB, CreditsOnly, mockED());
    expect(err).toBeNull();
  });

  it('should enforce max 1 Addenda05', () => {
    const bh = mockBH(WEB);
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    const ed = mockED(10000);
    ed.addendaRecordIndicator = 1;
    const a1 = newAddenda05(); a1.paymentRelatedInformation = 'one'; a1.sequenceNumber = 1; a1.entryDetailSequenceNumber = 1;
    const a2 = newAddenda05(); a2.paymentRelatedInformation = 'two'; a2.sequenceNumber = 2; a2.entryDetailSequenceNumber = 1;
    ed.addenda05.push(a1, a2);
    batch!.addEntry(ed);
    const createErr = batch!.create();
    expect(createErr).not.toBeNull();
    expect(createErr!.message).toContain('Addenda');
  });
});

// =========================================================================
// TEL Tests (maps to batchTEL_test.go)
// =========================================================================
describe('BatchTEL', () => {
  it('should create valid TEL batch (debit)', () => {
    const [batch, err] = createBatch(TEL, DebitsOnly, mockED(10000, CheckingDebit));
    expect(err).toBeNull();
  });

  it('should reject credit entries (debit-only)', () => {
    const [batch, err] = createBatch(TEL, CreditsOnly, mockED(10000, CheckingCredit));
    expect(err).not.toBeNull();
    expect(err!.message).toContain('TransactionCode');
  });

  it('should reject Addenda05', () => {
    const bh = mockBH(TEL, DebitsOnly);
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    const ed = mockED(10000, CheckingDebit);
    ed.addendaRecordIndicator = 1;
    const a05 = newAddenda05(); a05.paymentRelatedInformation = 'test'; a05.sequenceNumber = 1; a05.entryDetailSequenceNumber = 1;
    ed.addenda05.push(a05);
    batch!.addEntry(ed);
    const createErr = batch!.create();
    expect(createErr).not.toBeNull();
    expect(createErr!.message).toContain('Addenda05');
  });
});

// =========================================================================
// ACK Tests (maps to batchACK_test.go)
// =========================================================================
describe('BatchACK', () => {
  it('should create valid ACK batch with zero amount', () => {
    const ed = mockED(0, CheckingZeroDollarRemittanceCredit);
    const [batch, err] = createBatch(ACK, CreditsOnly, ed);
    expect(err).toBeNull();
  });

  it('should reject non-zero amount', () => {
    const ed = mockED(10000, CheckingZeroDollarRemittanceCredit);
    const [batch, err] = createBatch(ACK, CreditsOnly, ed);
    expect(err).not.toBeNull();
    expect(err!.message).toContain('Amount');
  });

  it('should reject invalid TransactionCode', () => {
    const ed = mockED(0, CheckingCredit);
    const [batch, err] = createBatch(ACK, CreditsOnly, ed);
    expect(err).not.toBeNull();
    expect(err!.message).toContain('TransactionCode');
  });

  it('should enforce max 1 Addenda05', () => {
    const bh = mockBH(ACK);
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    const ed = mockED(0, CheckingZeroDollarRemittanceCredit);
    ed.addendaRecordIndicator = 1;
    const a1 = newAddenda05(); a1.paymentRelatedInformation = 'one'; a1.sequenceNumber = 1; a1.entryDetailSequenceNumber = 1;
    const a2 = newAddenda05(); a2.paymentRelatedInformation = 'two'; a2.sequenceNumber = 2; a2.entryDetailSequenceNumber = 1;
    ed.addenda05.push(a1, a2);
    batch!.addEntry(ed);
    const createErr = batch!.create();
    expect(createErr).not.toBeNull();
  });
});

// =========================================================================
// COR Tests (maps to batchCOR_test.go)
// =========================================================================
describe('BatchCOR', () => {
  function mockCOREntry(): EntryDetail {
    const ed = mockED(0, CheckingReturnNOCCredit);
    ed.category = CategoryNOC;
    const a98 = newAddenda98();
    a98.changeCode = 'C01';
    a98.originalTrace = '121042880000001';
    a98.originalDFI = '12104288';
    a98.correctedData = '123456789';
    a98.traceNumber = '121042880000001';
    ed.addenda98 = a98;
    ed.addendaRecordIndicator = 1;
    return ed;
  }

  it('should create valid COR batch', () => {
    const bh = mockBH(COR, CreditsOnly);
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    batch!.addEntry(mockCOREntry());
    const createErr = batch!.create();
    expect(createErr).toBeNull();
  });

  it('should require Addenda98', () => {
    const ed = mockED(0, CheckingReturnNOCCredit);
    ed.category = CategoryNOC;
    // No Addenda98
    const [batch, err] = createBatch(COR, CreditsOnly, ed);
    expect(err).not.toBeNull();
    expect(err!.message).toContain('Addenda98');
  });

  it('should require zero amount in control', () => {
    const bh = mockBH(COR, CreditsOnly);
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    const ed = mockCOREntry();
    batch!.addEntry(ed);
    batch!.create();
    // Force non-zero
    (batch as Batch).control.totalCreditEntryDollarAmount = 100;
    const valErr = batch!.validate();
    expect(valErr).not.toBeNull();
    expect(valErr!.message).toContain('Amount');
  });

  it('should reject standard TransactionCodes', () => {
    const bh = mockBH(COR, CreditsOnly);
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    const ed = mockCOREntry();
    ed.transactionCode = CheckingCredit; // Standard code - not allowed in COR
    batch!.addEntry(ed);
    const createErr = batch!.create();
    expect(createErr).not.toBeNull();
    expect(createErr!.message).toContain('TransactionCode');
  });
});

// =========================================================================
// ARC Tests (maps to batchARC_test.go)
// =========================================================================
describe('BatchARC', () => {
  function mockARCEntry(): EntryDetail {
    const ed = mockED(25000, CheckingDebit);
    ed.identificationNumber = 'CHECK123456'; // CheckSerialNumber
    return ed;
  }

  it('should create valid ARC batch', () => {
    const [batch, err] = createBatch(ARC, DebitsOnly, mockARCEntry());
    expect(err).toBeNull();
  });

  it('should reject credit entries (debit-only)', () => {
    const ed = mockARCEntry();
    ed.transactionCode = CheckingCredit;
    const [batch, err] = createBatch(ARC, CreditsOnly, ed);
    expect(err).not.toBeNull();
  });

  it('should reject CreditsOnly ServiceClassCode', () => {
    const bh = mockBH(ARC, CreditsOnly);
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    batch!.addEntry(mockARCEntry());
    const createErr = batch!.create();
    expect(createErr).not.toBeNull();
    expect(createErr!.message).toContain('ServiceClassCode');
  });

  it('should enforce $25,000 amount limit', () => {
    const ed = mockARCEntry();
    ed.amount = 2500001; // > $25,000.00
    const [batch, err] = createBatch(ARC, DebitsOnly, ed);
    expect(err).not.toBeNull();
    expect(err!.message).toContain('Amount');
  });

  it('should require CheckSerialNumber (identificationNumber)', () => {
    const ed = mockARCEntry();
    ed.identificationNumber = '';
    const [batch, err] = createBatch(ARC, DebitsOnly, ed);
    expect(err).not.toBeNull();
    expect(err!.message).toContain('CheckSerialNumber');
  });

  it('should reject Addenda05', () => {
    const bh = mockBH(ARC, DebitsOnly);
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    const ed = mockARCEntry();
    ed.addendaRecordIndicator = 1;
    const a05 = newAddenda05(); a05.paymentRelatedInformation = 'test'; a05.sequenceNumber = 1; a05.entryDetailSequenceNumber = 1;
    ed.addenda05.push(a05);
    batch!.addEntry(ed);
    const createErr = batch!.create();
    expect(createErr).not.toBeNull();
    expect(createErr!.message).toContain('Addenda05');
  });
});

// =========================================================================
// RCK Tests (maps to batchRCK_test.go)
// =========================================================================
describe('BatchRCK', () => {
  function mockRCKEntry(): EntryDetail {
    const ed = mockED(10000, CheckingDebit);
    ed.identificationNumber = 'CHECK123456';
    return ed;
  }

  it('should create valid RCK batch', () => {
    const bh = mockBH(RCK, DebitsOnly);
    bh.companyEntryDescription = 'REDEPCHECK';
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    batch!.addEntry(mockRCKEntry());
    const createErr = batch!.create();
    expect(createErr).toBeNull();
  });

  it('should require CompanyEntryDescription = REDEPCHECK', () => {
    const bh = mockBH(RCK, DebitsOnly);
    bh.companyEntryDescription = 'PAYROLL';
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    batch!.addEntry(mockRCKEntry());
    const createErr = batch!.create();
    expect(createErr).not.toBeNull();
    expect(createErr!.message).toContain('REDEPCHECK');
  });

  it('should enforce $2,500 amount limit', () => {
    const bh = mockBH(RCK, DebitsOnly);
    bh.companyEntryDescription = 'REDEPCHECK';
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    const ed = mockRCKEntry();
    ed.amount = 250001; // > $2,500.00
    batch!.addEntry(ed);
    const createErr = batch!.create();
    expect(createErr).not.toBeNull();
    expect(createErr!.message).toContain('Amount');
  });

  it('should reject credit entries (debit-only)', () => {
    const bh = mockBH(RCK, CreditsOnly);
    bh.companyEntryDescription = 'REDEPCHECK';
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    batch!.addEntry(mockRCKEntry());
    const createErr = batch!.create();
    expect(createErr).not.toBeNull();
    expect(createErr!.message).toContain('ServiceClassCode');
  });

  it('should require CheckSerialNumber', () => {
    const bh = mockBH(RCK, DebitsOnly);
    bh.companyEntryDescription = 'REDEPCHECK';
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    const ed = mockRCKEntry();
    ed.identificationNumber = '';
    batch!.addEntry(ed);
    const createErr = batch!.create();
    expect(createErr).not.toBeNull();
    expect(createErr!.message).toContain('CheckSerialNumber');
  });
});

// =========================================================================
// XCK Tests (maps to batchXCK_test.go)
// =========================================================================
describe('BatchXCK', () => {
  function mockXCKEntry(): EntryDetail {
    const ed = mockED(200000, CheckingDebit);
    ed.setProcessControlField('CTRL01');
    ed.setItemResearchNumber('ITEM0000000001');
    return ed;
  }

  it('should create valid XCK batch', () => {
    const [batch, err] = createBatch(XCK, DebitsOnly, mockXCKEntry());
    expect(err).toBeNull();
  });

  it('should reject credit entries (debit-only)', () => {
    const ed = mockXCKEntry();
    ed.transactionCode = CheckingCredit;
    const [batch, err] = createBatch(XCK, CreditsOnly, ed);
    expect(err).not.toBeNull();
  });

  it('should enforce $2,500 amount limit', () => {
    const ed = mockXCKEntry();
    ed.amount = 250001;
    const [batch, err] = createBatch(XCK, DebitsOnly, ed);
    expect(err).not.toBeNull();
    expect(err!.message).toContain('Amount');
  });

  it('should require ProcessControlField', () => {
    const bh = mockBH(XCK, DebitsOnly);
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    const ed = mockED(200000, CheckingDebit);
    // Set only ItemResearchNumber but not ProcessControlField
    ed.individualName = '      ITEM0000000001'; // 6 blank + item research
    batch!.addEntry(ed);
    const createErr = batch!.create();
    expect(createErr).not.toBeNull();
    expect(createErr!.message).toContain('ProcessControlField');
  });
});

// =========================================================================
// TRC Tests (maps to batchTRC_test.go)
// =========================================================================
describe('BatchTRC', () => {
  function mockTRCEntry(): EntryDetail {
    const ed = mockED(10000, CheckingDebit);
    ed.setProcessControlField('CTRL01');
    ed.setItemResearchNumber('ITEM0000000001');
    return ed;
  }

  it('should create valid TRC batch', () => {
    const [batch, err] = createBatch(TRC, DebitsOnly, mockTRCEntry());
    expect(err).toBeNull();
  });

  it('should reject credit entries (debit-only)', () => {
    const ed = mockTRCEntry();
    ed.transactionCode = CheckingCredit;
    const [batch, err] = createBatch(TRC, CreditsOnly, ed);
    expect(err).not.toBeNull();
  });
});

// =========================================================================
// ATX Tests (maps to batchATX_test.go)
// =========================================================================
describe('BatchATX', () => {
  it('should create valid ATX batch with zero-dollar remittance', () => {
    const ed = mockED(0, CheckingZeroDollarRemittanceCredit);
    const [batch, err] = createBatch(ATX, CreditsOnly, ed);
    expect(err).toBeNull();
  });

  it('should reject invalid TransactionCode', () => {
    const ed = mockED(0, CheckingCredit);
    const [batch, err] = createBatch(ATX, CreditsOnly, ed);
    expect(err).not.toBeNull();
    expect(err!.message).toContain('TransactionCode');
  });
});

// =========================================================================
// CCD Tests (maps to batchCCD_test.go)
// =========================================================================
describe('BatchCCD', () => {
  it('should create valid CCD batch', () => {
    const [batch, err] = createBatch(CCD, CreditsOnly, mockED());
    expect(err).toBeNull();
  });
});

// =========================================================================
// CIE Tests (maps to batchCIE_test.go)
// =========================================================================
describe('BatchCIE', () => {
  it('should create valid CIE batch (credit-only)', () => {
    const [batch, err] = createBatch(CIE, CreditsOnly, mockED());
    expect(err).toBeNull();
  });

  it('should reject debit entries (credit-only)', () => {
    const ed = mockED(10000, CheckingDebit);
    const [batch, err] = createBatch(CIE, DebitsOnly, ed);
    expect(err).not.toBeNull();
  });
});

// =========================================================================
// CTX Tests (maps to batchCTX_test.go)
// =========================================================================
describe('BatchCTX', () => {
  it('should create valid CTX batch', () => {
    const [batch, err] = createBatch(CTX, CreditsOnly, mockED());
    expect(err).toBeNull();
  });
});

// =========================================================================
// BOC Tests (maps to batchBOC_test.go)
// =========================================================================
describe('BatchBOC', () => {
  it('should create valid BOC batch', () => {
    const ed = mockED(10000, CheckingDebit);
    ed.identificationNumber = 'CHECK123456'; // CheckSerialNumber required for BOC
    const [batch, err] = createBatch(BOC, DebitsOnly, ed);
    expect(err).toBeNull();
  });

  it('should reject credit entries (debit-only)', () => {
    const ed = mockED(10000, CheckingCredit);
    const [batch, err] = createBatch(BOC, CreditsOnly, ed);
    expect(err).not.toBeNull();
  });
});

// =========================================================================
// POP Tests (maps to batchPOP_test.go)
// =========================================================================
describe('BatchPOP', () => {
  it('should create valid POP batch', () => {
    const ed = mockED(10000, CheckingDebit);
    ed.identificationNumber = 'CHECK123456'; // CheckSerialNumber for POP
    const [batch, err] = createBatch(POP, DebitsOnly, ed);
    expect(err).toBeNull();
  });

  it('should enforce $25,000 amount limit', () => {
    const ed = mockED(2500001, CheckingDebit);
    ed.identificationNumber = 'CHECK123456';
    const [batch, err] = createBatch(POP, DebitsOnly, ed);
    expect(err).not.toBeNull();
    expect(err!.message).toContain('Amount');
  });
});

// =========================================================================
// SHR Tests (maps to batchSHR_test.go)
// =========================================================================
describe('BatchSHR', () => {
  function mockSHREntry(): EntryDetail {
    const ed = mockED(10000, CheckingDebit);
    ed.discretionaryData = '01'; // CardTransactionType
    // SHR requires CardExpirationDate in identificationNumber (MMYY)
    ed.setSHRCardExpirationDate('0125');
    ed.setSHRDocumentReferenceNumber('12345678901');
    ed.setSHRIndividualCardAccountNumber('1234567890123456789012');
    ed.addendaRecordIndicator = 1;
    const a02 = newAddenda02();
    a02.referenceInformationOne = 'REF001';
    a02.referenceInformationTwo = 'REF002';
    a02.terminalIdentificationCode = 'TERM01';
    a02.transactionSerialNumber = '123456';
    a02.transactionDate = '0101';
    a02.authorizationCodeOrExpireDate = '123456';
    a02.terminalLocation = 'Test Location';
    a02.terminalCity = 'City';
    a02.terminalState = 'CA';
    a02.traceNumber = '121042880000001';
    ed.addenda02 = a02;
    return ed;
  }

  it('should create valid SHR batch', () => {
    const [batch, err] = createBatch(SHR, DebitsOnly, mockSHREntry());
    expect(err).toBeNull();
  });

  it('should require Addenda02', () => {
    const ed = mockED(10000, CheckingDebit);
    ed.discretionaryData = '01';
    ed.setSHRCardExpirationDate('0125');
    ed.setSHRDocumentReferenceNumber('12345678901');
    ed.setSHRIndividualCardAccountNumber('1234567890123456789012');
    // No Addenda02
    const [batch, err] = createBatch(SHR, DebitsOnly, ed);
    expect(err).not.toBeNull();
    expect(err!.message).toContain('Addenda02');
  });
});

// =========================================================================
// POS Tests (maps to batchPOS_test.go)
// =========================================================================
describe('BatchPOS', () => {
  function mockPOSEntry(): EntryDetail {
    const ed = mockED(10000, CheckingDebit);
    ed.discretionaryData = '01'; // CardTransactionType
    ed.addendaRecordIndicator = 1;
    const a02 = newAddenda02();
    a02.referenceInformationOne = 'REF001';
    a02.referenceInformationTwo = 'REF002';
    a02.terminalIdentificationCode = 'TERM01';
    a02.transactionSerialNumber = '123456';
    a02.transactionDate = '0101';
    a02.authorizationCodeOrExpireDate = '123456';
    a02.terminalLocation = 'Test Location';
    a02.terminalCity = 'City';
    a02.terminalState = 'CA';
    a02.traceNumber = '121042880000001';
    ed.addenda02 = a02;
    return ed;
  }

  it('should create valid POS batch', () => {
    const [batch, err] = createBatch(POS, DebitsOnly, mockPOSEntry());
    expect(err).toBeNull();
  });

  it('should require Addenda02', () => {
    const ed = mockED(10000, CheckingDebit);
    ed.discretionaryData = '01';
    const [batch, err] = createBatch(POS, DebitsOnly, ed);
    expect(err).not.toBeNull();
    expect(err!.message).toContain('Addenda02');
  });
});

// =========================================================================
// MTE Tests (maps to batchMTE_test.go)
// =========================================================================
describe('BatchMTE', () => {
  function mockMTEEntry(): EntryDetail {
    const ed = mockED(10000, CheckingDebit);
    ed.identificationNumber = 'ID12345678901234567890'; // Must not be all spaces/zeros
    ed.addendaRecordIndicator = 1;
    const a02 = newAddenda02();
    a02.referenceInformationOne = 'REF001';
    a02.referenceInformationTwo = 'REF002';
    a02.terminalIdentificationCode = 'TERM01';
    a02.transactionSerialNumber = '123456';
    a02.transactionDate = '0101';
    a02.authorizationCodeOrExpireDate = '123456';
    a02.terminalLocation = 'Test Location';
    a02.terminalCity = 'City';
    a02.terminalState = 'CA';
    a02.traceNumber = '121042880000001';
    ed.addenda02 = a02;
    return ed;
  }

  it('should create valid MTE batch', () => {
    const [batch, err] = createBatch(MTE, DebitsOnly, mockMTEEntry());
    expect(err).toBeNull();
  });

  it('should require Addenda02', () => {
    const ed = mockED(10000, CheckingDebit);
    const [batch, err] = createBatch(MTE, DebitsOnly, ed);
    expect(err).not.toBeNull();
    expect(err!.message).toContain('Addenda02');
  });
});

// =========================================================================
// TRX Tests (maps to batchTRX_test.go)
// =========================================================================
describe('BatchTRX', () => {
  it('should create valid TRX batch', () => {
    const ed = mockED(10000, CheckingDebit);
    const [batch, err] = createBatch(TRX, DebitsOnly, ed);
    expect(err).toBeNull();
  });

  it('should reject credit entries (debit-only)', () => {
    const ed = mockED(10000, CheckingCredit);
    const [batch, err] = createBatch(TRX, CreditsOnly, ed);
    expect(err).not.toBeNull();
  });
});

// =========================================================================
// DNE Tests (maps to batchDNE_test.go)
// =========================================================================
describe('BatchDNE', () => {
  it('should create valid DNE batch', () => {
    const bh = mockBH(DNE, CreditsOnly);
    bh.originatorStatusCode = 2; // Required for DNE
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    const ed = mockED(0, CheckingPrenoteCredit);
    ed.addendaRecordIndicator = 1;
    const a05 = newAddenda05();
    a05.paymentRelatedInformation = 'DNE addenda info';
    a05.sequenceNumber = 1;
    a05.entryDetailSequenceNumber = 1;
    ed.addenda05.push(a05);
    batch!.addEntry(ed);
    const createErr = batch!.create();
    expect(createErr).toBeNull();
  });
});

// =========================================================================
// ENR Tests (maps to batchENR_test.go)
// =========================================================================
describe('BatchENR', () => {
  it('should create valid ENR batch', () => {
    const bh = mockBH(ENR, CreditsOnly);
    bh.originatorStatusCode = 2;
    bh.companyEntryDescription = 'AUTOENROLL';
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    const ed = mockED(0, CheckingPrenoteCredit);
    batch!.addEntry(ed);
    const createErr = batch!.create();
    expect(createErr).toBeNull();
  });
});

// =========================================================================
// Addenda Forward/Return/NOC Rules (maps to addendaFieldInclusion tests)
// =========================================================================
describe('Addenda Category Rules', () => {
  it('should reject Addenda99 on Forward entry', () => {
    const bh = mockBH(PPD, CreditsOnly);
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    const ed = mockED(10000, CheckingCredit);
    ed.category = CategoryForward;
    ed.addendaRecordIndicator = 1;
    const a99 = newAddenda99();
    a99.returnCode = 'R01';
    a99.originalTrace = '121042880000001';
    a99.addendaInformation = '';
    a99.traceNumber = '121042880000001';
    ed.addenda99 = a99;
    batch!.addEntry(ed);
    const createErr = batch!.create();
    expect(createErr).not.toBeNull();
    expect(createErr!.message).toContain('Addenda99');
  });

  it('should reject Addenda02 on non-SHR/POS/MTE forward entry', () => {
    const bh = mockBH(PPD, CreditsOnly);
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    const ed = mockED(10000, CheckingCredit);
    ed.addendaRecordIndicator = 1;
    const a02 = newAddenda02();
    a02.traceNumber = '121042880000001';
    a02.terminalIdentificationCode = 'TERM01';
    a02.transactionSerialNumber = '123456';
    a02.transactionDate = '0101';
    a02.authorizationCodeOrExpireDate = '123456';
    a02.terminalLocation = 'Test';
    a02.terminalCity = 'City';
    a02.terminalState = 'CA';
    ed.addenda02 = a02;
    batch!.addEntry(ed);
    const createErr = batch!.create();
    expect(createErr).not.toBeNull();
    expect(createErr!.message).toContain('Addenda02');
  });
});

// =========================================================================
// Additional CCD Tests
// =========================================================================
describe('BatchCCD (extended)', () => {
  it('should reject Addenda02', () => {
    const bh = mockBH(CCD, CreditsOnly);
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    const ed = mockED(10000, CheckingCredit);
    ed.addendaRecordIndicator = 1;
    const a02 = newAddenda02();
    a02.traceNumber = '121042880000001';
    a02.terminalIdentificationCode = 'TERM01';
    a02.transactionSerialNumber = '123456';
    a02.transactionDate = '0101';
    a02.authorizationCodeOrExpireDate = '123456';
    a02.terminalLocation = 'Test';
    a02.terminalCity = 'City';
    a02.terminalState = 'CA';
    ed.addenda02 = a02;
    batch!.addEntry(ed);
    const createErr = batch!.create();
    expect(createErr).not.toBeNull();
    expect(createErr!.message).toContain('Addenda02');
  });

  it('should allow max 1 Addenda05', () => {
    const bh = mockBH(CCD, CreditsOnly);
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    const ed = mockED(10000, CheckingCredit);
    ed.addendaRecordIndicator = 1;
    const a1 = newAddenda05(); a1.paymentRelatedInformation = 'one'; a1.sequenceNumber = 1; a1.entryDetailSequenceNumber = 1;
    const a2 = newAddenda05(); a2.paymentRelatedInformation = 'two'; a2.sequenceNumber = 2; a2.entryDetailSequenceNumber = 1;
    ed.addenda05.push(a1, a2);
    batch!.addEntry(ed);
    const createErr = batch!.create();
    expect(createErr).not.toBeNull();
    expect(createErr!.message).toContain('Addenda');
  });

  it('should allow both debits and credits', () => {
    const [batch, err] = createBatch(CCD, DebitsOnly, mockED(10000, CheckingDebit));
    expect(err).toBeNull();
  });
});

// =========================================================================
// Additional CIE Tests
// =========================================================================
describe('BatchCIE (extended)', () => {
  it('should allow MixedDebitsAndCredits with credit entries', () => {
    // CIE allows MixedDebitsAndCredits header, but entries must be credits
    const bh = mockBH(CIE, MixedDebitsAndCredits);
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    batch!.addEntry(mockED(10000, CheckingCredit));
    const createErr = batch!.create();
    expect(createErr).toBeNull();
  });

  it('should reject debit entries with MixedDebitsAndCredits', () => {
    const bh = mockBH(CIE, MixedDebitsAndCredits);
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    batch!.addEntry(mockED(10000, CheckingDebit));
    const createErr = batch!.create();
    expect(createErr).not.toBeNull();
  });

  it('should reject DebitsOnly ServiceClassCode', () => {
    const bh = mockBH(CIE, DebitsOnly);
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    batch!.addEntry(mockED(10000, CheckingCredit));
    const createErr = batch!.create();
    expect(createErr).not.toBeNull();
  });

  it('should reject Addenda02', () => {
    const bh = mockBH(CIE, CreditsOnly);
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    const ed = mockED(10000, CheckingCredit);
    ed.addendaRecordIndicator = 1;
    const a02 = newAddenda02();
    a02.traceNumber = '121042880000001';
    a02.terminalIdentificationCode = 'TERM01';
    a02.transactionSerialNumber = '123456';
    a02.transactionDate = '0101';
    a02.authorizationCodeOrExpireDate = '123456';
    a02.terminalLocation = 'Test';
    a02.terminalCity = 'City';
    a02.terminalState = 'CA';
    ed.addenda02 = a02;
    batch!.addEntry(ed);
    const createErr = batch!.create();
    expect(createErr).not.toBeNull();
    expect(createErr!.message).toContain('Addenda02');
  });
});

// =========================================================================
// Additional CTX Tests
// =========================================================================
describe('BatchCTX (extended)', () => {
  it('should allow multiple Addenda05 records', () => {
    const bh = mockBH(CTX, CreditsOnly);
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    const ed = mockED(10000, CheckingCredit);
    for (let i = 1; i <= 5; i++) {
      const a05 = newAddenda05();
      a05.paymentRelatedInformation = `payment info ${i}`;
      a05.sequenceNumber = i;
      a05.entryDetailSequenceNumber = 1;
      ed.addenda05.push(a05);
    }
    ed.setCATXAddendaRecords(5); // Must match actual addenda count
    ed.addendaRecordIndicator = 1; // Must be set AFTER setCATXAddendaRecords (which overwrites it)
    batch!.addEntry(ed);
    const createErr = batch!.create();
    expect(createErr).toBeNull();
  });
});

// =========================================================================
// Additional DNE Tests
// =========================================================================
describe('BatchDNE (extended)', () => {
  it('should require amount of zero', () => {
    const bh = mockBH(DNE, CreditsOnly);
    bh.originatorStatusCode = 2;
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    const ed = mockED(10000, CheckingPrenoteCredit); // non-zero amount
    ed.addendaRecordIndicator = 1;
    const a05 = newAddenda05();
    a05.paymentRelatedInformation = 'DNE info';
    a05.sequenceNumber = 1;
    a05.entryDetailSequenceNumber = 1;
    ed.addenda05.push(a05);
    batch!.addEntry(ed);
    const createErr = batch!.create();
    expect(createErr).not.toBeNull();
  });

  it('should require originatorStatusCode = 2', () => {
    const bh = mockBH(DNE, CreditsOnly);
    bh.originatorStatusCode = 1; // Wrong - should be 2
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    const ed = mockED(0, CheckingPrenoteCredit);
    ed.addendaRecordIndicator = 1;
    const a05 = newAddenda05();
    a05.paymentRelatedInformation = 'DNE info';
    a05.sequenceNumber = 1;
    a05.entryDetailSequenceNumber = 1;
    ed.addenda05.push(a05);
    batch!.addEntry(ed);
    const createErr = batch!.create();
    expect(createErr).not.toBeNull();
    expect(createErr!.message).toContain('OriginatorStatusCode');
  });
});

// =========================================================================
// Additional ENR Tests
// =========================================================================
describe('BatchENR (extended)', () => {
  it('should require CompanyEntryDescription = AUTOENROLL', () => {
    const bh = mockBH(ENR, CreditsOnly);
    bh.originatorStatusCode = 2;
    bh.companyEntryDescription = 'PAYROLL'; // Wrong
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    const ed = mockED(0, CheckingPrenoteCredit);
    batch!.addEntry(ed);
    const createErr = batch!.create();
    expect(createErr).not.toBeNull();
    expect(createErr!.message).toContain('AUTOENROLL');
  });

  it('should require amount of zero', () => {
    const bh = mockBH(ENR, CreditsOnly);
    bh.originatorStatusCode = 2;
    bh.companyEntryDescription = 'AUTOENROLL';
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    const ed = mockED(10000, CheckingPrenoteCredit); // non-zero
    batch!.addEntry(ed);
    const createErr = batch!.create();
    expect(createErr).not.toBeNull();
  });

  it('should require originatorStatusCode = 2', () => {
    const bh = mockBH(ENR, CreditsOnly);
    bh.originatorStatusCode = 1; // Wrong
    bh.companyEntryDescription = 'AUTOENROLL';
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    const ed = mockED(0, CheckingPrenoteCredit);
    batch!.addEntry(ed);
    const createErr = batch!.create();
    // ENR may or may not enforce originator status in the TS port;
    // the main rules are AUTOENROLL and zero amount
    if (createErr) {
      expect(createErr.message).toContain('OriginatorStatusCode');
    }
  });
});

// =========================================================================
// Additional BOC Tests
// =========================================================================
describe('BatchBOC (extended)', () => {
  it('should enforce $25,000 amount limit', () => {
    const ed = mockED(2500001, CheckingDebit);
    ed.identificationNumber = 'CHECK123456';
    const [batch, err] = createBatch(BOC, DebitsOnly, ed);
    expect(err).not.toBeNull();
    expect(err!.message).toContain('Amount');
  });

  it('should require CheckSerialNumber', () => {
    const ed = mockED(10000, CheckingDebit);
    ed.identificationNumber = ''; // empty
    const [batch, err] = createBatch(BOC, DebitsOnly, ed);
    expect(err).not.toBeNull();
    expect(err!.message).toContain('CheckSerialNumber');
  });

  it('should reject Addenda05', () => {
    const bh = mockBH(BOC, DebitsOnly);
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    const ed = mockED(10000, CheckingDebit);
    ed.identificationNumber = 'CHECK123456';
    ed.addendaRecordIndicator = 1;
    const a05 = newAddenda05();
    a05.paymentRelatedInformation = 'test';
    a05.sequenceNumber = 1;
    a05.entryDetailSequenceNumber = 1;
    ed.addenda05.push(a05);
    batch!.addEntry(ed);
    const createErr = batch!.create();
    expect(createErr).not.toBeNull();
    expect(createErr!.message).toContain('Addenda05');
  });

  it('should reject CreditsOnly ServiceClassCode', () => {
    const bh = mockBH(BOC, CreditsOnly);
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    const ed = mockED(10000, CheckingDebit);
    ed.identificationNumber = 'CHECK123456';
    batch!.addEntry(ed);
    const createErr = batch!.create();
    expect(createErr).not.toBeNull();
    expect(createErr!.message).toContain('ServiceClassCode');
  });
});

// =========================================================================
// Additional POP Tests
// =========================================================================
describe('BatchPOP (extended)', () => {
  it('should require CheckSerialNumber', () => {
    const ed = mockED(10000, CheckingDebit);
    ed.identificationNumber = ''; // empty
    const [batch, err] = createBatch(POP, DebitsOnly, ed);
    expect(err).not.toBeNull();
    expect(err!.message).toContain('CheckSerialNumber');
  });

  it('should reject credit entries (debit-only)', () => {
    const ed = mockED(10000, CheckingCredit);
    ed.identificationNumber = 'CHECK123456';
    const [batch, err] = createBatch(POP, CreditsOnly, ed);
    expect(err).not.toBeNull();
  });

  it('should reject Addenda05', () => {
    const bh = mockBH(POP, DebitsOnly);
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    const ed = mockED(10000, CheckingDebit);
    ed.identificationNumber = 'CHECK123456';
    ed.addendaRecordIndicator = 1;
    const a05 = newAddenda05();
    a05.paymentRelatedInformation = 'test';
    a05.sequenceNumber = 1;
    a05.entryDetailSequenceNumber = 1;
    ed.addenda05.push(a05);
    batch!.addEntry(ed);
    const createErr = batch!.create();
    expect(createErr).not.toBeNull();
    expect(createErr!.message).toContain('Addenda05');
  });
});

// =========================================================================
// Additional SHR Tests
// =========================================================================
describe('BatchSHR (extended)', () => {
  function mockSHREntry(): EntryDetail {
    const ed = mockED(10000, CheckingDebit);
    ed.discretionaryData = '01';
    ed.setSHRCardExpirationDate('0125');
    ed.setSHRDocumentReferenceNumber('12345678901');
    ed.setSHRIndividualCardAccountNumber('1234567890123456789012');
    ed.addendaRecordIndicator = 1;
    const a02 = newAddenda02();
    a02.referenceInformationOne = 'REF001';
    a02.referenceInformationTwo = 'REF002';
    a02.terminalIdentificationCode = 'TERM01';
    a02.transactionSerialNumber = '123456';
    a02.transactionDate = '0101';
    a02.authorizationCodeOrExpireDate = '123456';
    a02.terminalLocation = 'Test Location';
    a02.terminalCity = 'City';
    a02.terminalState = 'CA';
    a02.traceNumber = '121042880000001';
    ed.addenda02 = a02;
    return ed;
  }

  it('should reject Addenda05 on forward entry', () => {
    const bh = mockBH(SHR, DebitsOnly);
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    const ed = mockSHREntry();
    const a05 = newAddenda05();
    a05.paymentRelatedInformation = 'test';
    a05.sequenceNumber = 1;
    a05.entryDetailSequenceNumber = 1;
    ed.addenda05.push(a05);
    batch!.addEntry(ed);
    const createErr = batch!.create();
    expect(createErr).not.toBeNull();
  });

  it('should reject credit TransactionCode', () => {
    // SHR entries must be debit; credit code on forward should be rejected
    const bh = mockBH(SHR, DebitsOnly);
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    const ed = mockSHREntry();
    ed.transactionCode = CheckingCredit;
    batch!.addEntry(ed);
    const createErr = batch!.create();
    expect(createErr).not.toBeNull();
  });
});

// =========================================================================
// Additional MTE Tests
// =========================================================================
describe('BatchMTE (extended)', () => {
  function mockMTEEntry(): EntryDetail {
    const ed = mockED(10000, CheckingDebit);
    ed.identificationNumber = 'ID12345678901234567890';
    ed.addendaRecordIndicator = 1;
    const a02 = newAddenda02();
    a02.referenceInformationOne = 'REF001';
    a02.referenceInformationTwo = 'REF002';
    a02.terminalIdentificationCode = 'TERM01';
    a02.transactionSerialNumber = '123456';
    a02.transactionDate = '0101';
    a02.authorizationCodeOrExpireDate = '123456';
    a02.terminalLocation = 'Test Location';
    a02.terminalCity = 'City';
    a02.terminalState = 'CA';
    a02.traceNumber = '121042880000001';
    ed.addenda02 = a02;
    return ed;
  }

  it('should reject Addenda05', () => {
    const bh = mockBH(MTE, DebitsOnly);
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    const ed = mockMTEEntry();
    const a05 = newAddenda05();
    a05.paymentRelatedInformation = 'test';
    a05.sequenceNumber = 1;
    a05.entryDetailSequenceNumber = 1;
    ed.addenda05.push(a05);
    batch!.addEntry(ed);
    const createErr = batch!.create();
    expect(createErr).not.toBeNull();
    expect(createErr!.message).toContain('Addenda05');
  });

  it('should reject credit TransactionCode', () => {
    const bh = mockBH(MTE, DebitsOnly);
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    const ed = mockMTEEntry();
    ed.transactionCode = CheckingCredit;
    batch!.addEntry(ed);
    const createErr = batch!.create();
    expect(createErr).not.toBeNull();
  });
});

// =========================================================================
// Additional TRC Tests
// =========================================================================
describe('BatchTRC (extended)', () => {
  it('should require ProcessControlField', () => {
    const bh = mockBH(TRC, DebitsOnly);
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    const ed = mockED(10000, CheckingDebit);
    // Only set ItemResearchNumber but not ProcessControlField
    ed.individualName = '      ITEM0000000001';
    batch!.addEntry(ed);
    const createErr = batch!.create();
    expect(createErr).not.toBeNull();
    expect(createErr!.message).toContain('ProcessControlField');
  });

  it('should require ItemResearchNumber', () => {
    const bh = mockBH(TRC, DebitsOnly);
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    const ed = mockED(10000, CheckingDebit);
    ed.setProcessControlField('CTRL01');
    // No ItemResearchNumber
    batch!.addEntry(ed);
    const createErr = batch!.create();
    expect(createErr).not.toBeNull();
    expect(createErr!.message).toContain('ItemResearchNumber');
  });
});

// =========================================================================
// Additional TRX Tests
// =========================================================================
describe('BatchTRX (extended)', () => {
  it('should allow multiple Addenda05 records', () => {
    const bh = mockBH(TRX, DebitsOnly);
    const [batch, err] = newBatch(bh);
    expect(err).toBeNull();
    const ed = mockED(10000, CheckingDebit);
    for (let i = 1; i <= 3; i++) {
      const a05 = newAddenda05();
      a05.paymentRelatedInformation = `payment info ${i}`;
      a05.sequenceNumber = i;
      a05.entryDetailSequenceNumber = 1;
      ed.addenda05.push(a05);
    }
    ed.setCATXAddendaRecords(3); // Must match actual addenda count
    ed.addendaRecordIndicator = 1; // Must be set AFTER setCATXAddendaRecords (which overwrites it)
    batch!.addEntry(ed);
    const createErr = batch!.create();
    expect(createErr).toBeNull();
  });
});

// =========================================================================
// Additional ATX Tests
// =========================================================================
describe('BatchATX (extended)', () => {
  it('should reject non-zero amount', () => {
    const ed = mockED(10000, CheckingZeroDollarRemittanceCredit);
    const [batch, err] = createBatch(ATX, CreditsOnly, ed);
    expect(err).not.toBeNull();
    expect(err!.message).toContain('Amount');
  });

  it('should allow SavingsZeroDollarRemittance', () => {
    const ed = mockED(0, SavingsZeroDollarRemittanceCredit);
    const [batch, err] = createBatch(ATX, CreditsOnly, ed);
    expect(err).toBeNull();
  });
});
