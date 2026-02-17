/**
 * Blended Call Cost Calculator
 *
 * Computes the full cost of a call by combining:
 *   1. Vapi cost (AI + STT + TTS + transport)
 *   2. Twilio telephony cost (per-minute, inbound vs outbound)
 *   3. Server/infrastructure cost (per-minute)
 *   4. Parlae markup (percentage on subtotal)
 *
 * Pricing rates are stored in the `platform_pricing` DB table and
 * fetched once per request (with a short in-memory cache).
 */

export interface PlatformPricingRates {
  twilioInboundPerMin: number;
  twilioOutboundPerMin: number;
  serverCostPerMin: number;
  markupPercent: number;
}

export interface BlendedCostBreakdown {
  /** Raw Vapi cost in dollars */
  vapiCost: number;
  /** Twilio telephony cost in dollars */
  twilioCost: number;
  /** Server/infra cost in dollars */
  serverCost: number;
  /** Sum of vapi + twilio + server before markup */
  subtotal: number;
  /** Markup amount in dollars */
  markup: number;
  /** Final blended cost in dollars */
  totalDollars: number;
  /** Final blended cost in cents (rounded) */
  totalCents: number;
}

/** Default rates used when no DB config is available */
export const DEFAULT_PRICING_RATES: PlatformPricingRates = {
  twilioInboundPerMin: 0.0085,
  twilioOutboundPerMin: 0.014,
  serverCostPerMin: 0.005,
  markupPercent: 30.0,
};

/**
 * Calculate the blended cost of a single call.
 *
 * @param vapiCostDollars  The `call.cost` value from Vapi (in dollars), or 0
 * @param durationSeconds  Call duration in seconds
 * @param callType         'inbound' or 'outbound' — determines Twilio rate
 * @param rates            Pricing rates from the PlatformPricing table
 */
export function calculateBlendedCost(
  vapiCostDollars: number,
  durationSeconds: number,
  callType: 'inbound' | 'outbound',
  rates: PlatformPricingRates,
): BlendedCostBreakdown {
  const durationMinutes = Math.max(durationSeconds / 60, 0);
  const vapiCost = Math.max(vapiCostDollars, 0);

  const twilioRate =
    callType === 'outbound'
      ? rates.twilioOutboundPerMin
      : rates.twilioInboundPerMin;

  const twilioCost = durationMinutes * twilioRate;
  const serverCost = durationMinutes * rates.serverCostPerMin;

  const subtotal = vapiCost + twilioCost + serverCost;
  const markup = subtotal * (rates.markupPercent / 100);
  const totalDollars = subtotal + markup;
  const totalCents = Math.round(totalDollars * 100);

  return {
    vapiCost: Math.round(vapiCost * 10000) / 10000,
    twilioCost: Math.round(twilioCost * 10000) / 10000,
    serverCost: Math.round(serverCost * 10000) / 10000,
    subtotal: Math.round(subtotal * 10000) / 10000,
    markup: Math.round(markup * 10000) / 10000,
    totalDollars: Math.round(totalDollars * 100) / 100,
    totalCents,
  };
}

// ---------------------------------------------------------------------------
// In-memory cache for platform pricing (avoids a DB query on every call log)
// ---------------------------------------------------------------------------
let cachedRates: PlatformPricingRates | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 60_000; // 60 seconds

/**
 * Fetch platform pricing rates with a 60-second in-memory cache.
 *
 * Accepts a Prisma-like client so this module stays independent of
 * the import path (`@kit/prisma` is only available in the app layer).
 */
export async function getPlatformPricing(
  prisma: { platformPricing: { findFirst: () => Promise<PlatformPricingRates | null> } },
): Promise<PlatformPricingRates> {
  const now = Date.now();

  if (cachedRates && now < cacheExpiry) {
    return cachedRates;
  }

  try {
    const row = await prisma.platformPricing.findFirst();
    if (row) {
      cachedRates = {
        twilioInboundPerMin: row.twilioInboundPerMin,
        twilioOutboundPerMin: row.twilioOutboundPerMin,
        serverCostPerMin: row.serverCostPerMin,
        markupPercent: row.markupPercent,
      };
      cacheExpiry = now + CACHE_TTL_MS;
      return cachedRates;
    }
  } catch {
    // DB not available — use defaults
  }

  return DEFAULT_PRICING_RATES;
}
