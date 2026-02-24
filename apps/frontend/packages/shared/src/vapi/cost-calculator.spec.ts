import {
  calculateBlendedCost,
  getPlatformPricing,
  DEFAULT_PRICING_RATES,
  type PlatformPricingRates,
} from './cost-calculator';

describe('cost-calculator', () => {
  describe('calculateBlendedCost', () => {
    const rates: PlatformPricingRates = {
      twilioInboundPerMin: 0.01,
      twilioOutboundPerMin: 0.02,
      serverCostPerMin: 0.005,
      markupPercent: 20,
    };

    it('returns zero cost for a zero-duration call with zero vapi cost', () => {
      const result = calculateBlendedCost(0, 0, 'inbound', rates);

      expect(result.vapiCost).toBe(0);
      expect(result.twilioCost).toBe(0);
      expect(result.serverCost).toBe(0);
      expect(result.subtotal).toBe(0);
      expect(result.markup).toBe(0);
      expect(result.totalDollars).toBe(0);
      expect(result.totalCents).toBe(0);
    });

    it('computes inbound call cost correctly', () => {
      const result = calculateBlendedCost(0.10, 60, 'inbound', rates);

      expect(result.vapiCost).toBe(0.10);
      expect(result.twilioCost).toBe(0.01); // 1 min * 0.01
      expect(result.serverCost).toBe(0.005); // 1 min * 0.005
      expect(result.subtotal).toBe(0.115); // 0.10 + 0.01 + 0.005
      expect(result.markup).toBe(0.023); // 0.115 * 0.20
      expect(result.totalDollars).toBe(0.14); // 0.138 rounded to 2 dp
      expect(result.totalCents).toBe(14);
    });

    it('computes outbound call cost correctly (higher twilio rate)', () => {
      const result = calculateBlendedCost(0.10, 60, 'outbound', rates);

      expect(result.twilioCost).toBe(0.02); // 1 min * 0.02
      expect(result.subtotal).toBe(0.125); // 0.10 + 0.02 + 0.005
    });

    it('scales linearly with duration', () => {
      const oneMin = calculateBlendedCost(0, 60, 'inbound', rates);
      const twoMin = calculateBlendedCost(0, 120, 'inbound', rates);

      expect(twoMin.twilioCost).toBeCloseTo(oneMin.twilioCost * 2, 4);
      expect(twoMin.serverCost).toBeCloseTo(oneMin.serverCost * 2, 4);
    });

    it('handles fractional seconds (e.g. 90 seconds = 1.5 minutes)', () => {
      const result = calculateBlendedCost(0, 90, 'inbound', rates);

      expect(result.twilioCost).toBeCloseTo(0.015, 4); // 1.5 * 0.01
      expect(result.serverCost).toBeCloseTo(0.0075, 4); // 1.5 * 0.005
    });

    it('clamps negative vapi cost to zero', () => {
      const result = calculateBlendedCost(-5, 60, 'inbound', rates);
      expect(result.vapiCost).toBe(0);
    });

    it('clamps negative duration to zero', () => {
      const result = calculateBlendedCost(0.10, -30, 'inbound', rates);

      expect(result.twilioCost).toBe(0);
      expect(result.serverCost).toBe(0);
      expect(result.vapiCost).toBe(0.10);
    });

    it('applies markup as a percentage of subtotal', () => {
      const zeroMarkup: PlatformPricingRates = { ...rates, markupPercent: 0 };
      const result = calculateBlendedCost(1, 60, 'inbound', zeroMarkup);

      expect(result.markup).toBe(0);
      expect(result.totalDollars).toBe(Math.round(result.subtotal * 100) / 100);
    });

    it('rounds totalCents to nearest integer', () => {
      const result = calculateBlendedCost(0.001, 1, 'inbound', rates);
      expect(Number.isInteger(result.totalCents)).toBe(true);
    });

    it('rounds intermediate values to 4 decimal places', () => {
      const result = calculateBlendedCost(0.123456789, 37, 'outbound', rates);

      const checkDecimals = (val: number) => {
        const str = val.toString();
        const parts = str.split('.');
        return !parts[1] || parts[1].length <= 4;
      };

      expect(checkDecimals(result.vapiCost)).toBe(true);
      expect(checkDecimals(result.twilioCost)).toBe(true);
      expect(checkDecimals(result.serverCost)).toBe(true);
      expect(checkDecimals(result.subtotal)).toBe(true);
      expect(checkDecimals(result.markup)).toBe(true);
    });

    it('uses default pricing rates values from the export', () => {
      expect(DEFAULT_PRICING_RATES.twilioInboundPerMin).toBe(0.0085);
      expect(DEFAULT_PRICING_RATES.twilioOutboundPerMin).toBe(0.014);
      expect(DEFAULT_PRICING_RATES.serverCostPerMin).toBe(0.005);
      expect(DEFAULT_PRICING_RATES.markupPercent).toBe(30);
    });
  });

  describe('getPlatformPricing', () => {
    async function freshModule() {
      jest.resetModules();
      return await import('./cost-calculator');
    }

    it('returns DB rates when available', async () => {
      const mod = await freshModule();
      const dbRates: PlatformPricingRates = {
        twilioInboundPerMin: 0.05,
        twilioOutboundPerMin: 0.08,
        serverCostPerMin: 0.01,
        markupPercent: 25,
      };

      const mockPrisma = {
        platformPricing: {
          findFirst: jest.fn().mockResolvedValue(dbRates),
        },
      };

      const result = await mod.getPlatformPricing(mockPrisma);

      expect(mockPrisma.platformPricing.findFirst).toHaveBeenCalled();
      expect(result).toEqual(dbRates);
    });

    it('returns defaults when DB returns null', async () => {
      const mod = await freshModule();
      const mockPrisma = {
        platformPricing: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
      };

      const result = await mod.getPlatformPricing(mockPrisma);
      expect(result).toEqual(mod.DEFAULT_PRICING_RATES);
    });

    it('returns defaults when DB throws', async () => {
      const mod = await freshModule();
      const mockPrisma = {
        platformPricing: {
          findFirst: jest.fn().mockRejectedValue(new Error('DB down')),
        },
      };

      const result = await mod.getPlatformPricing(mockPrisma);
      expect(result).toEqual(mod.DEFAULT_PRICING_RATES);
    });

    it('uses cached rates within TTL window', async () => {
      const mod = await freshModule();
      const dbRates: PlatformPricingRates = {
        twilioInboundPerMin: 0.03,
        twilioOutboundPerMin: 0.06,
        serverCostPerMin: 0.002,
        markupPercent: 15,
      };

      const mockPrisma = {
        platformPricing: {
          findFirst: jest.fn().mockResolvedValue(dbRates),
        },
      };

      await mod.getPlatformPricing(mockPrisma);
      await mod.getPlatformPricing(mockPrisma);

      expect(mockPrisma.platformPricing.findFirst).toHaveBeenCalledTimes(1);
    });
  });
});
