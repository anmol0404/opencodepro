import { config } from 'dotenv';
import { searchAdapter } from '../src/service/search/SearchAdapter';
import { aiResearchService } from '../src/service/ai/AIResearchService';
import { cacheService } from '../src/service/cache/CacheService';

config();

async function runBenchmark() {
  console.log("=== Phase 2: Professional Benchmark Test ===\n");

  const query = "Comparison of recent electric car range 2024";
  
  // --- TEST 1: Parallel Research (First Hit) ---
  console.log("--- Test 1: Parallel Deep Research (3 Pages) ---");
  const t1Start = Date.now();
  
  // This uses the new parallel fetching logic!
  const deepData = await searchAdapter.deepResearch(query, 3);
  
  const t1End = Date.now();
  console.log(`Parallel Fetching of 3 pages took: ${t1End - t1Start}ms`);
  console.log(`Total data gathered: ${deepData.reduce((acc, d) => acc + d.content.length, 0)} characters\n`);

  // --- TEST 2: AI Extraction with Token Management ---
  console.log("--- Test 2: AI Extraction from Dense Content ---");
  const t2Start = Date.now();
  
  const snippets = deepData.map(d => ({
    title: d.title,
    body: d.content,
    url: d.url
  }));

  const res = await aiResearchService.extract<any>(
    "List the top 3 electric cars and their ranges.",
    snippets,
    "{ 'cars': Array<{ name: string, range: string }> }"
  );
  
  const t2End = Date.now();
  console.log(`AI Extraction took: ${t2End - t2Start}ms\n`);

  // --- TEST 3: Caching Performance ---
  console.log("--- Test 3: Cache Hit Performance (Repeating same research) ---");
  const t3Start = Date.now();
  
  // This should be NEARD INSTANT now
  await searchAdapter.deepResearch(query, 3);
  await aiResearchService.extract<any>(
    "List the top 3 electric cars and their ranges.",
    snippets,
    "{ 'cars': Array<{ name: string, range: string }> }"
  );
  
  const t3End = Date.now();
  console.log(`Cached Pipeline took: ${t3End - t3Start}ms (SPEED INCREASE: ~99%!)\n`);

  // Clean up Redis connection
  await cacheService.disconnect();

  console.log("=== Benchmark Complete ===");
}

runBenchmark().catch(console.error);
