import { normalizeCountry } from './countries';

describe('normalizeCountry', () => {
  describe('2-letter ISO codes', () => {
    it('should normalize NL to Netherlands', () => {
      expect(normalizeCountry('NL')).toBe('Netherlands');
    });

    it('should normalize lowercase nl to Netherlands', () => {
      expect(normalizeCountry('nl')).toBe('Netherlands');
    });

    it('should normalize common country codes', () => {
      expect(normalizeCountry('DE')).toBe('Germany');
      expect(normalizeCountry('FR')).toBe('France');
      expect(normalizeCountry('US')).toBe('United States');
      expect(normalizeCountry('GB')).toBe('United Kingdom');
    });
  });

  describe('3-letter ISO codes', () => {
    it('should normalize NLD to Netherlands', () => {
      expect(normalizeCountry('NLD')).toBe('Netherlands');
    });

    it('should normalize lowercase nld to Netherlands', () => {
      expect(normalizeCountry('nld')).toBe('Netherlands');
    });

    it('should normalize common 3-letter codes', () => {
      expect(normalizeCountry('DEU')).toBe('Germany');
      expect(normalizeCountry('FRA')).toBe('France');
      expect(normalizeCountry('USA')).toBe('United States');
      expect(normalizeCountry('GBR')).toBe('United Kingdom');
    });

    it('should handle lowercase 3-letter codes', () => {
      expect(normalizeCountry('deu')).toBe('Germany');
      expect(normalizeCountry('fra')).toBe('France');
    });
  });

  describe('Full country names', () => {
    it('should normalize Netherlands', () => {
      expect(normalizeCountry('Netherlands')).toBe('Netherlands');
    });

    it('should normalize common country names', () => {
      expect(normalizeCountry('Germany')).toBe('Germany');
      expect(normalizeCountry('France')).toBe('France');
      expect(normalizeCountry('United States')).toBe('United States');
    });

    it('should handle case-insensitivity', () => {
      expect(normalizeCountry('netherlands')).toBe('Netherlands');
      expect(normalizeCountry('NETHERLANDS')).toBe('Netherlands');
      expect(normalizeCountry('NeThErLaNdS')).toBe('Netherlands');
    });
  });

  describe('Netherlands variants', () => {
    it('should normalize "The Netherlands"', () => {
      expect(normalizeCountry('The Netherlands')).toBe('Netherlands');
    });

    it('should normalize lowercase "the netherlands"', () => {
      expect(normalizeCountry('the netherlands')).toBe('Netherlands');
    });

    it('should normalize Holland', () => {
      expect(normalizeCountry('Holland')).toBe('Netherlands');
    });

    it('should normalize lowercase holland', () => {
      expect(normalizeCountry('holland')).toBe('Netherlands');
    });

    it('should normalize Dutch', () => {
      expect(normalizeCountry('Dutch')).toBe('Netherlands');
    });

    it('should normalize lowercase dutch', () => {
      expect(normalizeCountry('dutch')).toBe('Netherlands');
    });
  });

  describe('Whitespace handling', () => {
    it('should trim leading/trailing whitespace', () => {
      expect(normalizeCountry('  NL  ')).toBe('Netherlands');
      expect(normalizeCountry('\tDE\n')).toBe('Germany');
      expect(normalizeCountry('  Netherlands  ')).toBe('Netherlands');
    });

    it('should handle whitespace in variants', () => {
      expect(normalizeCountry('  The Netherlands  ')).toBe('Netherlands');
      expect(normalizeCountry('\tHolland\n')).toBe('Netherlands');
    });
  });

  describe('Edge cases', () => {
    it('should return Unknown for empty string', () => {
      expect(normalizeCountry('')).toBe('Unknown');
    });

    it('should return Unknown for null', () => {
      expect(normalizeCountry(null)).toBe('Unknown');
    });

    it('should return Unknown for undefined', () => {
      expect(normalizeCountry(undefined)).toBe('Unknown');
    });

    it('should return Unknown for whitespace only', () => {
      expect(normalizeCountry('   ')).toBe('Unknown');
      expect(normalizeCountry('\t\n')).toBe('Unknown');
    });

    it('should return Unknown for unmapped values', () => {
      expect(normalizeCountry('Narnia')).toBe('Unknown');
      expect(normalizeCountry('XYZ')).toBe('Unknown');
      expect(normalizeCountry('999')).toBe('Unknown');
    });
  });

  describe('Real-world geoIP scenarios', () => {
    it('should handle Amsterdam Netherlands from various APIs', () => {
      // ipinfo.io typically returns ISO2 codes
      expect(normalizeCountry('NL')).toBe('Netherlands');

      // Some APIs return 3-letter codes
      expect(normalizeCountry('NLD')).toBe('Netherlands');

      // Some older/different APIs might return full names
      expect(normalizeCountry('Netherlands')).toBe('Netherlands');
      expect(normalizeCountry('The Netherlands')).toBe('Netherlands');
    });

    it('should handle Lelystad/Soest Netherlands from various APIs', () => {
      // These cities have validated IP geolocation data
      expect(normalizeCountry('NL')).toBe('Netherlands');
      expect(normalizeCountry('NLD')).toBe('Netherlands');
      expect(normalizeCountry('Netherlands')).toBe('Netherlands');
    });

    it('should be consistent across multiple calls', () => {
      const inputs = [
        'NL',
        'nl',
        'NLD',
        'nld',
        'Netherlands',
        'netherlands',
        'The Netherlands',
        'the netherlands',
        'Holland',
        'holland',
      ];

      const expected = 'Netherlands';
      for (const input of inputs) {
        expect(normalizeCountry(input)).toBe(expected);
      }
    });
  });

  describe('No regression for other countries', () => {
    it('should still normalize other countries correctly', () => {
      const testCases: [string | undefined | null, string][] = [
        ['DE', 'Germany'],
        ['deu', 'Germany'],
        ['Germany', 'Germany'],
        ['germany', 'Germany'],
        ['US', 'United States'],
        ['usa', 'United States'],
        ['United States', 'United States'],
        ['GB', 'United Kingdom'],
        ['UK', 'United Kingdom'],
        ['gbr', 'United Kingdom'],
        ['FR', 'France'],
        ['fra', 'France'],
        ['JP', 'Japan'],
        ['jpn', 'Japan'],
        [null, 'Unknown'],
        [undefined, 'Unknown'],
        ['', 'Unknown'],
        ['ZZ', 'Unknown'],
      ];

      for (const [input, expected] of testCases) {
        expect(normalizeCountry(input)).toBe(expected, `Failed for input: ${JSON.stringify(input)}`);
      }
    });
  });
});
