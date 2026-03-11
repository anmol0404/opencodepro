export const PRICING: Record<string, { input: number; output: number }> = {
  'openai': { input: 2.50, output: 10.00 },
  'anthropic': { input: 3.00, output: 15.00 },
  'google': { input: 0.35, output: 1.05 },
  'mistral': { input: 2.00, output: 6.00 },
  'groq': { input: 0.59, output: 0.79 },
  'cerebras': { input: 0.00, output: 0.00 },
  'together': { input: 0.20, output: 0.20 },
  'deepseek': { input: 0.14, output: 0.28 },
  'nvidia': { input: 0.65, output: 2.20 },
  'opencode': { input: 0.50, output: 1.50 },
  'aitools': { input: 0.10, output: 0.30 },
  'default': { input: 0.50, output: 1.50 }
};

export function getPricing(provider: string) {
  return PRICING[provider] || PRICING['default'];
}

export function calculateCost(usage: { prompt_tokens?: number; completion_tokens?: number }, provider: string): number {
  const pricing = getPricing(provider);
  const inputCost = ((usage.prompt_tokens || 0) / 1000000) * pricing.input;
  const outputCost = ((usage.completion_tokens || 0) / 1000000) * pricing.output;
  return inputCost + outputCost;
}
