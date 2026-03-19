import { ISearchProvider, SearchResult, SearchOptions } from '../types';
import { ApiKeyRoundRobin, getApiKeys } from '../ApiKeyManager';

/**
 * # 📰 MEDIASTACK PROVIDER
 * Implementation of ISearchProvider for mediastack.com
 * Documentation: https://mediastack.com/documentation
 */
export class MediastackProvider implements ISearchProvider {
  name = 'Mediastack';
  private accessKeys: ApiKeyRoundRobin;

  constructor(key?: string) {
    this.accessKeys = new ApiKeyRoundRobin(
      getApiKeys(["MEDIASTACK_API_KEYS", "MEDIASTACK_API_KEY"], key)
    );
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    const accessKey = this.accessKeys.next();
    if (!accessKey) {
      console.warn("[Mediastack] No API access key configured.");
      return [];
    }

    const limit = options?.limit || 10;
    // Note: Mediastack Free Tier often requires HTTP instead of HTTPS
    const url = new URL("http://api.mediastack.com/v1/news");
    
    // Setup Search Parameters
    url.searchParams.append("access_key", accessKey);
    url.searchParams.append("keywords", query);
    url.searchParams.append("limit", Math.min(limit, 100).toString());
    url.searchParams.append("languages", "en");

    try {
      const response = await fetch(url.toString(), {
        method: "GET",
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`[Mediastack] HTTP Error ${response.status}: ${errorText}`);
        return [];
      }

      const data = await response.json();

      if (!data.data || !Array.isArray(data.data)) {
        console.warn("[Mediastack] Invalid response format", data);
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
          snippet: item.description || item.title,
          source: hostname,
          imageUrl: item.image || null,
        } as SearchResult;
      });

    } catch (error) {
      console.error("[Mediastack] Network failure", error);
      return [];
    }
  }

  /**
   * Fetch latest news by category.
   */
  async getLatestNews(category?: string, limit = 5): Promise<SearchResult[]> {
    const accessKey = this.accessKeys.next();
    if (!accessKey) return [];

    const url = new URL("http://api.mediastack.com/v1/news");
    url.searchParams.append("access_key", accessKey);
    if (category) url.searchParams.append("categories", category);
    url.searchParams.append("limit", limit.toString());
    url.searchParams.append("languages", "en");

    try {
      const response = await fetch(url.toString());
      if (!response.ok) return [];
      
      const data = await response.json();
      if (!data.data) return [];

      return data.data.map((item: any) => ({
        title: item.title,
        link: item.url,
        snippet: item.description || item.title,
        source: item.source || 'Unknown',
        imageUrl: item.image,
      }));
    } catch {
      return [];
    }
  }
}
