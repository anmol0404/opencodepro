import { SerperProvider } from './providers/SerperProvider';
import { DuckDuckGoProvider } from './providers/DuckDuckGoProvider';
import { ISearchProvider, SearchResult, SearchOptions } from './types';
import { cacheService } from '../cache/CacheService';
import { urlReader } from '../reader/UrlReader';

export class SearchAdapter {
  private primaryProvider: ISearchProvider;
  private fallbackProvider: ISearchProvider;

  // We keep a lightweight blacklist out of the box to avoid low-value SEO spam
  private defaultBlacklistDomains = [
    'pinterest.com',
    'youtube.com',
    'facebook.com',
    'instagram.com'
  ];

  constructor(
    primaryProvider?: ISearchProvider,
    fallbackProvider?: ISearchProvider
  ) {
    // Attempt Serper (Google) first, if it fails or has no key, use DDG
    this.primaryProvider = primaryProvider || new SerperProvider();
    this.fallbackProvider = fallbackProvider || new DuckDuckGoProvider();
  }

  private isAllowed(urlStr: string): boolean {
    try {
      const hostname = new URL(urlStr).hostname.toLowerCase();
      return !this.defaultBlacklistDomains.some(domain => hostname.includes(domain));
    } catch {
      return false; // Reject malformed URLs automatically
    }
  }

  /**
   * Executes a robust web search with built-in fallback and caching.
   */
  public async executeSearch(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    const cacheKey = cacheService.generateKey('search', query, options);
    const cached = await cacheService.get<SearchResult[]>(cacheKey);
    if (cached) {
      console.log(`[SearchAdapter] Cache hit for: "${query}"`);
      return cached;
    }

    console.log(`[SearchAdapter] Initiating search for: "${query}" via ${this.primaryProvider.name}`);
    
    let results = await this.primaryProvider.search(query, options);

    if (!results || results.length === 0) {
      console.warn(`[SearchAdapter] ${this.primaryProvider.name} failed. Falling back to ${this.fallbackProvider.name}.`);
      results = await this.fallbackProvider.search(query, options);
    }

    const cleanResults = results
      .filter(res => this.isAllowed(res.link))
      .filter((v, i, a) => a.findIndex(t => (t.link === v.link)) === i);

    await cacheService.set(cacheKey, cleanResults);
    return cleanResults;
  }

  /**
   * PROFESSIONAL FEATURE: Performs a parallel deep search.
   * Finds URLs AND reads their full contents simultaneously.
   */
  public async deepResearch(query: string, maxLinks: number = 3, onProgress?: (msg: string) => void): Promise<Array<{ title: string, content: string, url: string }>> {
    if (onProgress) onProgress(`Scraping web for: "${query}"`);
    const searchResults = await this.executeSearch(query, { limit: maxLinks });
    
    if (onProgress) onProgress(`Found ${searchResults.length} index links. Parsing content...`);
    console.log(`[SearchAdapter] Deep Research found ${searchResults.length} initial links.`);

    // Parallel Read: No more waiting for links one-by-one!
    const readPromises = searchResults.map(async (res) => {
      try {
        if (onProgress) onProgress(`Reading site: ${res.title.substring(0, 40)}...`);
        const page = await urlReader.read(res.link);
        console.log(`[SearchAdapter] Read success for: ${res.link} (${page?.content?.length || 0} chars)`);
        return {
          title: res.title,
          content: page?.content || 'No content found',
          url: res.link
        };
      } catch (err) {
        if (onProgress) onProgress(`Failed to parse site: ${res.title.substring(0, 30)}`);
        console.warn(`[SearchAdapter] Failed to read ${res.link}`);
        return null;
      }
    });

    const results = await Promise.all(readPromises);
    const validResults = results.filter((r): r is { title: string, content: string, url: string } => r !== null && r.content.length > 100);
    
    if (onProgress) onProgress(`Web extraction complete. Retained ${validResults.length} high-quality sources.`);
    console.log(`[SearchAdapter] Deep Research complete. Retained ${validResults.length} valid pages.`);
    return validResults;
  }
}

export const searchAdapter = new SearchAdapter();
