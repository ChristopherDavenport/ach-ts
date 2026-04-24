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

/** TaxAmount represents a single tax amount with its type */
export interface TaxAmount {
  /** AmountCents is the amount in cents */
  amountCents: string;
  /** AmountType is the tax information type ID (e.g., "1", "2", "T", "S", "P", "I") */
  amountType: string;
}

/**
 * TXP represents a Tax Payment addenda parsed from PaymentRelatedInformation
 * of an Addenda05 record. TXP is not a NACHA standard addenda type, but rather
 * a specific format for tax payment information within existing Addenda05 records.
 */
export interface TXP {
  /** TaxIdentificationNumber is the taxpayer's identification number */
  taxIdentificationNumber: string;
  /** TaxPaymentTypeCode indicates the type of tax payment */
  taxPaymentTypeCode: string;
  /** Date represents the tax period or payment date (YYMMDD or YYYYMMDD) */
  date: string;
  /** TaxAmounts is the list of tax amounts with their types */
  taxAmounts: TaxAmount[];
  /** TaxpayerVerification is the verification information */
  taxpayerVerification: string;
}

/** ErrInvalidTXPCharacter is returned when TXP contains invalid characters */
export const ErrInvalidTXPCharacter = new Error('invalid TXP character');

/** ErrInvalidTXPFormat is returned when the TXP format is invalid */
export const ErrInvalidTXPFormat = new Error('invalid TXP format');

/** TXPPrefix is the required prefix for TXP addenda records */
export const TXPPrefix = 'TXP*';

function isNumeric(s: string): boolean {
  if (s === '') return false;
  for (const ch of s) {
    if (ch < '0' || ch > '9') return false;
  }
  return true;
}

function validateTXPCharacters(s: string): Error | null {
  for (const r of s) {
    if (r === '\n' || r === '\r' || r === '\t') {
      return ErrInvalidTXPCharacter;
    }
    if ((r >= 'A' && r <= 'Z') || (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9')) {
      continue;
    }
    switch (r) {
      case ' ':
      case '*':
      case '\\':
      case '>':
      case '-':
      case '.':
      case '/':
      case ':':
        continue;
      default:
        return ErrInvalidTXPCharacter;
    }
  }
  return null;
}

/**
 * ParseTXP parses a TXP-formatted PaymentRelatedInformation string.
 *
 * Expected format: TXP*tax_id*tax_type*date*type1*amount1*...*verification\
 * The total TXP addenda should be limited to 80 bytes.
 */
export function parseTXP(paymentInfo: string): [TXP | null, Error | null] {
  if (paymentInfo === '') {
    return [null, ErrInvalidTXPFormat];
  }

  if (!paymentInfo.startsWith(TXPPrefix)) {
    return [null, ErrInvalidTXPFormat];
  }

  // Validate 80-byte limit for TXP addenda
  if ([...paymentInfo].length > 80) {
    return [null, ErrInvalidTXPFormat];
  }

  // Remove the TXP prefix for parsing
  let content = paymentInfo.slice(TXPPrefix.length).trim();

  // Remove backslash terminator if present
  if (content.endsWith('\\')) {
    content = content.slice(0, -1);
  }

  // Split by asterisk delimiter
  const parts = content.split('*');
  if (parts.length < 5) {
    // Minimum: tax_id*tax_type*date*amount_type*amount_cents
    return [null, ErrInvalidTXPFormat];
  }

  // Validate allowed characters
  const charErr = validateTXPCharacters(paymentInfo);
  if (charErr) {
    return [null, charErr];
  }

  const txp: TXP = {
    taxIdentificationNumber: '',
    taxPaymentTypeCode: '',
    date: '',
    taxAmounts: [],
    taxpayerVerification: '',
  };

  txp.taxIdentificationNumber = parts[0];
  if (txp.taxIdentificationNumber === '') {
    return [null, ErrInvalidTXPFormat];
  }

  txp.taxPaymentTypeCode = parts[1];
  if (txp.taxPaymentTypeCode === '') {
    return [null, ErrInvalidTXPFormat];
  }

  txp.date = parts[2];
  if (txp.date === '') {
    return [null, ErrInvalidTXPFormat];
  }
  if (txp.date.length !== 6 && txp.date.length !== 8) {
    return [null, ErrInvalidTXPFormat];
  }
  if (!isNumeric(txp.date)) {
    return [null, ErrInvalidTXPFormat];
  }

  // Parse amount pairs sequentially
  let i = 3;
  while (i < parts.length) {
    // Check if we have at least 2 more parts for an amount pair
    if (i + 1 >= parts.length) {
      break;
    }

    // Check if the current part is empty (indicates delimiter)
    if (parts[i] === '') {
      // We've hit a delimiter, look for verification after empty parts
      let j = i;
      while (j < parts.length && parts[j] === '') {
        j++;
      }
      if (j < parts.length) {
        txp.taxpayerVerification = parts[j];
      }
      break;
    }

    // Check if the next part is empty (indicates end of amount pairs)
    if (parts[i + 1] === '') {
      let j = i + 1;
      while (j < parts.length && parts[j] === '') {
        j++;
      }
      if (j < parts.length) {
        txp.taxpayerVerification = parts[j];
      }
      break;
    }

    // We have a valid amount pair
    const taxAmount: TaxAmount = {
      amountType: parts[i],
      amountCents: parts[i + 1],
    };

    if (!isNumeric(taxAmount.amountCents)) {
      return [null, ErrInvalidTXPFormat];
    }

    txp.taxAmounts.push(taxAmount);
    i += 2;
  }

  // If we didn't find verification through delimiter detection,
  // check if there's a single remaining part after parsing amount pairs
  if (txp.taxpayerVerification === '' && i < parts.length) {
    txp.taxpayerVerification = parts[i];
  }

  // Validate that we have at least one amount
  if (txp.taxAmounts.length === 0) {
    return [null, ErrInvalidTXPFormat];
  }

  return [txp, null];
}

/**
 * txpString serializes a TXP object into a TXP-formatted string.
 * Format: TXP*tax_id*tax_type*date*type1*amount1*...*verification\
 */
export function txpString(txp: TXP): string {
  let result = TXPPrefix;
  result += txp.taxIdentificationNumber;
  result += '*';
  result += txp.taxPaymentTypeCode;
  result += '*';
  result += txp.date;

  for (const taxAmount of txp.taxAmounts) {
    result += '*';
    result += taxAmount.amountType;
    result += '*';
    result += taxAmount.amountCents;
  }

  if (txp.taxpayerVerification !== '') {
    result += '*';
    result += txp.taxpayerVerification;
  }

  result += '\\';
  return result;
}

/** IsTXPFormat checks if a PaymentRelatedInformation string follows TXP format */
export function isTXPFormat(paymentInfo: string): boolean {
  const [, err] = parseTXP(paymentInfo);
  return err === null;
}
