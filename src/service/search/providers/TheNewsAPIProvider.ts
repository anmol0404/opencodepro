import { ISearchProvider, SearchResult, SearchOptions } from '../types';
import { ApiKeyRoundRobin, getApiKeys } from '../ApiKeyManager';

/**
 * # 📰 THE NEWS API PROVIDER
 * Implementation of ISearchProvider for thenewsapi.com
 * Documentation: https://www.thenewsapi.com/documentation
 */
export class TheNewsAPIProvider implements ISearchProvider {
  name = 'The News API';
  private apiTokens: ApiKeyRoundRobin;

  constructor(token?: string) {
    this.apiTokens = new ApiKeyRoundRobin(
      getApiKeys(["THE_NEWS_API_TOKENS", "THE_NEWS_API_TOKEN"], token)
    );
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    const apiToken = this.apiTokens.next();
    if (!apiToken) {
      console.warn("[TheNewsAPI] No API token configured.");
      return [];
    }

    const limit = options?.limit || 10;
    const url = new URL("https://api.thenewsapi.com/v1/news/all");
    
    // Setup Search Parameters
    url.searchParams.append("api_token", apiToken);
    url.searchParams.append("search", query);
    url.searchParams.append("limit", Math.min(limit, 25).toString()); // API limit is usually 25 per request
    url.searchParams.append("language", "en"); // Default to English for better curation quality

    try {
      const response = await fetch(url.toString(), {
        method: "GET",
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`[TheNewsAPI] HTTP Error ${response.status}: ${errorText}`);
        return [];
      }

      const data = await response.json();

      if (!data.data || !Array.isArray(data.data)) {
        console.warn("[TheNewsAPI] Invalid response format", data);
        return [];
      }

      return data.data.map((item: any) => {
        let hostname = 'Unknown';
        try { 
          hostname = new URL(item.url).hostname.replace('www.', ''); 
        } catch {
          hostname = item.source || 'Unknown';
        }

        return {
          title: item.title,
          link: item.url,
          snippet: item.snippet || item.description,
          source: hostname,
          imageUrl: item.image_url || null,
        } as SearchResult;
      });

    } catch (error) {
      console.error("[TheNewsAPI] Network failure", error);
      return [];
    }
  }

  /**
   * Fetch headlines specifically if needed.
   */
  async getHeadlines(category?: string, limit = 5): Promise<SearchResult[]> {
    const apiToken = this.apiTokens.next();
    if (!apiToken) return [];

    const url = new URL("https://api.thenewsapi.com/v1/news/headlines");
    url.searchParams.append("api_token", apiToken);
    if (category) url.searchParams.append("categories", category);
    url.searchParams.append("limit", limit.toString());

    try {
      const response = await fetch(url.toString());
      if (!response.ok) return [];
      
      const data = await response.json();
      if (!data.data) return [];

      return data.data.map((item: any) => ({
        title: item.title,
        link: item.url,
        snippet: item.snippet || item.description,
        source: item.source,
        imageUrl: item.image_url,
      }));
    } catch {
      return [];
    }
  }
}
