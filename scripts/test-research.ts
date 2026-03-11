import { config } from 'dotenv';
import { aiResearchService } from '../src/service/ai/AIResearchService';
import { searchAdapter } from '../src/service/search/SearchAdapter';

// Load variables from .env
config();

async function testNewsPipeline() {
  console.log("=== Testing End-to-End Search & AI Pipeline (Latest News) ===\n");

  const today = new Date().toISOString().split('T')[0];
  const query = `Top global breaking news headlines today ${today}`;
  
  // Step 1: Search Engine phase
  console.log(`--- Step 1: Searching Web for "${query}" ---`);
  const searchStartTime = Date.now();
  
  // We use the SearchAdapter, which queries Google News/Serper automatically
  const searchResults = await searchAdapter.executeSearch(query, { limit: 12 });
  
  console.log(`Results found: ${searchResults.length} (Took ${Date.now() - searchStartTime}ms)\n`);
  
  if (searchResults.length === 0) {
    console.log("No search results found. Aborting test.");
    return;
  }
  
  // Map search results into snippets format for the AI service
  const snippetsForAI = searchResults.map(res => ({
    title: res.title,
    body: res.snippet,
    source: res.source,
    url: res.link
  }));

  // Step 2: AI Intelligence Phase
  console.log("--- Step 2: AI News Synthesis & Extraction ---");
  
  interface NewsReport {
    topHeadlines: Array<{
      headline: string;
      category: "Politics" | "Technology" | "Business" | "World" | "Other";
      shortSummary: string;
    }>;
    overallDailyTheme: string;
  }

  const outputSchema = `{
    "topHeadlines": [
      {
        "headline": "Full title of the news",
        "category": "Politics or Technology or Business",
        "shortSummary": "1 sentence context"
      }
    ],
    "overallDailyTheme": "A one sentence summary of what the world is focusing on today"
  }`;

  const extractionResult = await aiResearchService.extract<NewsReport>(
    "Extract the most important, unique news stories from these snippets and categorize them.",
    snippetsForAI,
    outputSchema
  );

  console.log("End-to-End Pipeline Result:");
  console.log(JSON.stringify(extractionResult, null, 2));
  console.log("\n=== Testing Complete ===");
}

testNewsPipeline().catch(console.error);
