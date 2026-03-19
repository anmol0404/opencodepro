import { ISearchProvider, SearchResult, SearchOptions } from '../types';
import { ApiKeyRoundRobin, getApiKeys } from '../ApiKeyManager';

/**
 * # 📰 NEWSDATA PROVIDER
 * Implementation of ISearchProvider for newsdata.io
 * Documentation: https://newsdata.io/documentation
 */
export class NewsDataProvider implements ISearchProvider {
  name = 'NewsData';
  private apiKeys: ApiKeyRoundRobin;

  constructor(key?: string) {
    this.apiKeys = new ApiKeyRoundRobin(
      getApiKeys(["NEWSDATA_API_KEYS", "NEWSDATA_API_KEY"], key)
    );
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    const apiKey = this.apiKeys.next();
    if (!apiKey) {
      console.warn("[NewsData] No API key configured.");
      return [];
    }

    const limit = options?.limit || 10;
    const url = new URL("https://newsdata.io/api/1/latest");
    
    // Setup Search Parameters
    url.searchParams.append("apikey", apiKey);
    url.searchParams.append("q", query);
    url.searchParams.append("language", "en");

    try {
      const response = await fetch(url.toString(), {
        method: "GET",
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`[NewsData] HTTP Error ${response.status}: ${errorText}`);
        return [];
      }

      const data = await response.json();

      if (!data.results || !Array.isArray(data.results)) {
        console.warn("[NewsData] Invalid response format", data);
        return [];
      }

      // NewsData.io results are in the 'results' field
      return data.results.slice(0, limit).map((item: any) => {
        let hostname = 'Unknown';
        try { 
          hostname = new URL(item.link).hostname.replace('www.', ''); 
        } catch {
          hostname = item.source_id || 'Unknown';
        }

        return {
          title: item.title,
          link: item.link,
          snippet: item.description || item.content || item.title,
          source: hostname,
          imageUrl: item.image_url || null,
        } as SearchResult;
      });

    } catch (error) {
      console.error("[NewsData] Network failure", error);
      return [];
    }
  }

  /**
   * Fetch news with specific categories if needed.
   */
  async getNewsByCategory(category: string, limit = 5): Promise<SearchResult[]> {
    const apiKey = this.apiKeys.next();
    if (!apiKey) return [];

    const url = new URL("https://newsdata.io/api/1/latest");
    url.searchParams.append("apikey", apiKey);
    url.searchParams.append("category", category);
    url.searchParams.append("language", "en");

    try {
      const response = await fetch(url.toString());
      if (!response.ok) return [];
      
      const data = await response.json();
      if (!data.results) return [];

      return data.results.slice(0, limit).map((item: any) => ({
        title: item.title,
        link: item.link,
        snippet: item.description || item.content || item.title,
        source: item.source_id || 'Unknown',
        imageUrl: item.image_url,
      }));
    } catch {
      return [];
    }
  }
}
