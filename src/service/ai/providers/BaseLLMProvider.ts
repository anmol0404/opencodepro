import { ILLMProvider, SearchSnippet } from '../types';
import { providerManager } from '../../provider/ProviderManager';

export class BaseLLMProvider implements ILLMProvider {
  private defaultModel: string;

  constructor(defaultModel?: string) {
    this.defaultModel = defaultModel || process.env.DEFAULT_MODEL || "minimax-m2.5-free";
  }

  /**
   * Robust JSON parsing logic borrowed and improved from price-oracle.
   * Prevents crashes if the AI hallucinates markdown or conversational text.
   */
  private parseAIResponse<T>(content: string): T | null {
    try {
      return JSON.parse(content) as T;
    } catch (e) {
      const jsonMatch = content.match(/```(?:json)?\n([\s\S]*?)\n```/) ||
        content.match(/```([\s\S]*?)```/) ||
        content.match(/(\{[\s\S]*\})/);

      if (jsonMatch && jsonMatch[1]) {
        try {
          return JSON.parse(jsonMatch[1]) as T;
        } catch (innerError) {
          if (jsonMatch[0]) {
            try { return JSON.parse(jsonMatch[0]) as T; } catch (thirdError) { }
          }
        }
      }
      return null;
    }
  }

  async extractStructuredData<T>(
    objective: string,
    snippets: SearchSnippet[],
    outputSchemaDescription: string
  ): Promise<T | null> {

    const itemsStr = snippets
      .map((r, i) => `[${i}] Title: ${r.title}\nSource: ${r.source || 'N/A'}\nSnippet: ${r.body}`)
      .join('\n\n');

    const systemPrompt = `You are an advanced data extraction engine.
Objective: ${objective}

Input Data: You will be provided with various search snippets or webpage text chunks.

Output Schema Requirement:
${outputSchemaDescription}

CRITICAL RULES:
1. Return ONLY a valid JSON object matching the requested schema.
2. Absolutely no conversational text, no pre-amble, and no explanations outside of the JSON fields.
3. If no relevant data is found in the snippets for a specific field, return null for that field.
4. Base your extraction strictly on the provided snippets.`;

    try {
      // Find the best provider available
      const providers = providerManager.getOrderedProviders({ requiresVision: false });
      if (providers.length === 0) throw new Error("No active providers available in ProviderManager");
      
      const providerName = providers[0];
      const model = providerManager.getBestModelForProvider(providerName, false) || this.defaultModel;

      const response: any = await providerManager.makeRequest(providerName, '/chat/completions', {
        method: 'POST',
        body: JSON.stringify({
          model: model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Here are the snippets:\n\n${itemsStr}` }
          ],
          response_format: { type: "json_object" }
        }),
        stream: false
      });

      const content = response.choices?.[0]?.message?.content || "";
      return this.parseAIResponse<T>(content);
      
    } catch (e) {
      console.error("[BaseLLMProvider] Network/Extraction Error:", e);
      return null;
    }
  }

  async evaluateContext<T>(
    topic: string,
    contextInfo: string[],
    outputSchemaDescription: string,
    guidelines: string
  ): Promise<T | null> {

    const systemPrompt = `You are a specialized analysis engine.
Topic/Focus: ${topic}

Operational Guidelines:
${guidelines}

Output Schema Requirement:
${outputSchemaDescription}

CRITICAL: Return ONLY valid JSON. No markdown wrappings unless required by schema.`;

    try {
      // Find the best provider available
      const providers = providerManager.getOrderedProviders({ requiresVision: false });
      if (providers.length === 0) throw new Error("No active providers available in ProviderManager");
      
      const providerName = providers[0];
      const model = providerManager.getBestModelForProvider(providerName, false) || this.defaultModel;

      const response: any = await providerManager.makeRequest(providerName, '/chat/completions', {
        method: 'POST',
        body: JSON.stringify({
          model: model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Context data to evaluate:\n${JSON.stringify(contextInfo)}` }
          ],
          response_format: { type: "json_object" }
        }),
        stream: false
      });

      const content = response.choices?.[0]?.message?.content || "";
      return this.parseAIResponse<T>(content);
      
    } catch (e) {
      console.error("[BaseLLMProvider] Valuation Error:", e);
      return null;
    }
  }
}
