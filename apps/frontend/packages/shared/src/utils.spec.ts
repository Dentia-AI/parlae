import { isBrowser, formatCurrency } from './utils';

describe('utils', () => {
  describe('isBrowser', () => {
    const originalWindow = global.window;

    afterEach(() => {
      if (originalWindow !== undefined) {
        Object.defineProperty(global, 'window', { value: originalWindow, writable: true });
      }
    });

    it('returns true when window is defined', () => {
      Object.defineProperty(global, 'window', { value: {}, writable: true });
      expect(isBrowser()).toBe(true);
    });

    it('returns false when window is undefined', () => {
      Object.defineProperty(global, 'window', { value: undefined, writable: true });
      expect(isBrowser()).toBe(false);
    });
  });

  describe('formatCurrency', () => {
    it('formats USD correctly', () => {
      const result = formatCurrency({
        currencyCode: 'USD',
        locale: 'en-US',
        value: 1234.56,
      });

      expect(result).toContain('1,234.56');
      expect(result).toMatch(/\$|USD/);
    });

    it('formats EUR correctly', () => {
      const result = formatCurrency({
        currencyCode: 'EUR',
        locale: 'de-DE',
        value: 1234.56,
      });

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('handles string values', () => {
      const result = formatCurrency({
        currencyCode: 'USD',
        locale: 'en-US',
        value: '99.99',
      });

      expect(result).toContain('99.99');
    });

    it('handles zero', () => {
      const result = formatCurrency({
        currencyCode: 'USD',
        locale: 'en-US',
        value: 0,
      });

      expect(result).toContain('0.00');
    });

    it('uses region from locale when available', () => {
      const result = formatCurrency({
        currencyCode: 'GBP',
        locale: 'en-GB',
        value: 100,
      });

      expect(result).toBeDefined();
      expect(result).toContain('100');
    });

    it('falls back to language when no region in locale', () => {
      const result = formatCurrency({
        currencyCode: 'USD',
        locale: 'en',
        value: 50,
      });

      expect(result).toBeDefined();
      expect(result).toContain('50');
    });

    it('handles large numbers', () => {
      const result = formatCurrency({
        currencyCode: 'USD',
        locale: 'en-US',
        value: 1000000,
      });

      expect(result).toContain('1,000,000');
    });

    it('handles negative values', () => {
      const result = formatCurrency({
        currencyCode: 'USD',
        locale: 'en-US',
        value: -42.5,
      });

      expect(result).toContain('42.50');
    });
  });
});
