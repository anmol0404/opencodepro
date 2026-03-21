import { searchAdapter } from "../search/SearchAdapter";
import { SerperProvider } from "../search/providers/SerperProvider";
import { aiResearchService } from "../ai/AIResearchService";
import { urlReader } from "../reader/UrlReader";
import { NewsAggregator, CategoryRequest, NewsStory } from "../news/NewsAggregator";
import fetch from "node-fetch";

const serperImageProvider = new SerperProvider();
const newsAggregator = new NewsAggregator();

export interface CurateOptions {
  query?: string; // Optional for backward compatibility
  category?: string; // NEW: Category-based curation
  systemPrompt: string;
  outputSchema: string;
  callbackUrl: string;
  trustedDomains?: string[];
  maxSources?: number;
  curationMetadata?: any;
}

export class CurationService {
  /**
   * Main entry point: Executes the research pipeline and calls the webhook
   */
  async curate(options: CurateOptions): Promise<any> {
    const { query, category, systemPrompt, outputSchema, callbackUrl, trustedDomains = [], maxSources = 5, curationMetadata } = options;

    // NEW: Category-based intelligent curation
    if (category) {
      return await this.curateByCategory(options);
    }

    // OLD: Fallback to query-based curation for backward compatibility
    if (!query) {
      throw new Error("Either 'query' or 'category' must be provided");
    }

    console.log(`[CurationEngine] Starting legacy query-based run: "${query}"`);
    return await this.legacyCurate(options);
  }

  /**
   * NEW: Intelligent category-based curation
   */
  private async curateByCategory(options: CurateOptions): Promise<any> {
    const { category, systemPrompt, outputSchema, callbackUrl, maxSources = 8, curationMetadata } = options;
    
    console.log(`[CurationEngine] Starting intelligent curation for category: ${category}`);

    try {
      // 1. Aggregate latest news from all APIs
      console.log(`[CurationEngine] Aggregating latest news...`);
      const latestNews = await newsAggregator.aggregateLatestNews();
      
      if (latestNews.length === 0) {
        throw new Error("No news stories found from any provider");
      }

      // 2. AI categorize all news
      console.log(`[CurationEngine] AI categorizing ${latestNews.length} stories...`);
      const categorizedNews = await newsAggregator.categorizeNews(latestNews);

      // 3. Select best story for requested category
      console.log(`[CurationEngine] Selecting best story for ${category}...`);
      const selectedStory = newsAggregator.selectBestStoryForCategory(categorizedNews, category!);
      
      if (!selectedStory) {
        throw new Error(`No suitable stories found for category: ${category}`);
      }

      console.log(`[CurationEngine] Selected story: "${selectedStory.title}"`);

      // 4. Deep research on selected story
      console.log(`[CurationEngine] Deep researching: "${selectedStory.title}"`);
      const researchQuery = selectedStory.title;
      const searchResults = await searchAdapter.executeSearch(researchQuery, { limit: maxSources + 2 });
      const topSources = searchResults.slice(0, maxSources);

      // 5. Deep reading of sources
      console.log(`[CurationEngine] Deep-reading ${topSources.length} sources...`);
      const sourceContents = await Promise.all(
        topSources.map(async (s) => {
          try {
            const page = await urlReader.read(s.link);
            const body = (page?.content || s.snippet).substring(0, 5000);
            return {
              title: s.title,
              url: s.link,
              body
            };
          } catch {
            return { title: s.title, url: s.link, body: s.snippet.substring(0, 5000) };
          }
        })
      );

      // 6. AI synthesis with original story context
      const contextPrompt = `You are writing about this specific breaking news story:

ORIGINAL STORY:
Title: ${selectedStory.title}
Summary: ${selectedStory.snippet}
Source: ${selectedStory.source}
Category: ${selectedStory.detectedCategory}

ADDITIONAL RESEARCH SOURCES PROVIDED BELOW.

${systemPrompt}

CRITICAL: Write about the SPECIFIC story mentioned above, using the additional sources for context and depth.`;

      const aiResult = await aiResearchService.evaluate<any>(
        contextPrompt,
        sourceContents.map(s => `SOURCE: ${s.url}\nCONTENT: ${s.body}`),
        outputSchema,
        "Write a comprehensive article about the specific news story. Use multiple blocks (headers, paragraphs, lists). Be factual and engaging."
      );

      if (!aiResult.data) {
        throw new Error("AI Synthesis failed to return data.");
      }

      // 7. Image handling - prefer original story image
      console.log(`[CurationEngine] Handling cover image...`);
      let coverImage = selectedStory.imageUrl || null;
      
      // If no image from original story, search for one
      if (!coverImage) {
        try {
          const searchQueryTitle = (aiResult.data.title || selectedStory.title).substring(0, 100);
          const images = await serperImageProvider.searchImages(searchQueryTitle, 3);
          if (images.length > 0) coverImage = images[0];
        } catch { /* ignore */ }
      }

      // Fallback to default
      if (!coverImage) {
        coverImage = "https://images.unsplash.com/photo-1504711434969-e33886168f5c?q=80&w=2070&auto=format&fit=crop";
      }

      const finalPayload = {
        ...aiResult.data,
        coverImage,
        curationMetadata: {
          ...curationMetadata,
          category: category,
          originalStory: {
            title: selectedStory.title,
            source: selectedStory.source,
            provider: selectedStory.provider
          },
          sourcesUsed: sourceContents.length,
          confidence: selectedStory.confidence,
          timestamp: new Date().toISOString()
        }
      };

      // 8. Deliver to webhook
      console.log(`[CurationEngine] Delivering to webhook: ${callbackUrl}`);
      const response = await fetch(callbackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(finalPayload)
      });

      if (!response.ok) {
        console.warn(`[CurationEngine] Webhook failed with status ${response.status}`);
      }

      console.log(`[CurationEngine] Successfully completed ${category} curation`);
      return finalPayload;

    } catch (error) {
      console.error(`[CurationEngine] Category curation error:`, (error as Error).message);
      throw error;
    }
  }

  /**
   * LEGACY: Original query-based curation for backward compatibility
   */
  private async legacyCurate(options: CurateOptions): Promise<any> {
    const { query, systemPrompt, outputSchema, callbackUrl, trustedDomains = [], maxSources = 5 } = options;

    console.log(`[CurationEngine] Starting legacy run for query: "${query}"`);

    try {
      // 1. Discovery
      const searchResults = await searchAdapter.executeSearch(query!, { limit: 10 });
      let filtered = searchResults;

      if (trustedDomains.length > 0) {
        filtered = searchResults.filter(r => 
          trustedDomains.some(td => r.source.toLowerCase().includes(td.toLowerCase()))
        );
      }
      
      const topSources = filtered.slice(0, maxSources);
      if (topSources.length === 0) {
        throw new Error("No valid sources found after filtering.");
      }

      // 2. Deep Reading
      console.log(`[CurationEngine] Deep-reading ${topSources.length} sources...`);
      const sourceContents = await Promise.all(
        topSources.map(async (s) => {
          try {
            const page = await urlReader.read(s.link);
            // Truncate to avoid context window issues (approx 1250 tokens per source)
            const body = (page?.content || s.snippet).substring(0, 5000); 
            return {
              title: s.title,
              url: s.link,
              body
            };
          } catch {
            return { title: s.title, url: s.link, body: s.snippet.substring(0, 5000) };
          }
        })
      );

      const aiResult = await aiResearchService.evaluate<any>(
        `Synthesize a detailed, professional article based on the provided sources. 
         FOLLOW CATEGORY RULES: ${systemPrompt}
         
         CRITICAL QUALITY RULES:
         1. Use MULTIPLE blocks in the 'blocks' array. 
         2. Minimum 1 header (H2), 3 detailed paragraphs, and 1 list.
         3. Ensure the content is structured logically and looks like a professionally edited long-form news piece.
         4. Never return just a single paragraph.`,
        sourceContents.map(s => `SOURCE: ${s.url}\nCONTENT: ${s.body}`),
        outputSchema,
        "Be factual and professional. The output MUST be a valid JSON object matching the schema exactly, with a RICH array of blocks."
      );

      if (!aiResult.data) {
        throw new Error("AI Synthesis failed to return data.");
      }

      // 4. Image Strategy (3-Tier)
      console.log(`[CurationEngine] Finding relevant cover image...`);
      let coverImage: string | null = null;
      
      // Tier 1: Search specifically for images using the synthesized title (if available)
      const searchQueryTitle = (aiResult.data.title || query!).substring(0, 100);
      try {
        const images = await serperImageProvider.searchImages(searchQueryTitle, 3);
        if (images.length > 0) coverImage = images[0];
      } catch { /* ignore */ }

      // Tier 2: Search result thumbnails
      if (!coverImage) {
        for (const s of topSources) {
          if ((s as any).imageUrl) {
            coverImage = (s as any).imageUrl;
            break;
          }
        }
      }

      // Tier 3: Default generic news image (Engine doesn't know Unsplash categories anymore to be generic)
      if (!coverImage) {
        coverImage = "https://images.unsplash.com/photo-1504711434969-e33886168f5c?q=80&w=2070&auto=format&fit=crop";
      }

      const finalPayload = {
        ...aiResult.data,
        coverImage,
        curationMetadata: {
          originalQuery: query,
          sourcesUsed: sourceContents.length,
          timestamp: new Date().toISOString()
        }
      };

      // 5. Deliver to Webhook
      console.log(`[CurationEngine] Delivering to webhook: ${callbackUrl}`);
      const response = await fetch(callbackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(finalPayload)
      });

      if (!response.ok) {
        console.warn(`[CurationEngine] Webhook failed with status ${response.status}`);
      }

      return finalPayload;

    } catch (error) {
      console.error(`[CurationEngine] Fatal Error:`, (error as Error).message);
      // We still try to notify if possible? For now just throw.
      throw error;
    }
  }
}

export const curationService = new CurationService();
