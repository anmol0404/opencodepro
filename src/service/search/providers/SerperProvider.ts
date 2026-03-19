import { ISearchProvider, SearchResult, SearchOptions } from '../types';
import { ApiKeyRoundRobin, getApiKeys } from '../ApiKeyManager';

/**
 * # 🔎 SERPER PROVIDER (GOOGLE)
 * Implementation of ISearchProvider for serper.dev
 * Documentation: https://serper.dev/
 */
export class SerperProvider implements ISearchProvider {
  name = 'Serper (Google)';
  private apiKeys: ApiKeyRoundRobin;

  constructor(keysEnvString?: string) {
    this.apiKeys = new ApiKeyRoundRobin(
      getApiKeys(["SERPER_API_KEYS", "SERPER_API_KEY"], keysEnvString)
    );
  }

  private getNextKey(): string | null {
    return this.apiKeys.next();
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    const key = this.getNextKey();
    if (!key) {
      console.warn("[Serper] No API keys configured.");
      return [];
    }

    const limit = options?.limit || 10;

    try {
      const response = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: {
          "X-API-KEY": key,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ q: query, num: limit, gl: "in" })
      });

      if (!response.ok) {
        console.warn(`[Serper] HTTP Error ${response.status}`);
        return [];
      }

      const data = await response.json();

      if (!data.organic || !Array.isArray(data.organic)) {
        return [];
      }

      // Build a map of imageUrl from topStories (Serper includes thumbnails there)
      const topStoryImages: Record<string, string> = {};
      if (data.topStories && Array.isArray(data.topStories)) {
        for (const story of data.topStories) {
          if (story.link && story.imageUrl) {
            topStoryImages[story.link] = story.imageUrl;
          }
        }
      }

      return data.organic.map((item: any) => {
        let hostname = 'Unknown';
        try { hostname = new URL(item.link).hostname.replace('www.', ''); } catch { }

        const imageUrl: string | null =
          item.imageUrl ||
          topStoryImages[item.link] ||
          item.thumbnailUrl ||
          item.attributes?.imageUrl ||
          null;

        return {
          title: item.title,
          link: item.link,
          snippet: item.snippet,
          source: hostname,
          imageUrl,           // used by CurationService for cover images
        } as SearchResult;
      });

    } catch (error) {
      console.error("[Serper] Network failure", error);
      return [];
    }
  }

  /**
   * Dedicated image search — hits Serper's /images endpoint.
   * Returns a ranked list of direct image URLs.
   */
  async searchImages(query: string, limit = 5): Promise<string[]> {
    const key = this.getNextKey();
    if (!key) return [];

    try {
      const response = await fetch("https://google.serper.dev/images", {
        method: "POST",
        headers: { "X-API-KEY": key, "Content-Type": "application/json" },
        body: JSON.stringify({ q: query, num: limit, gl: "in" }),
      });

      if (!response.ok) return [];

      const data = await response.json();
      if (!data.images || !Array.isArray(data.images)) return [];

      return data.images
        .map((img: any) => img.imageUrl || img.thumbnailUrl)
        .filter((u: any): u is string => typeof u === "string" && u.startsWith("http"));
    } catch {
      return [];
    }
  }
}
