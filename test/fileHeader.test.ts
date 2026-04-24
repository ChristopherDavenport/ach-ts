// Ported from moov-io/ach fileHeader_test.go
import { describe, it, expect } from 'vitest';
import { FileHeader, newFileHeader } from '../src/fileHeader';

function mockFileHeader(): FileHeader {
  const fh = newFileHeader();
  fh.immediateDestination = '231380104';
  fh.immediateOrigin = '121042882';
  // Tomorrow's date in YYMMDD
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const yy = String(tomorrow.getFullYear() % 100).padStart(2, '0');
  const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
  const dd = String(tomorrow.getDate()).padStart(2, '0');
  fh.fileCreationDate = `${yy}${mm}${dd}`;
  fh.immediateDestinationName = 'Federal Reserve Bank';
  fh.immediateOriginName = 'My Bank Name';
  return fh;
}

describe('FileHeader', () => {
  it('mock validates', () => {
    const fh = mockFileHeader();
    expect(fh.validate()).toBeNull();
    expect(fh.immediateDestination).toBe('231380104');
    expect(fh.immediateOrigin).toBe('121042882');
    expect(fh.immediateDestinationName).toBe('Federal Reserve Bank');
    expect(fh.immediateOriginName).toBe('My Bank Name');
  });

  describe('parse', () => {
    it('parses a known file header line', () => {
      const line = '101 076401251 0764012511807291511Q094101achdestname            companyname                    ';
      const fh = newFileHeader();
      fh.parse(line);

      expect(fh.immediateDestinationField()).toBe(' 076401251');
      expect(fh.immediateOriginField()).toBe(' 076401251');
      expect(fh.fileCreationDateField()).toBe('180729');
      expect(fh.fileCreationTimeField()).toBe('1511');
      expect(fh.fileIDModifier).toBe('Q');
      expect(fh.formatCode).toBe('1');
      expect(fh.immediateDestinationNameField()).toBe('achdestname            ');
      expect(fh.immediateOriginNameField()).toBe('companyname            ');
      expect(fh.referenceCodeField()).toBe('        ');
    });

    it('round-trips string → parse → string', () => {
      const line = '101 076401251 0764012511807291511A094101achdestname            companyname                    ';
      const fh = newFileHeader();
      fh.parse(line);
      expect(fh.string()).toBe(line);
    });
  });

  describe('ImmediateOrigin field formatting', () => {
    it('space + routing number', () => {
      const fh = newFileHeader();
      fh.immediateOrigin = ' 123456789';
      expect(fh.immediateOriginField()).toBe(' 123456789');
    });

    it('9-digit routing number gets space prefix', () => {
      const fh = newFileHeader();
      fh.immediateOrigin = '123456789';
      expect(fh.immediateOriginField()).toBe(' 123456789');
    });

    it('bypass origin validation with 10-char value', () => {
      const fh = newFileHeader();
      fh.setValidation({ bypassOriginValidation: true });
      fh.immediateOrigin = '1234567899';
      expect(fh.immediateOriginField()).toBe('1234567899');
    });
  });

  describe('ImmediateDestination field formatting', () => {
    it('no change for space-prefixed', () => {
      const fh = newFileHeader();
      fh.immediateDestination = ' 123456789';
      expect(fh.immediateDestinationField()).toBe(' 123456789');
    });

    it('9-digit gets space appended', () => {
      const fh = newFileHeader();
      fh.immediateDestination = '123456789';
      expect(fh.immediateDestinationField()).toBe(' 123456789');
    });

    it('bypass destination validation with 10-char value', () => {
      const fh = newFileHeader();
      fh.setValidation({ bypassDestinationValidation: true });
      fh.immediateDestination = '1234567899';
      expect(fh.immediateDestinationField()).toBe('1234567899');
    });
  });

  describe('validation', () => {
    it('rejects invalid FileIDModifier (non-uppercase)', () => {
      const fh = mockFileHeader();
      fh.fileIDModifier = 'a';
      const err = fh.validate();
      expect(err).not.toBeNull();
      expect(err!.message).toContain('FileIDModifier');
    });

    it('rejects FileIDModifier with wrong length', () => {
      const fh = mockFileHeader();
      fh.fileIDModifier = 'AA';
      const err = fh.validate();
      expect(err).not.toBeNull();
      expect(err!.message).toContain('FileIDModifier');
    });

    it('rejects non-alphanumeric ImmediateDestinationName', () => {
      const fh = mockFileHeader();
      fh.immediateDestinationName = 'Big ®$$ Bank';
      const err = fh.validate();
      expect(err).not.toBeNull();
      expect(err!.message).toContain('ImmediateDestinationName');
    });

    it('rejects non-alphanumeric ImmediateOriginName', () => {
      const fh = mockFileHeader();
      fh.immediateOriginName = 'Bigger ®$$ Bank';
      const err = fh.validate();
      expect(err).not.toBeNull();
      expect(err!.message).toContain('ImmediateOriginName');
    });

    it('rejects non-alphanumeric ReferenceCode', () => {
      const fh = mockFileHeader();
      fh.referenceCode = '®';
      const err = fh.validate();
      expect(err).not.toBeNull();
      expect(err!.message).toContain('ReferenceCode');
    });

    it('rejects empty ImmediateDestination', () => {
      const fh = mockFileHeader();
      fh.immediateDestination = '';
      const err = fh.validate();
      expect(err).not.toBeNull();
      expect(err!.message).toContain('ImmediateDestination');
    });

    it('rejects empty ImmediateOrigin', () => {
      const fh = mockFileHeader();
      fh.immediateOrigin = '';
      const err = fh.validate();
      expect(err).not.toBeNull();
      expect(err!.message).toContain('ImmediateOrigin');
    });

    it('rejects empty FileIDModifier', () => {
      const fh = mockFileHeader();
      fh.fileIDModifier = '';
      const err = fh.validate();
      expect(err).not.toBeNull();
      expect(err!.message).toContain('FileIDModifier');
    });

    it('rejects empty FileCreationDate', () => {
      const fh = mockFileHeader();
      fh.fileCreationDate = '';
      const err = fh.validate();
      expect(err).not.toBeNull();
      expect(err!.message).toContain('FileCreationDate');
    });

    it('rejects invalid ImmediateDestination routing length', () => {
      const fh = mockFileHeader();
      fh.immediateDestination = '198387';
      const err = fh.validate();
      expect(err).not.toBeNull();
      expect(err!.message).toContain('invalid routing number length');
    });

    it('rejects invalid ImmediateDestination checksum', () => {
      const fh = mockFileHeader();
      fh.immediateDestination = '121042880';
      const err = fh.validate();
      expect(err).not.toBeNull();
      expect(err!.message).toContain('routing number checksum mismatch');
    });

    it('rejects invalid ImmediateOrigin with RequireABAOrigin', () => {
      const fh = mockFileHeader();
      fh.immediateOrigin = '123456781';
      fh.setValidation({ requireABAOrigin: true });
      const err = fh.validate();
      expect(err).not.toBeNull();
      expect(err!.message).toContain('routing number checksum mismatch');
    });

    it('rejects all zeros ImmediateOrigin', () => {
      const fh = mockFileHeader();
      fh.immediateOrigin = '0000000000';
      const err = fh.validate();
      expect(err).not.toBeNull();
    });

    it('allows bypass of origin validation', () => {
      const fh = mockFileHeader();
      fh.immediateOrigin = '0000000000';
      const err = fh.validateWith({ bypassOriginValidation: true });
      expect(err).toBeNull();
    });

    it('allows AllowMissingFileHeader to bypass field inclusion', () => {
      const fh = newFileHeader();
      fh.immediateDestination = '';
      fh.immediateOrigin = '';
      fh.setValidation({
        allowMissingFileHeader: true,
        bypassOriginValidation: true,
        bypassDestinationValidation: true,
      });
      // The Go test only checks fieldInclusion passes
      const err = fh.validate();
      expect(err).toBeNull();
    });
  });

  describe('setValidation', () => {
    it('accepts undefined', () => {
      const fh = mockFileHeader();
      fh.setValidation(undefined);
      expect(fh.validateOpts).toBeUndefined();
    });

    it('accepts empty opts', () => {
      const fh = mockFileHeader();
      fh.setValidation({});
      expect(fh.validateOpts).toEqual({});
    });
  });
});
