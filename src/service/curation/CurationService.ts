import { searchAdapter } from "../search/SearchAdapter";
import { SerperProvider } from "../search/providers/SerperProvider";
import { aiResearchService } from "../ai/AIResearchService";
import { urlReader } from "../reader/UrlReader";
import fetch from "node-fetch";

const serperImageProvider = new SerperProvider();

export interface CurateOptions {
  query: string;
  systemPrompt: string;
  outputSchema: string;
  callbackUrl: string;
  trustedDomains?: string[];
  maxSources?: number;
}

export class CurationService {
  /**
   * Main entry point: Executes the research pipeline and calls the webhook
   */
  async curate(options: CurateOptions): Promise<any> {
    const { query, systemPrompt, outputSchema, callbackUrl, trustedDomains = [], maxSources = 5 } = options;

    console.log(`[CurationEngine] Starting run for query: "${query}"`);

    try {
      // 1. Discovery
      const searchResults = await searchAdapter.executeSearch(query, { limit: 10 });
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
      const searchQueryTitle = (aiResult.data.title || query).substring(0, 100);
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
