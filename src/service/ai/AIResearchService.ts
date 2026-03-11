import { ILLMProvider, SearchSnippet, AIResearchResult } from './types';
import { BaseLLMProvider } from './providers/BaseLLMProvider';
import { cacheService } from '../cache/CacheService';

export class AIResearchService {
  private provider: ILLMProvider;

  constructor(provider?: ILLMProvider) {
    // Inject custom provider or default to Base implementation
    this.provider = provider || new BaseLLMProvider();
  }

  /**
   * Perform structured extraction from raw text/snippets.
   * 
   * @param objective What are you trying to find? (e.g., "Find all product pricing features and their prices")
   * @param snippets Array of text bodies to search through
   * @param outputSchemaString Text description of the required JSON output (e.g., "{ prices: number[], summary: string }")
   */
  public async extract<T>(
    objective: string,
    snippets: SearchSnippet[],
    outputSchemaString: string
  ): Promise<AIResearchResult<T>> {
    const startTime = Date.now();
    
    // Check Cache first
    const cacheKey = cacheService.generateKey('extract', objective, snippets, outputSchemaString);
    const cached = await cacheService.get<AIResearchResult<T>>(cacheKey);
    if (cached !== null) {
      console.log(`[AIResearchService] Cache hit for extraction`);
      return cached;
    }

    if (snippets === null || snippets === undefined || snippets.length === 0) {
      return this.buildResult<T>(null, 0, 0, startTime, "No snippets provided");
    }

    // PROFESSIONAL GUARD: Token Management
    // We truncate each snippet to ~6000 chars to avoid hitting model limits
    const safeSnippets = snippets.map(s => ({
      ...s,
      body: s.body.length > 8000 ? s.body.substring(0, 8000) + "... [truncated]" : s.body
    }));

    try {
      const result = await this.provider.extractStructuredData<T>(objective, safeSnippets, outputSchemaString);
      
      const isSuccess = result !== null;
      const confidence = isSuccess ? 85 : 0;

      const finalResult = this.buildResult<T>(
        result, 
        confidence, 
        safeSnippets.length, 
        startTime, 
        isSuccess ? undefined : "LLM returned null or failed to parse JSON"
      );

      if (isSuccess) await cacheService.set(cacheKey, finalResult);
      return finalResult;
    } catch (error) {
       console.error("[AIResearchService] Fatal extraction error", error);
       return this.buildResult<T>(null, 0, snippets.length, startTime, "Fatal extraction check logs");
    }
  }

  /**
   * Evaluate a specific topic, sentiment, or verdict based on a list of context strings.
   * 
   * @param topic E.g., "Is Apple's new processor truly 10x faster?"
   * @param context Array of string facts or market data
   * @param outputSchemaString The JSON structure expected back
   * @param guidelines Specific rules the AI must follow when reaching a conclusion
   */
  public async evaluate<T>(
    topic: string,
    context: string[],
    outputSchemaString: string,
    guidelines: string
  ): Promise<AIResearchResult<T>> {
    const startTime = Date.now();
    
    try {
      const result = await this.provider.evaluateContext<T>(topic, context, outputSchemaString, guidelines);
      
      return this.buildResult<T>(
        result, 
        result ? 90 : 0, 
        context.length, 
        startTime, 
        result ? undefined : "Evaluation failed to return valid data"
      );
    } catch (error) {
       return this.buildResult<T>(null, 0, context.length, startTime, "Fatal evaluation error");
    }
  }

  private buildResult<T>(
    data: T | null, 
    confidenceScore: number, 
    sourcesUsed: number, 
    startTime: number, 
    errorMsg?: string
  ): AIResearchResult<T> {
    return {
      data,
      confidenceScore,
      metadata: {
        sourcesUsed,
        processingTimeMs: Date.now() - startTime,
        error: errorMsg
      }
    };
  }
}

// Export singleton instance for easy drop-in usage across the newsoin2 application
export const aiResearchService = new AIResearchService();
