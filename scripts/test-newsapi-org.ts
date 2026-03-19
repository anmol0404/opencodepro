import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

import { NewsApiOrgProvider } from '../src/service/search/providers/NewsApiOrgProvider';

async function testNewsApiOrg() {
  console.log("--- Testing NewsAPI.org Provider ---");
  const provider = new NewsApiOrgProvider();

  const query = "Artificial Intelligence";
  console.log(`Searching for: "${query}"...`);

  try {
    const results = await provider.search(query, { limit: 5 });

    if (results.length === 0) {
      console.log("❌ No results found. Check your API key and limits.");
    } else {
      console.log(`✅ Found ${results.length} results:`);
      results.forEach((res, i) => {
        console.log(`\n[${i + 1}] ${res.title}`);
        console.log(`    Link: ${res.link}`);
        console.log(`    Source: ${res.source}`);
      });
    }

    console.log("\n--- Testing Top Headlines ---");
    const headlines = await provider.getTopHeadlines("technology", 3);
    console.log(`✅ Found ${headlines.length} technology headlines:`);
    headlines.forEach((h, i) => console.log(` - ${h.title}`));
  } catch (error) {
    console.error("Test failed with error:", error);
  }
}

testNewsApiOrg();
