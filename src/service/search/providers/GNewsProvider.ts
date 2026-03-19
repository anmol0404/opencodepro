import { ISearchProvider, SearchResult, SearchOptions } from '../types';
import { ApiKeyRoundRobin, getApiKeys } from '../ApiKeyManager';

/**
 * # 📰 GNEWS PROVIDER
 * Implementation of ISearchProvider for gnews.io
 * Documentation: https://gnews.io/docs/v4
 */
export class GNewsProvider implements ISearchProvider {
  name = 'GNews';
  private apiTokens: ApiKeyRoundRobin;

  constructor(token?: string) {
    this.apiTokens = new ApiKeyRoundRobin(
      getApiKeys(["GNEWS_API_TOKENS", "GNEWS_API_TOKEN"], token)
    );
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    const apiToken = this.apiTokens.next();
    if (!apiToken) {
      console.warn("[GNews] No API token configured.");
      return [];
    }

    const limit = options?.limit || 10;
    const url = new URL("https://gnews.io/api/v4/search");
    
    // Setup Search Parameters
    url.searchParams.append("token", apiToken);
    url.searchParams.append("q", query);
    url.searchParams.append("max", Math.min(limit, 100).toString());
    url.searchParams.append("lang", "en"); // Default to English

    try {
      const response = await fetch(url.toString(), {
        method: "GET",
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`[GNews] HTTP Error ${response.status}: ${errorText}`);
        return [];
      }

      const data = await response.json();

      if (!data.articles || !Array.isArray(data.articles)) {
        console.warn("[GNews] Invalid response format", data);
        return [];
      }

      return data.articles.map((item: any) => {
        let hostname = 'Unknown';
        try { 
          hostname = new URL(item.url).hostname.replace('www.', ''); 
        } catch {
          hostname = item.source?.name || 'Unknown';
        }

        return {
          title: item.title,
          link: item.url,
          snippet: item.description || item.content,
          source: hostname,
          imageUrl: item.image || null,
        } as SearchResult;
      });

    } catch (error) {
      console.error("[GNews] Network failure", error);
      return [];
    }
  }

  /**
   * Fetch top headlines specifically if needed.
   */
  async getTopHeadlines(category?: string, limit = 5): Promise<SearchResult[]> {
    const apiToken = this.apiTokens.next();
    if (!apiToken) return [];

    const url = new URL("https://gnews.io/api/v4/top-headlines");
    url.searchParams.append("token", apiToken);
    if (category) url.searchParams.append("category", category);
    url.searchParams.append("max", limit.toString());
    url.searchParams.append("lang", "en");

    try {
      const response = await fetch(url.toString());
      if (!response.ok) return [];
      
      const data = await response.json();
      if (!data.articles) return [];

      return data.articles.map((item: any) => ({
        title: item.title,
        link: item.url,
        snippet: item.description || item.content,
        source: item.source?.name || 'Unknown',
        imageUrl: item.image,
      }));
    } catch {
      return [];
    }
  }
}
