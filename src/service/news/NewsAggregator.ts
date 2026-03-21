/**
 * =============================================================================
 * # 📰 NEWS AGGREGATOR SERVICE
 * =============================================================================
 * Aggregates latest news from multiple APIs and provides intelligent categorization
 */

import { GNewsProvider } from '../search/providers/GNewsProvider';
import { NewsApiOrgProvider } from '../search/providers/NewsApiOrgProvider';
import { NewsDataProvider } from '../search/providers/NewsDataProvider';
import { TheNewsAPIProvider } from '../search/providers/TheNewsAPIProvider';
import { WorldNewsAPIProvider } from '../search/providers/WorldNewsAPIProvider';
import { MediastackProvider } from '../search/providers/MediastackProvider';
import { SearchResult } from '../search/types';

export interface NewsStory extends SearchResult {
  provider: string;
  fetchedAt: string;
  detectedCategory?: string;
  confidence?: number;
  keywords?: string[];
  reasoning?: string;
}

export interface CategoryRequest {
  category: string;
  systemPrompt: string;
  outputSchema: string;
  callbackUrl: string;
  maxSources: number;
  curationMetadata?: any;
}

export class NewsAggregator {
  private providers: any[];

  constructor() {
    this.providers = [
      { provider: new GNewsProvider(), name: 'GNews' },
      { provider: new NewsApiOrgProvider(), name: 'NewsAPI.org' },
      { provider: new NewsDataProvider(), name: 'NewsData' },
      { provider: new TheNewsAPIProvider(), name: 'TheNewsAPI' },
      { provider: new WorldNewsAPIProvider(), name: 'WorldNewsAPI' },
      { provider: new MediastackProvider(), name: 'Mediastack' }
    ];
  }

  /**
   * Aggregate latest news from all providers
   */
  async aggregateLatestNews(): Promise<NewsStory[]> {
    console.log(`[NewsAggregator] Fetching from ${this.providers.length} providers...`);
    
    const allNews: NewsStory[] = [];
    const fetchPromises = this.providers.map(async ({ provider, name }) => {
      try {
        console.log(`[NewsAggregator] Fetching from ${name}...`);
        
        let headlines: SearchResult[] = [];
        
        // Try different methods based on provider capabilities
        if (provider.getTopHeadlines) {
          headlines = await provider.getTopHeadlines(null, 15);
        } else if (provider.getLatestNews) {
          headlines = await provider.getLatestNews(null, 15);
        } else if (provider.getHeadlines) {
          headlines = await provider.getHeadlines(null, 15);
        } else {
          // Fallback to search
          headlines = await provider.search("breaking news today", { limit: 15 });
        }
        
        const newsStories = headlines.map(headline => ({
          ...headline,
          provider: name,
          fetchedAt: new Date().toISOString()
        }));
        
        console.log(`[NewsAggregator] ${name}: ${newsStories.length} stories`);
        return newsStories;
        
      } catch (error: any) {
        console.warn(`[NewsAggregator] ${name} failed:`, error.message);
        return [];
      }
    });

    const results = await Promise.allSettled(fetchPromises);
    
    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        allNews.push(...result.value);
      }
    });

    console.log(`[NewsAggregator] Total stories fetched: ${allNews.length}`);
    return this.deduplicateNews(allNews);
  }

  /**
   * Remove duplicate news stories
   */
  private deduplicateNews(newsItems: NewsStory[]): NewsStory[] {
    console.log(`[NewsAggregator] Deduplicating ${newsItems.length} stories...`);
    
    const unique: NewsStory[] = [];
    const seenTitles = new Map<string, NewsStory>();
    
    for (const item of newsItems) {
      if (!item.title || item.title.length < 10) continue;
      
      const normalizedTitle = item.title.toLowerCase().trim();
      
      // Check for similar titles
      let isDuplicate = false;
      for (const [seenTitle, seenItem] of seenTitles) {
        const similarity = this.calculateTitleSimilarity(normalizedTitle, seenTitle);
        if (similarity > 0.8) {
          // Keep the one with better image or more recent
          if (item.imageUrl && !seenItem.imageUrl) {
            seenTitles.delete(seenTitle);
            const index = unique.indexOf(seenItem);
            if (index > -1) unique.splice(index, 1);
            break;
          } else {
            isDuplicate = true;
            break;
          }
        }
      }
      
      if (!isDuplicate) {
        unique.push(item);
        seenTitles.set(normalizedTitle, item);
      }
    }
    
    // Filter for quality and sort by recency
    const filtered = unique
      .filter(item => 
        item.link && 
        item.title && 
        item.snippet && 
        item.snippet.length > 20
      )
      .sort((a, b) => new Date(b.fetchedAt).getTime() - new Date(a.fetchedAt).getTime())
      .slice(0, 50); // Top 50 unique stories
    
    console.log(`[NewsAggregator] ${filtered.length} unique quality stories`);
    return filtered;
  }

  /**
   * Calculate similarity between two titles
   */
  private calculateTitleSimilarity(title1: string, title2: string): number {
    const words1 = title1.split(' ').filter(w => w.length > 3);
    const words2 = title2.split(' ').filter(w => w.length > 3);
    
    if (words1.length === 0 || words2.length === 0) return 0;
    
    const commonWords = words1.filter(word => words2.includes(word));
    return commonWords.length / Math.max(words1.length, words2.length);
  }

  /**
   * AI categorize news stories
   */
  async categorizeNews(newsItems: NewsStory[]): Promise<NewsStory[]> {
    console.log(`[NewsAggregator] AI categorizing ${newsItems.length} stories...`);
    
    const categorized: NewsStory[] = [];
    const batchSize = 5; // Process in batches
    
    for (let i = 0; i < newsItems.length; i += batchSize) {
      const batch = newsItems.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (item) => {
        const prompt = `Analyze this news story and categorize it:

Title: "${item.title}"
Snippet: "${item.snippet}"
Source: ${item.source}

Available Categories:
- Technology (AI, gadgets, software, startups, tech companies)
- Sports (games, tournaments, athletes, scores, matches)
- Business (markets, economy, companies, finance, crypto, stocks)
- Entertainment (movies, music, celebrities, TV shows, awards)
- Politics (elections, government, policy, international relations)
- Health (medical, wellness, diseases, research, healthcare)
- Science (research, discoveries, space, environment, climate)
- World (international news, conflicts, disasters, general news)

Consider the main topic, target audience, and content focus.

Return JSON only: {"category": "Technology", "confidence": 0.95, "keywords": ["AI", "tech"], "reasoning": "About AI advancement"}`;
        
        try {
          // This would call your AI service (OpenAI, etc.)
          const response = await this.callAI(prompt);
          const categoryData = JSON.parse(response);
          
          return {
            ...item,
            detectedCategory: categoryData.category,
            confidence: categoryData.confidence,
            keywords: categoryData.keywords || [],
            reasoning: categoryData.reasoning
          };
        } catch (error: any) {
          console.warn(`[NewsAggregator] Categorization failed for "${item.title}":`, error.message);
          return {
            ...item,
            detectedCategory: "World",
            confidence: 0.5,
            keywords: [],
            reasoning: "Fallback category due to AI error"
          };
        }
      });
      
      const batchResults = await Promise.allSettled(batchPromises);
      batchResults.forEach(result => {
        if (result.status === 'fulfilled') {
          categorized.push(result.value);
        }
      });
      
      console.log(`[NewsAggregator] Processed batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(newsItems.length/batchSize)}`);
      
      // Small delay between batches to avoid rate limits
      if (i + batchSize < newsItems.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    console.log(`[NewsAggregator] Categorized ${categorized.length} stories`);
    return categorized;
  }

  /**
   * Select best story for a specific category
   */
  selectBestStoryForCategory(categorizedNews: NewsStory[], targetCategory: string): NewsStory | null {
    console.log(`[NewsAggregator] Selecting best story for ${targetCategory}...`);
    
    // Filter for target category with high confidence
    const categoryStories = categorizedNews.filter(
      story => story.detectedCategory === targetCategory && (story.confidence || 0) > 0.7
    );
    
    if (categoryStories.length === 0) {
      console.warn(`[NewsAggregator] No high-confidence stories found for ${targetCategory}`);
      // Fallback to any story with decent confidence
      const fallbackStories = categorizedNews.filter(s => (s.confidence || 0) > 0.6);
      if (fallbackStories.length === 0) return null;
      
      return fallbackStories.sort((a, b) => (b.confidence || 0) - (a.confidence || 0))[0];
    }
    
    // Sort by confidence, image availability, and recency
    const bestStory = categoryStories.sort((a, b) => {
      // Priority 1: Image availability
      if (!!b.imageUrl !== !!a.imageUrl) {
        return !!b.imageUrl ? 1 : -1;
      }
      
      // Priority 2: Confidence
      const confidenceDiff = (b.confidence || 0) - (a.confidence || 0);
      if (Math.abs(confidenceDiff) > 0.05) {
        return confidenceDiff;
      }
      
      // Priority 3: Recency
      return new Date(b.fetchedAt).getTime() - new Date(a.fetchedAt).getTime();
    })[0];
    
    console.log(`[NewsAggregator] Selected: "${bestStory.title}" (confidence: ${bestStory.confidence})`);
    return bestStory;
  }

  /**
   * Placeholder for AI service call
   */
  private async callAI(prompt: string): Promise<string> {
    // Import AI service from existing curation service
    const { aiResearchService } = await import('../ai/AIResearchService');
    
    try {
      const result = await aiResearchService.evaluate<any>(
        prompt,
        [],
        '{"category": "string", "confidence": "number", "keywords": ["string"], "reasoning": "string"}',
        "Return valid JSON only with the categorization result."
      );
      
      return JSON.stringify(result.data);
    } catch (error: any) {
      console.warn(`[NewsAggregator] AI call failed:`, error.message);
      // Fallback categorization based on keywords
      return this.fallbackCategorization(prompt);
    }
  }

  /**
   * Fallback categorization using keyword matching
   */
  private fallbackCategorization(prompt: string): string {
    const text = prompt.toLowerCase();
    
    // Simple keyword-based categorization
    if (text.includes('tech') || text.includes('ai') || text.includes('software') || text.includes('app')) {
      return JSON.stringify({ category: "Technology", confidence: 0.6, keywords: ["tech"], reasoning: "Keyword-based fallback" });
    }
    if (text.includes('sport') || text.includes('game') || text.includes('match') || text.includes('player')) {
      return JSON.stringify({ category: "Sports", confidence: 0.6, keywords: ["sports"], reasoning: "Keyword-based fallback" });
    }
    if (text.includes('business') || text.includes('stock') || text.includes('market') || text.includes('economy')) {
      return JSON.stringify({ category: "Business", confidence: 0.6, keywords: ["business"], reasoning: "Keyword-based fallback" });
    }
    if (text.includes('health') || text.includes('medical') || text.includes('doctor') || text.includes('disease')) {
      return JSON.stringify({ category: "Health", confidence: 0.6, keywords: ["health"], reasoning: "Keyword-based fallback" });
    }
    if (text.includes('politic') || text.includes('election') || text.includes('government') || text.includes('president')) {
      return JSON.stringify({ category: "Politics", confidence: 0.6, keywords: ["politics"], reasoning: "Keyword-based fallback" });
    }
    if (text.includes('entertainment') || text.includes('movie') || text.includes('celebrity') || text.includes('music')) {
      return JSON.stringify({ category: "Entertainment", confidence: 0.6, keywords: ["entertainment"], reasoning: "Keyword-based fallback" });
    }
    
    // Default fallback
    return JSON.stringify({ category: "World", confidence: 0.5, keywords: [], reasoning: "Default fallback category" });
  }
}