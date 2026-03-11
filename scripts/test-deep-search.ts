import { config } from 'dotenv';
import { aiResearchService } from '../src/service/ai/AIResearchService';
import { searchAdapter } from '../src/service/search/SearchAdapter';
import { urlReader } from '../src/service/reader/UrlReader';

// Load variables from .env
config();

async function testDeepSearchPipeline() {
  console.log("=== Testing Deep Search (Full Page Content) Pipeline ===\n");

  const query = "Latest AI models release dates 2024 list";
  
  // Step 1: Standard Search
  console.log(`--- Step 1: Searching Web for "${query}" ---`);
  const searchResults = await searchAdapter.executeSearch(query, { limit: 3 });
  
  if (searchResults.length === 0) {
    console.log("No search results found.");
    return;
  }
  
  // Step 2: Deep Search (Reading the FULL content of the top result)
  const topResult = searchResults[0];
  console.log(`\n--- Step 2: Deep Reading Top Result: ${topResult.title} ---`);
  const readStartTime = Date.now();
  
  const pageContent = await urlReader.read(topResult.link);
  console.log(`Successfully fetched full page content (${pageContent.content.length} characters) in ${Date.now() - readStartTime}ms\n`);

  // Step 3: AI Intelligence Phase (Reading the dense content)
  console.log("--- Step 3: AI Information Extraction (Deep Analysis) ---");
  
  interface AIModelInfo {
    modelName: string;
    releaseDate: string | null;
    keyUpdate: string;
  }

  interface ResearchReport {
     models: AIModelInfo[];
     overallTrend: string;
  }

  const outputSchema = `{
    "models": [
      { "modelName": "string", "releaseDate": "YYYY-MM-DD", "keyUpdate": "short summary" }
    ],
    "overallTrend": "one sentence on the current state of AI releases"
  }`;

  // We wrap the full content into our SearchSnippet format for the AI service
  const fullContentSnippet = {
    title: pageContent.title,
    body: pageContent.content.substring(0, 5000), // Feed a large chunk (5k characters) for deep analysis
    source: topResult.source,
    url: topResult.link
  };

  const extractionResult = await aiResearchService.extract<ResearchReport>(
    "Perform a deep analysis of the provided webpage content and list all mentioned AI models and their release dates.",
    [fullContentSnippet],
    outputSchema
  );

  console.log("Deep Search Result:");
  console.log(JSON.stringify(extractionResult, null, 2));
  console.log("\n=== Deep Search Test Complete ===");
}

testDeepSearchPipeline().catch(console.error);
