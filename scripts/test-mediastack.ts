import dotenv from 'dotenv';
import path from 'path';

// Load env from opencode-ai root
dotenv.config({ path: path.join(__dirname, '../.env') });

import { MediastackProvider } from '../src/service/search/providers/MediastackProvider';

async function testMediastack() {
  console.log("--- Testing Mediastack Provider ---");
  const provider = new MediastackProvider();
  
  const query = "news";
  console.log(`Searching for: "${query}"...`);
  
  try {
    const results = await provider.search(query, { limit: 5 });
    
    if (results.length === 0) {
      console.log("❌ No results found. Check your API access key and limits.");
    } else {
      console.log(`✅ Found ${results.length} results:`);
    }

    console.log("\n--- Testing Latest News ---");
    const latest = await provider.getLatestNews(undefined, 3);
    console.log(`✅ Found ${latest.length} articles:`);
    latest.forEach((h, i) => console.log(` - ${h.title}`));

  } catch (error) {
    console.error("Test failed with error:", error);
  }
}

testMediastack();
