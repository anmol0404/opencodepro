import dotenv from 'dotenv';
import path from 'path';

// Load env from opencode-ai root
dotenv.config({ path: path.join(__dirname, '../.env') });

import { GNewsProvider } from '../src/service/search/providers/GNewsProvider';

async function testGNews() {
  console.log("--- Testing GNews Provider ---");
  const provider = new GNewsProvider();
  
  const query = "Latest Space Exploration News";
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

    console.log("\n--- Testing Top Headlines ---");
    const headlines = await provider.getTopHeadlines("science", 3);
    console.log(`✅ Found ${headlines.length} science headlines:`);
    headlines.forEach((h, i) => console.log(` - ${h.title}`));

  } catch (error) {
    console.error("Test failed with error:", error);
  }
}

testGNews();
