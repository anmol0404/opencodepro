import { ISearchProvider, SearchResult, SearchOptions } from '../types';

/**
 * # 🦆 DUCKDUCKGO PROVIDER
 * Implementation of ISearchProvider for duckduckgo.com
 * Using HTML parsing for free/fallback search.
 */
export class DuckDuckGoProvider implements ISearchProvider {
  name = 'DuckDuckGo';

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    const limit = options?.limit || 10;
    
    // We fetch HTML instead of using an API key
    // Using simple HTML endpoint to bypass heavy JS checks usually
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
        }
      });
      
      if (!response.ok) {
        console.warn(`[DuckDuckGo] HTTTP Error ${response.status}`);
        return [];
      }

      const html = await response.text();
      const results: SearchResult[] = [];

      // A simple regex to parse the DDG HTML. In production, cheerio is better, 
      // but regex avoids adding extra dependencies just for DDG results formatting.
      const resultRegex = /<a class="result__url" href="([^"]+)".*?>(.*?)<\/a>.*?<a class="result__snippet[^>]*>(.*?)<\/a>/gs;
      
      let match;
      let count = 0;
      
      while ((match = resultRegex.exec(html)) !== null && count < limit) {
        let rawLink = match[1];
        let title = match[2].replace(/<\/?[^>]+(>|$)/g, "").trim();
        let snippet = match[3].replace(/<\/?[^>]+(>|$)/g, "").trim();
        
        // Clean up the DDG redirect URL if present
        if (rawLink.includes('uddg=')) {
          const urlMatch = rawLink.match(/uddg=([^&]+)/);
          if (urlMatch) rawLink = decodeURIComponent(urlMatch[1]);
        }

        try {
          const hostname = new URL(rawLink).hostname.replace('www.', '');
          results.push({ link: rawLink, title, snippet, source: hostname });
          count++;
        } catch {
          // ignore invalid URLs
        }
      }

      return results;
    } catch (error) {
       console.error("[DuckDuckGo] Network failure", error);
       return [];
    }
  }
}
