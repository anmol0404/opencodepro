import { ISearchProvider, SearchResult, SearchOptions } from '../types';
import { ApiKeyRoundRobin, getApiKeys } from '../ApiKeyManager';

export class NewsApiOrgProvider implements ISearchProvider {
  name = 'NewsAPI.org';
  private apiKeys: ApiKeyRoundRobin;

  constructor(key?: string) {
    this.apiKeys = new ApiKeyRoundRobin(
      getApiKeys(["NEWSAPI_ORG_KEYS", "NEWSAPI_ORG_KEY"], key)
    );
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    const apiKey = this.apiKeys.next();
    if (!apiKey) {
      console.warn("[NewsAPI.org] No API key configured.");
      return [];
    }

    const limit = options?.limit || 10;
    const url = new URL("https://newsapi.org/v2/everything");
    url.searchParams.append("apiKey", apiKey);
    url.searchParams.append("q", query);
    url.searchParams.append("language", "en");
    url.searchParams.append("pageSize", Math.min(limit, 100).toString());
    url.searchParams.append("sortBy", "publishedAt");

    try {
      const response = await fetch(url.toString(), { method: "GET" });

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`[NewsAPI.org] HTTP Error ${response.status}: ${errorText}`);
        return [];
      }

      const data = await response.json();
      if (!data.articles || !Array.isArray(data.articles)) return [];

      return data.articles
        .filter((item: any) => typeof item?.url === "string" && item.url.length > 0)
        .map((item: any) => {
          let hostname = 'Unknown';
          try {
            hostname = new URL(item.url).hostname.replace('www.', '');
          } catch {
            hostname = item.source?.name || 'Unknown';
          }

          return {
            title: item.title || "Untitled",
            link: item.url,
            snippet: item.description || item.content || item.title || "",
            source: hostname,
            imageUrl: item.urlToImage || null,
          } as SearchResult;
        });
    } catch (error) {
      console.error("[NewsAPI.org] Network failure", error);
      return [];
    }
  }

  async getTopHeadlines(category?: string, limit = 5): Promise<SearchResult[]> {
    const apiKey = this.apiKeys.next();
    if (!apiKey) return [];

    const url = new URL("https://newsapi.org/v2/top-headlines");
    url.searchParams.append("apiKey", apiKey);
    url.searchParams.append("language", "en");
    url.searchParams.append("pageSize", Math.min(limit, 100).toString());
    if (category) url.searchParams.append("category", category);

    try {
      const response = await fetch(url.toString(), { method: "GET" });
      if (!response.ok) return [];

      const data = await response.json();
      if (!data.articles || !Array.isArray(data.articles)) return [];

      return data.articles
        .filter((item: any) => typeof item?.url === "string" && item.url.length > 0)
        .map((item: any) => ({
          title: item.title || "Untitled",
          link: item.url,
          snippet: item.description || item.content || item.title || "",
          source: item.source?.name || 'Unknown',
          imageUrl: item.urlToImage || null,
        }));
    } catch {
      return [];
    }
  }
}
