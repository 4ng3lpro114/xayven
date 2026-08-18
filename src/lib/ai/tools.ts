import "server-only";
import { getPricingCatalogItemBySlug } from "@/lib/db/pricingCatalogStore";
import { resolveOfficialPrice } from "@/lib/pricing/resolveOfficialPrice";
import { withDisplayPrice } from "@/lib/pricing/displayPrice";
import type { AITool, AIToolCall } from "@/lib/ai/provider";
import type { PricingMarket, OfficialPriceSource } from "@/lib/pricing/market/types";
import type { Locale } from "@/lib/i18n/config";
import type { PricingType, PricingBillingInterval } from "@/lib/pricing/types";

/**
 * International Pricing Phase E — XAYVEN AI tool calling. The ONLY tool
 * that resolves a price. Everything it returns is produced by the same
 * server-side resolvers Web/Admin already use — resolveOfficialPrice()
 * (Phase B/C, market-aware) then withDisplayPrice() (Phase D, display-
 * currency-aware) — never a second pricing computation invented for AI.
 *
 * `itemSlug` is the ONLY parameter the model controls. `market` and
 * `displayCurrency` are resolved server-side in route.ts, BEFORE the
 * model is ever called, from the same resolveCommercialMarket()/
 * resolveDisplayCurrency() Web already uses — the model never receives
 * them as tool parameters and has no way to request a different market or
 * currency. This is structural, not a prompt instruction: the tool's own
 * JSON Schema below has no market/currency property to fill in.
 */
export const GET_OFFICIAL_PRICE_TOOL: AITool = {
  type: "function",
  function: {
    name: "get_official_price",
    description:
      "Returns the real, current official price of ONE XAYVEN web package or maintenance plan, already resolved for this visitor's commercial market and display currency by the server. You MUST call this before stating any price, discount amount, or monetary figure — never state a number from memory, from this system prompt, or from earlier in this conversation, since prices can change between turns.",
    parameters: {
      type: "object",
      properties: {
        itemSlug: {
          type: "string",
          description:
            "The slug of exactly one package or maintenance plan mentioned in the KNOWLEDGE section above, e.g. 'start', 'professional', 'business', 'custom', 'ecommerce', 'essential', 'growth', 'care-plus'.",
        },
      },
      required: ["itemSlug"],
      additionalProperties: false,
    },
  },
};

/**
 * The ONE shape get_official_price() ever returns to the model. Keeps
 * officialAmount/officialCurrency (what will actually be charged, from
 * resolveOfficialPrice() — never touched by display conversion) and
 * displayAmount/displayCurrency (the same price, possibly converted for
 * presentation, from withDisplayPrice()) as separate, explicitly-named
 * fields — never a single ambiguous "price" — so the system prompt can
 * force the model to say which one it's stating and why. `features` is
 * null (never a guessed/invented list) for the 5 web packages, since
 * PricingCatalogItem.features is genuinely empty for category="package"
 * — only maintenance plans carry real, structured feature data.
 */
export interface OfficialPriceToolResult {
  itemSlug: string;
  found: boolean;
  name: string | null;
  commercialMarket: { code: string; name: string } | null;
  officialAmount: number | null;
  officialCurrency: string | null;
  displayAmount: number | null;
  displayCurrency: string | null;
  /** true = displayAmount/displayCurrency ARE the official price, no
   *  conversion happened. false = displayAmount is a converted
   *  equivalent, never the exact amount that will be charged. null =
   *  no price to speak of (found=false, or officialAmount is null). */
  isOfficialCurrency: boolean | null;
  priceType: PricingType | null;
  billingInterval: PricingBillingInterval | null;
  source: OfficialPriceSource | null;
  effectiveAt: string | null;
  features: string[] | null;
}

export interface PriceToolContext {
  market: PricingMarket;
  displayCurrency: string;
  locale: Locale;
}

function notFoundResult(itemSlug: string): OfficialPriceToolResult {
  return {
    itemSlug,
    found: false,
    name: null,
    commercialMarket: null,
    officialAmount: null,
    officialCurrency: null,
    displayAmount: null,
    displayCurrency: null,
    isOfficialCurrency: null,
    priceType: null,
    billingInterval: null,
    source: null,
    effectiveAt: null,
    features: null,
  };
}

/**
 * Resolves one get_official_price call. Never throws — a malformed
 * `rawArguments` JSON string, a missing itemSlug, or an unknown/inactive
 * catalog item all degrade to `found: false`, matching this codebase's
 * "invalid input → a clean negative result, never crashes the visitor's
 * turn" discipline (same as resolveActivePromotion()/resolveActiveService()
 * in route.ts, and resolveOfficialPrice() itself).
 */
export async function executeGetOfficialPrice(
  rawArguments: string,
  context: PriceToolContext
): Promise<OfficialPriceToolResult> {
  let itemSlug = "";
  try {
    const parsed = JSON.parse(rawArguments) as { itemSlug?: unknown };
    if (typeof parsed.itemSlug === "string") itemSlug = parsed.itemSlug.trim();
  } catch {
    // Malformed arguments from the model — itemSlug stays "", handled as
    // not-found below, never thrown.
  }

  if (!itemSlug) return notFoundResult(itemSlug);

  const item = await getPricingCatalogItemBySlug(itemSlug);
  if (!item || !item.isActive) return notFoundResult(itemSlug);

  const official = await resolveOfficialPrice({ itemSlug, market: context.market.code });
  const display = await withDisplayPrice(official, context.displayCurrency);

  return {
    itemSlug,
    found: true,
    name: item.name,
    commercialMarket: { code: context.market.code, name: context.market.name },
    officialAmount: official.amount,
    officialCurrency: official.currency,
    displayAmount: display.amount,
    displayCurrency: display.currency,
    isOfficialCurrency: official.amount === null ? null : display.currency === official.currency,
    priceType: official.priceType,
    billingInterval: official.billingInterval,
    source: official.source,
    effectiveAt: official.effectiveAt,
    features: item.category === "maintenance" ? item.features[context.locale] : null,
  };
}

/**
 * Dispatches one tool call by name and returns its JSON-stringified
 * result — the exact string a `role:"tool"` message's `content` expects.
 * Today there is exactly one tool; an unknown name (a model hallucinating
 * a tool that doesn't exist) degrades to a clean error payload rather
 * than throwing, so one bad tool call can never crash the whole turn.
 */
export async function executeToolCall(toolCall: AIToolCall, context: PriceToolContext): Promise<string> {
  try {
    if (toolCall.function.name !== GET_OFFICIAL_PRICE_TOOL.function.name) {
      return JSON.stringify({ error: "unknown_tool", tool: toolCall.function.name });
    }
    const result = await executeGetOfficialPrice(toolCall.function.arguments, context);
    return JSON.stringify(result);
  } catch (error) {
    console.error("[ai/tools] get_official_price execution failed:", error);
    return JSON.stringify({ error: "tool_execution_failed" });
  }
}
