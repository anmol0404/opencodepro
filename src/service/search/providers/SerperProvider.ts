import { ISearchProvider, SearchResult, SearchOptions } from '../types';

export class SerperProvider implements ISearchProvider {
  name = 'Serper (Google)';
  private apiKeys: string[];
  private currentKeyIndex = 0;

  constructor(keysEnvString?: string) {
    const envString = keysEnvString || process.env.SERPER_API_KEYS || process.env.SERPER_API_KEY || "";
    this.apiKeys = envString.split(',').map(k => k.trim()).filter(k => k.length > 0);
  }

  private getNextKey(): string | null {
    if (this.apiKeys.length === 0) return null;
    const key = this.apiKeys[this.currentKeyIndex];
    // Rotate key
    this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
    return key;
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
        body: JSON.stringify({
          q: query,
          num: limit,
          gl: "in" // Defaulting to India like price-oracle
        })
      });

      if (!response.ok) {
         console.warn(`[Serper] HTTP Error ${response.status}`);
         return [];
      }

      const data = await response.json();
      
      if (!data.organic || !Array.isArray(data.organic)) {
        return [];
      }

      return data.organic.map((item: any) => {
        let hostname = 'Unknown';
        try { hostname = new URL(item.link).hostname.replace('www.', ''); } catch { }

        return {
          title: item.title,
          link: item.link,
          snippet: item.snippet,
          source: hostname
        };
      });

    } catch (error) {
      console.error("[Serper] Network failure", error);
      return [];
    }
  }
}
