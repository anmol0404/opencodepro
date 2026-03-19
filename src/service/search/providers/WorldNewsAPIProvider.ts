import { ISearchProvider, SearchResult, SearchOptions } from '../types';
import { ApiKeyRoundRobin, getApiKeys } from '../ApiKeyManager';

/**
 * # 🌍 WORLD NEWS API PROVIDER
 * Implementation of ISearchProvider for worldnewsapi.com
 * Documentation: https://worldnewsapi.com/docs/
 */
export class WorldNewsAPIProvider implements ISearchProvider {
  name = 'World News API';
  private apiKeys: ApiKeyRoundRobin;

  constructor(key?: string) {
    this.apiKeys = new ApiKeyRoundRobin(
      getApiKeys(["WORLD_NEWS_API_KEYS", "WORLD_NEWS_API_KEY"], key)
    );
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    const apiKey = this.apiKeys.next();
    if (!apiKey) {
      console.warn("[WorldNewsAPI] No API key configured.");
      return [];
    }

    const limit = options?.limit || 10;
    const url = new URL("https://api.worldnewsapi.com/search-news");
    
    // Setup Search Parameters
    url.searchParams.append("api-key", apiKey);
    url.searchParams.append("text", query);
    url.searchParams.append("number", Math.min(limit, 100).toString());
    url.searchParams.append("language", "en");

    try {
      const response = await fetch(url.toString(), {
        method: "GET",
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`[WorldNewsAPI] HTTP Error ${response.status}: ${errorText}`);
        return [];
      }

      const data = await response.json();

      if (!data.news || !Array.isArray(data.news)) {
        console.warn("[WorldNewsAPI] Invalid response format", data);
        return [];
      }

      return data.news.map((item: any) => {
        let hostname = 'Unknown';
        try { 
          hostname = new URL(item.url).hostname.replace('www.', ''); 
        } catch {
          hostname = item.source_country || 'Unknown';
        }

        return {
          title: item.title,
          link: item.url,
          snippet: item.text || item.summary || item.title,
          source: hostname,
          imageUrl: item.image || null,
        } as SearchResult;
      });

    } catch (error) {
      console.error("[WorldNewsAPI] Network failure", error);
      return [];
    }
  }

  /**
   * Specifically fetch top news if needed.
   */
  async getTopNews(limit = 5): Promise<SearchResult[]> {
    return this.search("top news", { limit });
  }
}
