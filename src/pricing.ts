// ─────────────────────────────────────────────────────────────────────────────
//  Pricing — fetches real-time per-token costs from the LiteLLM proxy's
//  /model/info endpoint and exposes helpers for cost estimation.
//
//  Lifecycle:
//    loadPricing()   — call once at startup (non-fatal if offline)
//    getCost()       — compute cost for a given model + token counts
//    formatCost()    — format a dollar amount for display
// ─────────────────────────────────────────────────────────────────────────────

export interface ModelPricing {
  inputCostPerToken: number;
  outputCostPerToken: number;
}

export interface CostBreakdown {
  inputCost: number;
  outputCost: number;
  totalCost: number;
}

// In-memory cache: model name → per-token rates
const pricingMap = new Map<string, ModelPricing>();
let loaded = false;

// ── Fetch from LiteLLM proxy ──────────────────────────────────────────────────

interface LiteLLMModelInfo {
  model_name: string;
  model_info?: {
    input_cost_per_token?: number;
    output_cost_per_token?: number;
  };
}

interface LiteLLMModelInfoResponse {
  data: LiteLLMModelInfo[];
}

/**
 * Fetches pricing from BASE_URL/../model/info (LiteLLM proxy endpoint).
 * Silently no-ops if the endpoint is unavailable — cost display just shows "unknown".
 */
export async function loadPricing(): Promise<void> {
  const baseUrl = process.env.BASE_URL?.trim();
  if (!baseUrl) return;

  const url = `${baseUrl.replace(/\/$/, '')}/model/info`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.API_KEY ?? ''}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return;

    const json = (await res.json()) as LiteLLMModelInfoResponse;
    for (const entry of json.data ?? []) {
      const { input_cost_per_token, output_cost_per_token } = entry.model_info ?? {};
      if (input_cost_per_token != null && output_cost_per_token != null) {
        pricingMap.set(entry.model_name, {
          inputCostPerToken: input_cost_per_token,
          outputCostPerToken: output_cost_per_token,
        });
      }
    }
    loaded = true;
  } catch {
    // Offline or proxy unavailable — costs will show as unknown
  }
}

// ── Public helpers ────────────────────────────────────────────────────────────

/** Returns true if pricing was successfully loaded from the proxy. */
export function isPricingLoaded(): boolean {
  return loaded;
}

/** Returns the pricing entry for a model, or undefined if not in the map. */
export function getPricing(model: string): ModelPricing | undefined {
  return pricingMap.get(model);
}

/**
 * Computes cost for a given model and token counts.
 * Returns null if no pricing data is available for that model.
 */
export function getCost(
  model: string,
  promptTokens: number,
  completionTokens: number,
): CostBreakdown | null {
  const pricing = getPricing(model);
  if (!pricing) return null;

  const inputCost = promptTokens * pricing.inputCostPerToken;
  const outputCost = completionTokens * pricing.outputCostPerToken;
  return { inputCost, outputCost, totalCost: inputCost + outputCost };
}

/**
 * Formats a dollar amount for display.
 * Uses more decimal places for very small amounts to avoid showing $0.0000.
 */
export function formatCost(dollars: number): string {
  if (dollars === 0) return '$0.00';
  if (dollars < 0.0001) return `$${dollars.toFixed(8)}`;
  if (dollars < 0.01)   return `$${dollars.toFixed(6)}`;
  if (dollars < 1)      return `$${dollars.toFixed(4)}`;
  return `$${dollars.toFixed(2)}`;
}
