import { entryAddendaPos } from './constants.js';
import type { ValidateOpts } from './validateOpts.js';
import { Converters } from './utils/converters.js';
import { Validators } from './utils/validators.js';
import {
  fieldError,
  ErrConstructor,
  ErrAddendaTypeCode,
  ErrAddenda99ReturnCode,
} from './errors/index.js';

export interface ReturnCode {
  code: string;
  reason: string;
  description: string;
}

const returnCodeDict: Map<string, ReturnCode> = new Map();

function initReturnCodeDict(): void {
  const codes: ReturnCode[] = [
    { code: 'R01', reason: 'Insufficient Funds', description: 'Available balance is not sufficient to cover the dollar value of the debit entry' },
    { code: 'R02', reason: 'Account Closed', description: 'Previously active account has been closed by customer or RDFI' },
    { code: 'R03', reason: 'No Account/Unable to Locate Account', description: 'Account number structure is valid and passes editing process, but does not correspond to individual or is not an open account' },
    { code: 'R04', reason: 'Invalid Account Number', description: 'Account number structure not valid; entry may fail check digit validation or may contain an incorrect number of digits.' },
    { code: 'R05', reason: 'Improper Debit to Consumer Account', description: 'A CCD, CTX, or CBR debit entry was transmitted to a Consumer Account of the Receiver and was not authorized by the Receiver' },
    { code: 'R06', reason: "Returned per ODFI's Request", description: 'ODFI has requested RDFI to return the ACH entry (optional to RDFI - ODFI indemnifies RDFI)' },
    { code: 'R07', reason: 'Authorization Revoked by Customer', description: 'Consumer, who previously authorized ACH payment, has revoked authorization from Originator' },
    { code: 'R08', reason: 'Payment Stopped', description: 'Receiver of a recurring debit transaction has stopped payment to a specific ACH debit.' },
    { code: 'R09', reason: 'Uncollected Funds', description: 'Sufficient book or ledger balance exists to satisfy dollar value of the transaction, but the dollar value of transaction is in process of collection' },
    { code: 'R10', reason: 'Customer Advises Originator is Not Known to Receiver and/or Originator is Not Authorized by Receiver to Debit Receiver\'s Account', description: 'The receiver does not know the Originator\'s identity and/or has not authorized the Originator to debit.' },
    { code: 'R11', reason: 'Customer Advises Entry Not in Accordance with the Terms of the Authorization', description: 'The Originator and Receiver have a relationship, and an authorization to debit exists, but there is an error or defect in the payment' },
    { code: 'R12', reason: 'Branch Sold to Another DFI', description: 'Financial institution receives entry destined for an account at a branch that has been sold to another financial institution.' },
    { code: 'R13', reason: 'RDFI not qualified to participate', description: 'Financial institution does not receive commercial ACH entries' },
    { code: 'R14', reason: 'Representative payee deceased or unable to continue in that capacity', description: 'The representative payee authorized to accept entries on behalf of a beneficiary is either deceased or unable to continue in that capacity' },
    { code: 'R15', reason: 'Beneficiary or bank account holder', description: '(Other than representative payee) deceased' },
    { code: 'R16', reason: 'Bank account frozen', description: 'Funds in bank account are unavailable due to action by RDFI or legal order' },
    { code: 'R17', reason: 'File Record Edit Criteria/Entry with Invalid Account Number Initiated Under Questionable Circumstances', description: 'Field(s) cannot be processed by RDFI' },
    { code: 'R18', reason: 'Improper effective entry date', description: 'Entries have been presented prior to the first available processing window for the effective date.' },
    { code: 'R19', reason: 'Amount field error', description: 'Improper formatting of the amount field' },
    { code: 'R20', reason: 'Non-payment bank account', description: 'Entry destined for non-payment bank account defined by reg.' },
    { code: 'R21', reason: 'Invalid company ID number', description: 'The company ID information not valid (normally CIE entries)' },
    { code: 'R22', reason: 'Invalid individual ID number', description: 'Individual id used by receiver is incorrect (CIE entries)' },
    { code: 'R23', reason: 'Credit entry refused by receiver', description: 'Receiver returned entry because minimum or exact amount not remitted' },
    { code: 'R24', reason: 'Duplicate entry', description: 'RDFI has received a duplicate entry' },
    { code: 'R25', reason: 'Addenda error', description: 'Improper formatting of the addenda record information' },
    { code: 'R26', reason: 'Mandatory field error', description: 'Improper information in one of the mandatory fields' },
    { code: 'R27', reason: 'Trace number error', description: 'Original entry trace number is not valid for return entry' },
    { code: 'R28', reason: 'Transit routing number check digit error', description: 'Check digit for the transit routing number is incorrect' },
    { code: 'R29', reason: 'Corporate customer advises not authorized', description: 'RDFI has been notified by corporate receiver that debit entry of originator is not authorized' },
    { code: 'R30', reason: 'RDFI not participant in check truncation program', description: 'Financial institution not participating in automated check safekeeping application' },
    { code: 'R31', reason: 'Permissible return entry (CCD and CTX only)', description: 'RDFI has been notified by the ODFI that it agrees to accept a CCD or CTX return entry' },
    { code: 'R32', reason: 'RDFI non-settlement', description: 'RDFI is not able to settle the entry' },
    { code: 'R33', reason: 'Return of XCK entry', description: 'RDFI determines at its sole discretion to return an XCK entry' },
    { code: 'R34', reason: 'Limited participation RDFI', description: 'RDFI participation has been limited by a federal or state supervisor' },
    { code: 'R35', reason: 'Return of improper debit entry', description: 'ACH debit not permitted for use with the CIE standard entry class code' },
    { code: 'R36', reason: 'Return of improper credit entry', description: 'ACH credit entries are not permitted for use with ARC, BOC, POP, RCK, TEL, and XCK.' },
    { code: 'R37', reason: 'Source Document Presented for Payment (Adjustment Entry)', description: 'The source document to which an ARC, BOC or POP entry relates has been presented for payment.' },
    { code: 'R38', reason: 'Stop Payment on Source Document (Adjustment Entry)', description: 'A stop payment has been placed on the source document to which the ARC or BOC entry relates.' },
    { code: 'R39', reason: 'Improper Source Document', description: 'The RDFI has determined the source document used for the ARC, BOC or POP entry is improper.' },
    { code: 'R40', reason: 'Return of ENR Entry by Federal Government Agency (ENR Only)', description: "This return reason code may only be used to return ENR entries and is at the federal Government Agency's Sole discretion" },
    { code: 'R41', reason: 'Invalid Transaction Code (ENR only)', description: 'Either the Transaction Code does not conform to the ACH Record Format Specifications or it is not appropriate' },
    { code: 'R42', reason: 'Routing Number/Check Digit Error (ENR Only)', description: 'The Routing Number and the Check Digit is either not valid or does not conform to Modulus 10' },
    { code: 'R43', reason: 'Invalid DFI Account Number (ENR Only)', description: "The Receiver's account number must include at least one alphameric character." },
    { code: 'R44', reason: 'Invalid Individual ID Number/Identification Number (ENR only)', description: "The Individual ID Number does not match a corresponding ID number in the Federal Government Agency's records." },
    { code: 'R45', reason: 'Invalid Individual Name/Company Name (ENR only)', description: 'The name does not match a corresponding name or fails to include at least one alphameric character.' },
    { code: 'R46', reason: 'Invalid Representative Payee Indicator (ENR Only)', description: "The Representative Payee Indicator Code has been omitted or it is not consistent with the Federal Government Agency's records." },
    { code: 'R47', reason: 'Duplicate Enrollment (ENR Only)', description: 'The Entry is a duplicate of an Automated Enrollment Entry previously initiated by a DFI.' },
    { code: 'R50', reason: 'State Law Affecting RCK Acceptance', description: 'RDFI is located in a state that has not adopted Revised Article 4 of the UCC' },
    { code: 'R51', reason: 'Item Related to RCK Entry is Ineligible or RCK Entry is Improper', description: 'The item to which the RCK entry relates was not eligible' },
    { code: 'R52', reason: 'Stop Payment on Item (Adjustment Entry)', description: 'A stop payment has been placed on the item to which the RCK entry relates.' },
    { code: 'R53', reason: 'Item and RCK Entry Presented for Payment (Adjustment Entry)', description: 'Both the RCK entry and check have been presented for payment.' },
    { code: 'R61', reason: 'Misrouted Return', description: 'The financial institution preparing the Return Entry has placed the incorrect Routing Number.' },
    { code: 'R62', reason: 'Return of Erroneous or Reversing Debt', description: "The Originator's/ODFI's use of the reversal process resulted in an unintended credit to the Receiver." },
    { code: 'R67', reason: 'Duplicate Return', description: 'The ODFI has received more than one Return for the same Entry.' },
    { code: 'R68', reason: 'Untimely Return', description: 'The Return Entry has not been sent within the time frame established by these Rules.' },
    { code: 'R69', reason: 'Field Error(s)', description: 'One or more of the field requirements are incorrect.' },
    { code: 'R70', reason: 'Permissible Return Entry Not Accepted/Return Not Requested by ODFI', description: 'The ODFI has not agreed to accept the Entry or has not requested the return of the Entry.' },
    { code: 'R71', reason: 'Misrouted Dishonored Return', description: 'The financial institution preparing the dishonored Return Entry has placed the incorrect Routing Number.' },
    { code: 'R72', reason: 'Untimely Dishonored Return', description: 'The dishonored Return Entry has not been sent within the designated time frame.' },
    { code: 'R73', reason: 'Timely Original Return', description: 'The RDFI is certifying that the original Return Entry was sent within the time frame designated in these Rules.' },
    { code: 'R74', reason: 'Corrected Return', description: 'The RDFI is correcting a previous Return Entry that was dishonored using Return Reason Code R69.' },
    { code: 'R75', reason: 'Return Not a Duplicate', description: 'The Return Entry was not a duplicate of an Entry previously returned by the RDFI.' },
    { code: 'R76', reason: 'No Errors Found', description: 'The original Return Entry did not contain the errors indicated by the ODFI.' },
    { code: 'R77', reason: 'Non-Acceptance of R62 Dishonored Return', description: 'The RDFI returned the Erroneous Entry and the related Reversing Entry.' },
    { code: 'R80', reason: 'IAT Entry Coding Error', description: 'The IAT Entry is being returned due to one or more coding conditions.' },
    { code: 'R81', reason: 'Non-Participant in IAT Program', description: 'The IAT Entry is being returned because the Gateway does not have an agreement.' },
    { code: 'R82', reason: 'Invalid Foreign Receiving DFI Identification', description: 'The reference used to identify the Foreign Receiving DFI is invalid.' },
    { code: 'R83', reason: 'Foreign Receiving DFI Unable to Settle', description: 'The IAT Entry is being returned due to settlement problems in the foreign payment system.' },
    { code: 'R84', reason: 'Entry Not Processed by Gateway', description: 'The Entry has not been processed and is being returned at the Gateway\'s discretion.' },
    { code: 'R85', reason: 'Incorrectly Coded Outbound International Payment', description: 'The Entry bears an SEC Code that lacks information required by the Gateway for OFAC compliance.' },
    { code: 'R90', reason: "Entry Returned Due to RDFI's Sanctions Compliance Obligations", description: 'The RDFI/Gateway has determined that the Entry must be returned to comply with its sanctions compliance obligations.' },
  ];
  for (const c of codes) {
    returnCodeDict.set(c.code, c);
  }
}
initReturnCodeDict();

export function lookupReturnCode(code: string): ReturnCode | null {
  return returnCodeDict.get(code.toUpperCase()) ?? null;
}

/**
 * Addenda99 is used for Return entries.
 */
export class Addenda99 {
  id = '';
  typeCode = '99';
  returnCode = '';
  originalTrace = '';
  dateOfDeath = '';
  originalDFI = '';
  addendaInformation = '';
  traceNumber = '';
  lineNumber = 0;

  private converters = new Converters();
  private validators = new Validators();
  validateOpts?: ValidateOpts;

  parse(record: string): void {
    const runes = [...record];
    if (runes.length !== 94) return;

    // 1 Always "7"
    // 2-3 TypeCode "99"
    this.typeCode = runes.slice(1, 3).join('');
    // 4-6 ReturnCode
    this.returnCode = runes.slice(3, 6).join('');
    // 7-21 OriginalTrace
    this.originalTrace = runes.slice(6, 21).join('').trim();
    // 22-27 DateOfDeath (YYMMDD) or blank
    this.dateOfDeath = this.validators.validateSimpleDate(runes.slice(21, 27).join(''));
    // 28-35 OriginalDFI
    this.originalDFI = this.converters.parseStringField(runes.slice(27, 35).join(''));
    // 36-79 AddendaInformation
    this.addendaInformation = runes.slice(35, 79).join('');
    // 80-94 TraceNumber
    this.traceNumber = runes.slice(79, 94).join('').trim();
  }

  setValidation(opts: ValidateOpts | undefined): void {
    this.validateOpts = opts;
  }

  string(): string {
    return (
      entryAddendaPos +
      this.typeCode +
      this.returnCode +
      this.originalTraceField() +
      this.dateOfDeathField() +
      this.originalDFIField() +
      this.addendaInformationField() +
      this.traceNumberField()
    );
  }

  validate(): Error | null {
    if (this.typeCode === '') {
      return fieldError('TypeCode', ErrConstructor, this.typeCode);
    }
    if (this.typeCode !== '99') {
      return fieldError('TypeCode', ErrAddendaTypeCode, this.typeCode);
    }
    if (!this.validateOpts?.customReturnCodes) {
      if (!returnCodeDict.has(this.returnCode)) {
        return fieldError('ReturnCode', ErrAddenda99ReturnCode, this.returnCode);
      }
    }
    return null;
  }

  returnCodeField(): ReturnCode | null {
    return returnCodeDict.get(this.returnCode) ?? null;
  }

  originalTraceField(): string { return this.converters.stringField(this.originalTrace, 15); }

  dateOfDeathField(): string {
    if (this.dateOfDeath === '') {
      return this.converters.alphaField('', 6);
    }
    return this.converters.formatSimpleDate(this.dateOfDeath);
  }

  originalDFIField(): string { return this.converters.stringField(this.originalDFI, 8); }
  addendaInformationField(): string { return this.converters.alphaField(this.addendaInformation, 44); }
  traceNumberField(): string { return this.converters.stringField(this.traceNumber, 15); }

  // IAT helpers
  iatPaymentAmount(s: string): void { this.addendaInformation = this.converters.stringField(s, 10); }
  iatAddendaInformation(s: string): void { this.addendaInformation += this.converters.alphaField(s, 34); }
}

export function newAddenda99(): Addenda99 {
  return new Addenda99();
}
