// Ported from moov-io/ach converters_test.go
import { describe, it, expect } from 'vitest';
import { Converters } from '../src/utils/converters';

describe('Converters', () => {
  const c = new Converters();

  describe('alphaField', () => {
    it('short: left justified space filled', () => {
      const result = c.alphaField('ABC123', 10);
      expect(result).toBe('ABC123    ');
    });

    it('short: handles apostrophes', () => {
      const answer = c.alphaField("Returned per ODFI's Request", 44);
      const expected = "Returned per ODFI's Request                 ";
      expect([...expected].length).toBe(44);
      expect(answer).toBe(expected);
    });

    it('long: left justified and sliced to max', () => {
      const result = c.alphaField('abcdEFGH123', 10);
      expect(result).toBe('abcdEFGH12');
    });
  });

  describe('numericField', () => {
    it('short: zero padding and right justified', () => {
      const result = c.numericField(12345, 10);
      expect(result).toBe('0000012345');
    });

    it('long: right justified and sliced to max length', () => {
      expect(c.numericField(123456, 5)).toBe('23456');
      expect(c.numericField(999991, 5)).toBe('99991');
      expect(c.numericField(999981, 5)).toBe('99981');
      expect(c.numericField(654321, 5)).toBe('54321');
    });
  });

  describe('parseNumField', () => {
    it('handles zero and spaces in number conversion', () => {
      const result = c.parseNumField(' 012345');
      expect(result).toBe(12345);
    });
  });

  describe('parseStringField', () => {
    it('handles spaces in string conversion', () => {
      const result = c.parseStringField(' 012345');
      expect(result).toBe('012345');
    });
  });

  describe('parseStringFieldWithOpts', () => {
    it('preserves spaces with opt true', () => {
      const opts = { preserveSpaces: true };
      const result = c.parseStringFieldWithOpts(' 012345', opts);
      expect(result).toBe(' 012345');
    });

    it('does not preserve spaces with opt false', () => {
      const opts = { preserveSpaces: false };
      const result = c.parseStringFieldWithOpts(' 012345', opts);
      expect(result).toBe('012345');
    });
  });

  describe('stringField', () => {
    it('short: zero padding and right justified', () => {
      const result = c.stringField('123456', 8);
      expect(result).toBe('00123456');
    });

    it('long: sliced to max length', () => {
      const result = c.stringField('1234567899', 8);
      expect(result).toBe('12345678');
    });

    it('exact: exact match', () => {
      const result = c.stringField('123456789', 9);
      expect(result).toBe('123456789');
    });
  });

  describe('leastSignificantDigits', () => {
    const tests = [
      { input: 123, max: 2, want: 23 },
      { input: 123, max: 3, want: 123 },
      { input: 123, max: 5, want: 123 },
      { input: 12345678912, max: 10, want: 2345678912 },
      { input: 99, max: 0, want: 0 },
    ];

    for (const tt of tests) {
      it(`leastSignificantDigits(${tt.input}, ${tt.max}) = ${tt.want}`, () => {
        expect(c.leastSignificantDigits(tt.input, tt.max)).toBe(tt.want);
      });
    }
  });

  describe('UTF8 truncation', () => {
    it('handles ASCII strings', () => {
      expect(c.alphaField('John Doe', 15)).toBe('John Doe       ');
      expect(c.stringField('John Doe', 15)).toBe('0000000John Doe');
    });

    it('handles UTF-8 strings', () => {
      expect(c.alphaField('Testée Samples', 15)).toBe('Testée Samples ');
      expect(c.stringField('Testée Samples', 15)).toBe('0Testée Samples');
    });

    it('handles UTF-8 truncation', () => {
      expect(c.alphaField('Testée Samples01', 15)).toBe('Testée Samples0');
      expect(c.stringField('Testée Samples01', 15)).toBe('Testée Samples0');
    });
  });
});
