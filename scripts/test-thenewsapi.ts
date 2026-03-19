import dotenv from 'dotenv';
import path from 'path';

// Load env from opencode-ai root
dotenv.config({ path: path.join(__dirname, '../.env') });

import { TheNewsAPIProvider } from '../src/service/search/providers/TheNewsAPIProvider';

async function testNewsAPI() {
  console.log("--- Testing The News API Provider ---");
  const provider = new TheNewsAPIProvider();
  
  const query = "AI and Machine Learning News";
  console.log(`Searching for: "${query}"...`);
  
  try {
    const results = await provider.search(query, { limit: 5 });
    
    if (results.length === 0) {
      console.log("❌ No results found. Check your API token and limits.");
    } else {
      console.log(`✅ Found ${results.length} results:`);
      results.forEach((res, i) => {
        console.log(`\n[${i+1}] ${res.title}`);
        console.log(`    Link: ${res.link}`);
        console.log(`    Source: ${res.source}`);
        console.log(`    Snippet: ${res.snippet?.substring(0, 100)}...`);
      });
    }

    console.log("\n--- Testing Headlines ---");
    const headlines = await provider.getHeadlines("tech", 3);
    console.log(`✅ Found ${headlines.length} tech headlines:`);
    headlines.forEach((h, i) => console.log(` - ${h.title}`));

  } catch (error) {
    console.error("Test failed with error:", error);
  }
}

testNewsAPI();
