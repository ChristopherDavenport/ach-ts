// Licensed to The Moov Authors under one or more contributor
// license agreements. See the NOTICE file distributed with
// this work for additional information regarding copyright
// ownership. The Moov Authors licenses this file to you under
// the Apache License, Version 2.0 (the "License"); you may
// not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied.  See the License for the
// specific language governing permissions and limitations
// under the License.

// First position of all Record Types. These codes are uniquely assigned to
// the first byte of each row in a file.
export const fileHeaderPos = '1';
export const batchHeaderPos = '5';
export const entryDetailPos = '6';
export const entryAddendaPos = '7';
export const batchControlPos = '8';
export const fileControlPos = '9';

// RecordLength character count of each line representing a letter in a file
export const RecordLength = 94;

// lineLength is used for field formatting limits
export const lineLength = 94;

// SEC (Standard Entry Class) Codes
/** ACK ACH Payment Acknowledgment */
export const ACK = 'ACK';
/** ADV Automated Accounting Advice */
export const ADV = 'ADV';
/** ARC Accounts Receivable Entry */
export const ARC = 'ARC';
/** ATX Financial EDI Acknowledgment */
export const ATX = 'ATX';
/** BOC Back Office Conversion Entry */
export const BOC = 'BOC';
/** CCD Corporate Credit or Debit Entry */
export const CCD = 'CCD';
/** CIE Customer Initiated Entry */
export const CIE = 'CIE';
/** COR Notification of Change or Refused Notification of Change */
export const COR = 'COR';
/** CTX Corporate Trade Exchange */
export const CTX = 'CTX';
/** DNE Death Notification Entry */
export const DNE = 'DNE';
/** ENR Automated Enrollment Entry */
export const ENR = 'ENR';
/** IAT International ACH Transaction */
export const IAT = 'IAT';
/** MTE Machine Transfer Entry */
export const MTE = 'MTE';
/** POP Point of Purchase Entry */
export const POP = 'POP';
/** POS Point of Sale Entry */
export const POS = 'POS';
/** PPD Prearranged Payment and Deposit Entry */
export const PPD = 'PPD';
/** RCK Re-presented Check Entry */
export const RCK = 'RCK';
/** SHR Shared Network Transaction */
export const SHR = 'SHR';
/** TEL Telephone Initiated Entry */
export const TEL = 'TEL';
/** TRC Check Truncation Entry */
export const TRC = 'TRC';
/** TRX Check Truncation Entries Exchange */
export const TRX = 'TRX';
/** WEB Internet-Initiated/Mobile Entry */
export const WEB = 'WEB';
/** XCK Destroyed Check Entry */
export const XCK = 'XCK';

// IAT Corrected Data
export const IATCOR = 'IATCOR';

// ServiceClassCode values for BatchHeader and BatchControl
/** MixedDebitsAndCredits indicates a batch can have debit and credit ACH entries */
export const MixedDebitsAndCredits = 200;
/** CreditsOnly indicates a batch can only have credit ACH entries */
export const CreditsOnly = 220;
/** DebitsOnly indicates a batch can only have debit ACH entries */
export const DebitsOnly = 225;
/** AutomatedAccountingAdvices indicates ADV batch type */
export const AutomatedAccountingAdvices = 280;

// TransactionCode Values

// Checking Account
/** CheckingCredit is a credit to the receiver's checking account */
export const CheckingCredit = 22;
/** CheckingReturnNOCCredit is a return that credits the receiver's checking account */
export const CheckingReturnNOCCredit = 21;
/** CheckingPrenoteCredit is a pre-notification of a credit to the receiver's checking account */
export const CheckingPrenoteCredit = 23;
/** CheckingZeroDollarRemittanceCredit is a zero dollar remittance data credit to checking */
export const CheckingZeroDollarRemittanceCredit = 24;
/** CheckingDebit is a debit to the receivers checking account */
export const CheckingDebit = 27;
/** CheckingReturnNOCDebit is a return that debits the receiver's checking account */
export const CheckingReturnNOCDebit = 26;
/** CheckingPrenoteDebit is a pre-notification of a debit to the receiver's checking account */
export const CheckingPrenoteDebit = 28;
/** CheckingZeroDollarRemittanceDebit is a zero dollar remittance data debit to checking */
export const CheckingZeroDollarRemittanceDebit = 29;

// Savings Account
/** SavingsCredit is a credit to the receiver's savings account */
export const SavingsCredit = 32;
/** SavingsReturnNOCCredit is a return that credits the receiver's savings account */
export const SavingsReturnNOCCredit = 31;
/** SavingsPrenoteCredit is a pre-notification of a credit to savings */
export const SavingsPrenoteCredit = 33;
/** SavingsZeroDollarRemittanceCredit is a zero dollar remittance data credit to savings */
export const SavingsZeroDollarRemittanceCredit = 34;
/** SavingsDebit is a debit to the receivers savings account */
export const SavingsDebit = 37;
/** SavingsReturnNOCDebit is a return that debits the receiver's savings account */
export const SavingsReturnNOCDebit = 36;
/** SavingsPrenoteDebit is a pre-notification of a debit to savings */
export const SavingsPrenoteDebit = 38;
/** SavingsZeroDollarRemittanceDebit is a zero dollar remittance data debit to savings */
export const SavingsZeroDollarRemittanceDebit = 39;

// General Ledger Account
/** GLCredit is a credit to the receiver's general ledger (GL) account */
export const GLCredit = 42;
/** GLReturnNOCCredit is a return that credits the GL account */
export const GLReturnNOCCredit = 41;
/** GLPrenoteCredit is a pre-notification of a credit to GL */
export const GLPrenoteCredit = 43;
/** GLZeroDollarRemittanceCredit is a zero dollar remittance data credit to GL */
export const GLZeroDollarRemittanceCredit = 44;
/** GLDebit is a debit to the receiver's GL account */
export const GLDebit = 47;
/** GLReturnNOCDebit is a return that debits the GL account */
export const GLReturnNOCDebit = 46;
/** GLPrenoteDebit is a pre-notification of a debit to GL */
export const GLPrenoteDebit = 48;
/** GLZeroDollarRemittanceDebit is a zero dollar remittance data debit to GL */
export const GLZeroDollarRemittanceDebit = 49;

// Loan Account
/** LoanCredit is a credit to the receiver's loan account */
export const LoanCredit = 52;
/** LoanReturnNOCCredit is a return that credits the loan account */
export const LoanReturnNOCCredit = 51;
/** LoanPrenoteCredit is a pre-notification of a credit to loan */
export const LoanPrenoteCredit = 53;
/** LoanZeroDollarRemittanceCredit is a zero dollar remittance data credit to loan */
export const LoanZeroDollarRemittanceCredit = 54;
/** LoanDebit is a debit (Reversals Only) to the receiver's loan account */
export const LoanDebit = 55;
/** LoanReturnNOCDebit is a return that debits the loan account */
export const LoanReturnNOCDebit = 56;

// ADV Transaction Codes (Accounting Records for ADV Files only)
/** CreditForDebitsOriginated is a credit for ACH debits originated */
export const CreditForDebitsOriginated = 81;
/** DebitForCreditsOriginated is a debit for ACH credits originated */
export const DebitForCreditsOriginated = 82;
/** CreditForCreditsReceived is a credit for ACH credits received */
export const CreditForCreditsReceived = 83;
/** DebitForDebitsReceived is a debit for ACH debits received */
export const DebitForDebitsReceived = 84;
/** CreditForCreditsRejected is a credit for ACH credits in Rejected batches */
export const CreditForCreditsRejected = 85;
/** DebitForDebitsRejectedBatches is a debit for ACH debits in Rejected batches */
export const DebitForDebitsRejectedBatches = 86;
/** CreditSummary is a summary credit for respondent ACH activity */
export const CreditSummary = 87;
/** DebitSummary is a summary debit for respondent ACH activity */
export const DebitSummary = 88;

// Category constants
/** CategoryForward defines the entry as being sent to the receiving institution */
export const CategoryForward = 'Forward';
/** CategoryReturn defines the entry as being a return */
export const CategoryReturn = 'Return';
/** CategoryNOC defines the entry as being a notification of change */
export const CategoryNOC = 'NOC';
/** CategoryDishonoredReturn defines the entry as being a dishonored return */
export const CategoryDishonoredReturn = 'DishonoredReturn';
/** CategoryDishonoredReturnContested defines the entry as a contested dishonored return */
export const CategoryDishonoredReturnContested = 'DishonoredReturnContested';

// Nacha limits
/** NachaEntryAmountLimit is the maximum amount allowed for an entry (10 digits) */
export const NachaEntryAmountLimit = 9_999_999_999;
/** NachaBatchDebitCreditLimit is the maximum for batch debit/credit total (12 digits) */
export const NachaBatchDebitCreditLimit = 999_999_999_999;
/** NachaFileDebitCreditLimit is the maximum for file debit/credit total (12 digits) */
export const NachaFileDebitCreditLimit = 999_999_999_999;

/** NACHAFileLineLimit is the maximum number of lines in a NACHA file */
export const NACHAFileLineLimit = 10_000;

// Offset account types
export type OffsetAccountType = 'checking' | 'savings';
export const OffsetChecking: OffsetAccountType = 'checking';
export const OffsetSavings: OffsetAccountType = 'savings';
