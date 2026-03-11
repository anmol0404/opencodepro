export interface SearchSnippet {
  title: string;
  body: string;
  source?: string;
  url?: string;
}

export interface AIResearchResult<T> {
  data: T | null;
  confidenceScore: number; // 0 to 100
  metadata: {
    sourcesUsed: number;
    processingTimeMs?: number;
    error?: string;
  };
}

export interface ILLMProvider {
  /**
   * Generic structured data extraction from snippets.
   * @param objective What the AI should try to achieve (e.g., "Find the release date")
   * @param snippets The raw context/search results
   * @param outputSchemaDescription A string describing the exact JSON structure expected back
   */
  extractStructuredData<T>(
    objective: string,
    snippets: SearchSnippet[],
    outputSchemaDescription: string
  ): Promise<T | null>;

  /**
   * Evaluates or analyzes a given context based on provided guidelines.
   * Useful for verdict generation, sentiment analysis, etc.
   */
  evaluateContext<T>(
    topic: string,
    contextInfo: string[],
    outputSchemaDescription: string,
    guidelines: string
  ): Promise<T | null>;
}
