import dotenv from 'dotenv';
import path from 'path';

// Load env from opencode-ai root
dotenv.config({ path: path.join(__dirname, '../.env') });

import { WorldNewsAPIProvider } from '../src/service/search/providers/WorldNewsAPIProvider';

async function testWorldNewsAPI() {
  console.log("--- Testing World News API Provider ---");
  const provider = new WorldNewsAPIProvider();
  
  const query = "Latest Space Exploration";
  console.log(`Searching for: "${query}"...`);
  
  try {
    const results = await provider.search(query, { limit: 5 });
    
    if (results.length === 0) {
      console.log("❌ No results found. Check your API key and limits.");
    } else {
      console.log(`✅ Found ${results.length} results:`);
      results.forEach((res, i) => {
        console.log(`\n[${i+1}] ${res.title}`);
        console.log(`    Link: ${res.link}`);
        console.log(`    Source: ${res.source}`);
      });
    }

    console.log("\n--- Testing Top News ---");
    const topNews = await provider.getTopNews(3);
    console.log(`✅ Found ${topNews.length} top news articles:`);
    topNews.forEach((h, i) => console.log(` - ${h.title}`));

  } catch (error) {
    console.error("Test failed with error:", error);
  }
}

testWorldNewsAPI();
