import dotenv from 'dotenv';
import path from 'path';

// Load env from opencode-ai root
dotenv.config({ path: path.join(__dirname, '../.env') });

import { NewsDataProvider } from '../src/service/search/providers/NewsDataProvider';

async function testNewsData() {
  console.log("--- Testing NewsData Provider ---");
  const provider = new NewsDataProvider();
  
  const query = "Artificial Intelligence";
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

    console.log("\n--- Testing Category Search ---");
    const techNews = await provider.getNewsByCategory("technology", 3);
    console.log(`✅ Found ${techNews.length} technology articles:`);
    techNews.forEach((h, i) => console.log(` - ${h.title}`));

  } catch (error) {
    console.error("Test failed with error:", error);
  }
}

testNewsData();
