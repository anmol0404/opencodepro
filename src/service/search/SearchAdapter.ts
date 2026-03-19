import { SerperProvider } from './providers/SerperProvider';
import { DuckDuckGoProvider } from './providers/DuckDuckGoProvider';
import { TheNewsAPIProvider } from './providers/TheNewsAPIProvider';
import { GNewsProvider } from './providers/GNewsProvider';
import { MediastackProvider } from './providers/MediastackProvider';
import { NewsDataProvider } from './providers/NewsDataProvider';
import { WorldNewsAPIProvider } from './providers/WorldNewsAPIProvider';
import { NewsApiOrgProvider } from './providers/NewsApiOrgProvider';
import { ISearchProvider, SearchResult, SearchOptions } from './types';
import { cacheService } from '../cache/CacheService';
import { urlReader } from '../reader/UrlReader';

export class SearchAdapter {
  private primaryProvider: ISearchProvider;
  private fallbackProvider: ISearchProvider;
  private newsProvider: ISearchProvider;
  private newsFallbackProvider: ISearchProvider;
  private newsUltimateFallbackProvider: ISearchProvider;
  private newsDataFallbackProvider: ISearchProvider;
  private worldNewsProvider: ISearchProvider;
  private newsApiOrgProvider: ISearchProvider;

  // We keep a lightweight blacklist out of the box to avoid low-value SEO spam
  private defaultBlacklistDomains = [
    'pinterest.com',
    'youtube.com',
    'facebook.com',
    'instagram.com'
  ];

  constructor(
    primaryProvider?: ISearchProvider,
    fallbackProvider?: ISearchProvider,
    newsProvider?: ISearchProvider,
    newsFallbackProvider?: ISearchProvider,
    newsUltimateFallbackProvider?: ISearchProvider,
    newsDataFallbackProvider?: ISearchProvider,
    worldNewsProvider?: ISearchProvider,
    newsApiOrgProvider?: ISearchProvider
  ) {
    // Attempt Serper (Google) first, if it fails or has no key, use DDG
    this.primaryProvider = primaryProvider || new SerperProvider();
    this.fallbackProvider = fallbackProvider || new DuckDuckGoProvider();
    this.newsProvider = newsProvider || new TheNewsAPIProvider();
    this.newsFallbackProvider = newsFallbackProvider || new GNewsProvider();
    this.newsUltimateFallbackProvider = newsUltimateFallbackProvider || new MediastackProvider();
    this.newsDataFallbackProvider = newsDataFallbackProvider || new NewsDataProvider();
    this.worldNewsProvider = worldNewsProvider || new WorldNewsAPIProvider();
    this.newsApiOrgProvider = newsApiOrgProvider || new NewsApiOrgProvider();
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

    if (!results || results.length === 0) {
      console.warn(`[SearchAdapter] Both providers failed. Trying ${this.newsProvider.name} as a final fallback.`);
      results = await this.newsProvider.search(query, options);
    }

    if (!results || results.length === 0) {
      console.warn(`[SearchAdapter] All standard providers failed. Trying ${this.newsFallbackProvider.name} as fallback.`);
      results = await this.newsFallbackProvider.search(query, options);
    }

    if (!results || results.length === 0) {
      console.warn(`[SearchAdapter] Still no results. Trying ${this.newsUltimateFallbackProvider.name} as fallback.`);
      results = await this.newsUltimateFallbackProvider.search(query, options);
    }

    if (!results || results.length === 0) {
      console.warn(`[SearchAdapter] All standard providers failed. Trying ${this.newsDataFallbackProvider.name} as fallback.`);
      results = await this.newsDataFallbackProvider.search(query, options);
    }

    if (!results || results.length === 0) {
      console.warn(`[SearchAdapter] Still no results. Trying ${this.worldNewsProvider.name} as absolute fallback.`);
      results = await this.worldNewsProvider.search(query, options);
    }

    if (!results || results.length === 0) {
      console.warn(`[SearchAdapter] No results yet. Trying ${this.newsApiOrgProvider.name} as final absolute fallback.`);
      results = await this.newsApiOrgProvider.search(query, options);
    }

    const cleanResults = results
      .filter(res => this.isAllowed(res.link))
      .filter((v, i, a) => a.findIndex(t => (t.link === v.link)) === i);

    await cacheService.set(cacheKey, cleanResults);
    return cleanResults;
  }

  /**
   * Specifically targets news articles from thousands of global sources.
   * Useful when we want to ensure content is news-centric.
   */
  public async searchNews(query: string, limit: number = 10): Promise<SearchResult[]> {
    console.log(`[SearchAdapter] Fetching news content for: "${query}" via ${this.newsProvider.name}`);
    let results = await this.newsProvider.search(query, { limit });

    if (!results || results.length === 0) {
      console.warn(`[SearchAdapter] ${this.newsProvider.name} failed. Falling back to ${this.newsFallbackProvider.name}.`);
      results = await this.newsFallbackProvider.search(query, { limit });
    }

    if (!results || results.length === 0) {
      console.warn(`[SearchAdapter] ${this.newsFallbackProvider.name} failed. Falling back to ${this.newsUltimateFallbackProvider.name}.`);
      results = await this.newsUltimateFallbackProvider.search(query, { limit });
    }

    if (!results || results.length === 0) {
      console.warn(`[SearchAdapter] ${this.newsUltimateFallbackProvider.name} failed. Falling back to ${this.newsDataFallbackProvider.name}.`);
      results = await this.newsDataFallbackProvider.search(query, { limit });
    }

    if (!results || results.length === 0) {
      console.warn(`[SearchAdapter] ${this.newsDataFallbackProvider.name} failed. Falling back to ${this.worldNewsProvider.name}.`);
      results = await this.worldNewsProvider.search(query, { limit });
    }

    if (!results || results.length === 0) {
      console.warn(`[SearchAdapter] ${this.worldNewsProvider.name} failed. Falling back to ${this.newsApiOrgProvider.name}.`);
      results = await this.newsApiOrgProvider.search(query, { limit });
    }

    return results;
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
