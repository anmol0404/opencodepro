import { cacheService } from '../cache/CacheService';

export interface ReaderResult {
  url: string;
  title: string;
  content: string; // The full markdown/text content of the page
  error?: string;
}

export class UrlReader {
  /**
   * Reads the full content of a URL using jina.ai's reader interface.
   * This handles scraping, cleaning, and formatting the page as Markdown.
   */
  public async read(url: string, timeoutMs: number = 15000): Promise<ReaderResult> {
    const cacheKey = cacheService.generateKey('read', url);
    const cached = await cacheService.get<ReaderResult>(cacheKey);
    if (cached !== null) {
      console.log(`[UrlReader] Cache hit for: ${url}`);
      return cached;
    }

    const readerUrl = `https://r.jina.ai/${url}`;
    
    try {
      const response = await fetch(readerUrl, {
         signal: AbortSignal.timeout(timeoutMs)
      });
      
      if (!response.ok) {
        throw new Error(`Reader API returned ${response.status}`);
      }
      
      const text = await response.text();
      
      // Jina's reader usually returns "Title: ...\nURL: ...\n\nContent..."
      const titleMatch = text.match(/^Title: (.*)$/m);
      const title = titleMatch ? titleMatch[1] : "Untitled Page";
      
      // Clean up common fluff and condense extra whitespace
      const cleanContent = text
        .replace(/\s\s+/g, ' ')
        .replace(/\n\s*\n/g, '\n')
        .trim();

      const result: ReaderResult = {
        url,
        title,
        content: cleanContent
      };
      
      await cacheService.set(cacheKey, result);
      return result;
    } catch (error) {
      console.error(`[UrlReader] Failed to read ${url}`, error);
      return {
        url,
        title: "Error",
        content: "",
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}

// Export singleton instance for easy usage
export const urlReader = new UrlReader();
