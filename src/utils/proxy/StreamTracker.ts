import { Transform } from 'stream';
import { Response as ExpressResponse } from 'express';
import { Response as FetchResponse } from 'node-fetch';
import { dbService } from '../../service/db/DBService';
import { providerManager } from '../../service/provider/ProviderManager';
import { calculateCost } from './Pricing';
import { recordKeyRequest } from './KeyLimitsCache';

export interface LogData {
  wrapperKeyId: number | null;
  provider: string;
  model: string;
  startTime: number;
  ip: string;
}

async function getStreamCost(usage: { prompt_tokens?: number; completion_tokens?: number }, provider: string, model: string): Promise<number> {
  // Try DB pricing first (matches non-stream behavior)
  const cacheKey = `${provider}:${model}`;
  let pricing = providerManager.pricingCache.get(cacheKey);
  if (!pricing) {
    try {
      const row = await dbService.get<any>(
        `SELECT input_cost_per_1m, output_cost_per_1m
         FROM model_pricing
         WHERE (provider = ? AND model = ?)
            OR (provider = ? AND model = '*')
            OR (provider = 'default' AND model = '*')
         ORDER BY (provider = ? AND model = ?) DESC, (provider = ? AND model = '*') DESC
         LIMIT 1`,
        [provider, model, provider, provider, model, provider]
      );
      if (row) {
        pricing = { input: row.input_cost_per_1m, output: row.output_cost_per_1m };
        providerManager.pricingCache.set(cacheKey, pricing);
      }
    } catch { /* fall through to hardcoded */ }
  }

  if (pricing) {
    return ((usage.prompt_tokens || 0) / 1000000) * pricing.input +
           ((usage.completion_tokens || 0) / 1000000) * pricing.output;
  }

  // Fallback to hardcoded pricing
  return calculateCost(usage, provider);
}

export function trackStreamAndLog(
  fetchResponse: FetchResponse,
  res: ExpressResponse,
  logData: LogData
) {
  let usage = { prompt_tokens: 0, completion_tokens: 0 };
  let buffer = '';
  let streamModel = logData.model;

  const transformer = new Transform({
    transform(chunk, encoding, callback) {
      this.push(chunk);

      buffer += chunk.toString();

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const content = line.slice(6).trim();
          if (content === '[DONE]') continue;

          try {
            const parsed = JSON.parse(content);
            if (parsed.usage) {
              usage = parsed.usage;
            }
            if (parsed.model) {
              streamModel = parsed.model;
            }
          } catch (e) {
            // Partial or malformed JSON, ignore
          }
        }
      }
      callback();
    }
  });

  transformer.on('end', async () => {
    try {
      const { wrapperKeyId, provider, startTime } = logData;
      const cost = await getStreamCost(usage, provider, streamModel);

      await dbService.run(
        `INSERT INTO request_logs (wrapper_key_id, provider, model, prompt_tokens, completion_tokens, latency_ms, status_code, cost_usd)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          wrapperKeyId,
          provider,
          streamModel,
          usage.prompt_tokens || 0,
          usage.completion_tokens || 0,
          Date.now() - startTime,
          200,
          cost
        ]
      );

      const totalTokens = (usage.prompt_tokens || 0) + (usage.completion_tokens || 0);
      recordKeyRequest(wrapperKeyId, totalTokens, cost);

      console.log(`[StreamTracker] Logged streamed response for ${provider}/${streamModel}`);
    } catch (err) {
      console.error('[StreamTracker] Logging failed:', err);
    }
  });

  (fetchResponse.body as any).pipe(transformer).pipe(res);

  fetchResponse.body.on('error', (err) => {
    console.error('[StreamTracker] Stream body error:', err);
    res.end();
  });
}
