import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import morgan from 'morgan';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { createHash, timingSafeEqual } from 'crypto';
import { rateLimit } from 'express-rate-limit';
import { dbService } from '../db/DBService';
import { providerManager } from '../provider/ProviderManager';
import { trackStreamAndLog, LogData } from '../../utils/proxy/StreamTracker';
import { calculateCost } from '../../utils/proxy/Pricing';
import { checkKeyLimits, recordKeyRequest, invalidateKeyCache, getKeyUsageStats, KeyLimits } from '../../utils/proxy/KeyLimitsCache';
import { mcpService } from '../mcp/MCPService';
import { MaintenanceService } from '../maintenance/MaintenanceService';
import { searchAdapter } from '../search/SearchAdapter';
import { cacheService } from '../cache/CacheService';
import { randomUUID } from 'crypto';
import * as fs from 'fs';

const app = express();
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('[FATAL] JWT_SECRET environment variable is not set. Exiting.');
  process.exit(1);
}

// Middleware
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.length === 0 || allowedOrigins.includes('*')) return callback(null, true);
    
    const normalizedOrigin = origin.replace(/\/$/, '');
    const isAllowed = allowedOrigins.some(ao => ao.replace(/\/$/, '') === normalizedOrigin);
    
    if (isAllowed) {
      callback(null, true);
    } else {
      console.warn(`[CORS] Blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

if (process.env.DEV_MODE !== 'true') {
  const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' }
  });
  app.use('/v1/', limiter);
}

app.use(bodyParser.json({ limit: '50mb' }));
app.use(morgan('combined'));

// Root Info
app.get('/', (req, res) => {
  res.json({
    status: "active",
    service: "Opencode Wrapper API (TS)",
    version: "2.0.0",
    endpoints: ["/v1/chat/completions", "/v1/images/generations", "/v1/images/edits", "/v1/models"]
  });
});

// In-memory cache for images (to support refinement) - max 100 entries
const IMAGE_CACHE_MAX = 100;
const imageCache = new Map<string, { media: any; timestamp: number }>();

// --- Authentication Middlewares ---

const verifyToken = (req: any, res: Response, next: NextFunction) => {
  const token = req.headers['x-access-token'] || req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(403).json({ error: 'A token is required' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid Token' });
  }
};

const verifyWrapperKey = async (req: any, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = req.headers['x-access-token'] || (authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null);

  if (!token) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  // 1. Try JWT first (For Admin Dashboard Playground)
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    req.wrapperKeyId = null; // Mark as admin session
    return next();
  } catch (err) {
    // Not a valid JWT, proceed to Wrapper Key check
  }

  // 2. Try Wrapper Key (External API)
  const hash = createHash('sha256').update(token).digest('hex');

  try {
    const keyRecord = await dbService.get<any>(
      `SELECT id, is_active, rate_limit_rpm, rate_limit_rph, rate_limit_rpd,
              max_lifetime_requests, monthly_token_limit, monthly_cost_limit_usd
       FROM wrapper_keys WHERE api_key_hash = ?`,
      [hash]
    );
    if (keyRecord && keyRecord.is_active) {
      req.wrapperKeyId = keyRecord.id;

      // Check per-key limits
      const limits: KeyLimits = {
        rate_limit_rpm: keyRecord.rate_limit_rpm,
        rate_limit_rph: keyRecord.rate_limit_rph,
        rate_limit_rpd: keyRecord.rate_limit_rpd,
        max_lifetime_requests: keyRecord.max_lifetime_requests,
        monthly_token_limit: keyRecord.monthly_token_limit,
        monthly_cost_limit_usd: keyRecord.monthly_cost_limit_usd,
      };

      const hasAnyLimit = Object.values(limits).some(v => v !== null);
      if (hasAnyLimit) {
        const check = await checkKeyLimits(keyRecord.id, limits);
        if (!check.allowed) {
          const status = check.statusCode || 429;
          const type = status === 429 ? 'rate_limit_exceeded' : 'budget_exceeded';
          const headers: Record<string, string> = {};
          if (check.retryAfter) {
            headers['Retry-After'] = String(check.retryAfter);
          }
          return res.status(status).set(headers).json({
            error: { message: check.reason, type, retry_after: check.retryAfter || undefined }
          });
        }
      }

      req.keyLimits = limits;
      return next();
    }
  } catch (err) {
    console.error('[ProxyServer] Key verification error:', (err as Error).message);
  }

  return res.status(401).json({ error: 'Invalid API Key' });
};

// --- API Routes ---

/**
 * @route POST /v1/chat/completions
 * OpenAI-compatible Chat Completions endpoint with Fallback & Vision
 */
app.post('/v1/chat/completions', verifyWrapperKey, async (req: any, res: Response) => {
  const { model, messages, stream, temperature, max_tokens, tools, use_deep_search } = req.body;
  const startTime = Date.now();

  try {
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    // 1. Detect Vision
    const hasImages = messages.some((msg: any) =>
      Array.isArray(msg.content) && msg.content.some((item: any) => item.type === 'image_url')
    );

    // 2. Process Messages (flatten if no vision)
    const processedMessages = hasImages ? messages : messages.map((msg: any) => {
      if (Array.isArray(msg.content)) {
        const flattened = msg.content.map((item: any) => {
          if (item.type === 'image_url') return '[Image]';
          return item.text || '';
        }).join(' ');
        return { ...msg, content: flattened };
      }
      return msg;
    });

    let headersSent = false;

    // 2.5 Handle Deep Search if requested
    if (use_deep_search) {
      const lastUserString = processedMessages.filter((m: any) => m.role === 'user').pop()?.content || '';
      if (lastUserString) {
        console.log(`[Proxy] Deep Search enabled for query: "${lastUserString.substring(0, 50)}..."`);
        
        let onProgress;
        if (stream) {
          if (!headersSent) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            headersSent = true;
          }
          res.write(`data: ${JSON.stringify({ deep_search_status: "Initializing Deep Search engine..." })}\n\n`);
          if (typeof (res as any).flush === 'function') (res as any).flush();

          onProgress = (msg: string) => {
             res.write(`data: ${JSON.stringify({ deep_search_status: msg })}\n\n`);
             if (typeof (res as any).flush === 'function') (res as any).flush();
          };
        }

        // Find URLs and grab content (top 3)
        const researchResults = await searchAdapter.deepResearch(lastUserString, 3, onProgress);
        
        let systemPromptIndex = processedMessages.findIndex((m: any) => m.role === 'system');
        const deepSearchPrompt = `\n\n[DEEP SEARCH WEBCONTEXT] You have live access to the web. Below is information scraped from the web relative to the user's latest query. Use this to provide an up-to-date and highly accurate answer. Please cite the URLs if you utilize information from them:\n\n${researchResults.map(r => `--- SOURCE: ${r.url} ---\nTITLE: ${r.title}\nCONTENT:\n${r.content.substring(0, 12000)}...\n--- END SOURCE ---`).join('\n\n')}`;

        if (systemPromptIndex >= 0) {
          processedMessages[systemPromptIndex].content += deepSearchPrompt;
        } else {
          processedMessages.unshift({ role: 'system', content: `You are an AI assistant with Deep Search capabilities.${deepSearchPrompt}` });
        }
      }
    }

    // 3. Provider selection with Fallback
    let requestedModel = model;
    let providersToTry = providerManager.getOrderedProviders({ requiresVision: hasImages }).slice(0, 3);
    
    // Check for forced provider
    const forcedProvider = req.headers['x-force-provider'] as string;
    if (forcedProvider) {
      providersToTry = [forcedProvider];
    }

    let success = false;
    let lastError: any = null;

    for (const providerName of providersToTry) {
      try {
        const actualModel = providerManager.getBestModelForProvider(providerName, hasImages);
        const logData: LogData = {
          wrapperKeyId: req.wrapperKeyId,
          provider: providerName,
          model: actualModel,
          startTime,
          ip: req.ip || 'unknown'
        };

        console.log(`[Proxy] Routing ${model || 'default'} -> ${actualModel} via ${providerName}`);

        const response: any = await providerManager.makeRequest(providerName, '/chat/completions', {
          method: 'POST',
          body: JSON.stringify({ 
            model: actualModel, 
            messages: processedMessages, 
            stream, 
            temperature, 
            max_tokens,
            ...(tools && { tools })
          }),
          stream
        });

        if (stream) {
          if (!headersSent) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            headersSent = true;
          }
          trackStreamAndLog(response, res, logData);
          success = true;
          return;
        } else {
          // Add requested model name to response
          if (response.model) response.model = model || actualModel;
          
          const cost = calculateCost(response.usage || {}, providerName);
          const totalTokens = (response.usage?.prompt_tokens || 0) + (response.usage?.completion_tokens || 0);
          await dbService.run(
            `INSERT INTO request_logs (wrapper_key_id, provider, model, prompt_tokens, completion_tokens, latency_ms, status_code, cost_usd)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [req.wrapperKeyId, providerName, actualModel, response.usage?.prompt_tokens || 0, response.usage?.completion_tokens || 0, Date.now() - startTime, 200, cost]
          );
          recordKeyRequest(req.wrapperKeyId, totalTokens, cost);
          res.json(response);
          success = true;
          return;
        }
      } catch (err) {
        console.warn(`[Proxy] Provider ${providerName} failed:`, (err as Error).message);
        lastError = err;
      }
    }

    // 4. Final Fallback to OpenCode
    if (!success && !forcedProvider) {
      console.log(`[Proxy] Falling back to OpenCode...`);
      const providerName = 'opencode';
      const actualModel = process.env.DEFAULT_MODEL || 'minimax-m2.5-free';

      const response: any = await providerManager.makeRequest(providerName, '/chat/completions', {
        method: 'POST',
        body: JSON.stringify({ model: actualModel, messages: processedMessages, stream }),
        stream
      });

      const logData: LogData = { wrapperKeyId: req.wrapperKeyId, provider: providerName, model: actualModel, startTime, ip: req.ip || 'unknown' };

      if (stream) {
        if (!headersSent) {
          res.setHeader('Content-Type', 'text/event-stream');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Connection', 'keep-alive');
        }
        trackStreamAndLog(response, res, logData);
      } else {
        const cost = calculateCost(response.usage || {}, providerName);
        const totalTokens = (response.usage?.prompt_tokens || 0) + (response.usage?.completion_tokens || 0);
        await dbService.run(
          `INSERT INTO request_logs (wrapper_key_id, provider, model, prompt_tokens, completion_tokens, latency_ms, status_code, cost_usd)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [req.wrapperKeyId, providerName, actualModel, response.usage?.prompt_tokens || 0, response.usage?.completion_tokens || 0, Date.now() - startTime, 200, cost]
        );
        recordKeyRequest(req.wrapperKeyId, totalTokens, cost);
        res.json(response);
      }
      return;
    }

    throw lastError || new Error('All providers failed');
  } catch (err) {
    console.error('[Proxy] Final Error:', (err as Error).message);
    res.status(500).json({ error: { message: (err as Error).message } });
  }
});

/**
 * @route POST /v1/audio/speech
 */
app.post('/v1/audio/speech', verifyWrapperKey, async (req: any, res: Response) => {
  try {
    const { input, voice, speed } = req.body;
    if (!input) return res.status(400).json({ error: 'Input is required' });

    // Dynamic import to avoid issues if not needed
    // @ts-ignore
    const { Communicate } = await import('edge-tts-universal');
    
    const voiceMap: any = {
      'alloy': 'en-US-AvaMultilingualNeural',
      'echo': 'en-US-AndrewMultilingualNeural',
      'fable': 'en-GB-RyanNeural',
      'onyx': 'en-US-BrianMultilingualNeural',
      'nova': 'en-US-EmmaMultilingualNeural',
      'shimmer': 'en-US-JennyNeural'
    };

    const selectedVoice = voiceMap[voice] || voice || 'en-US-EmmaMultilingualNeural';
    const communicate = new Communicate(input, {
      voice: selectedVoice,
      rate: speed ? `${(speed - 1) * 100}%` : '+0%'
    });

    res.setHeader('Content-Type', 'audio/mpeg');
    for await (const chunk of communicate.stream()) {
      if (chunk.type === 'audio' && chunk.data) {
        res.write(chunk.data);
      }
    }
    res.end();
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * @route POST /v1/images/generations
 */
app.post('/v1/images/generations', verifyWrapperKey, async (req: any, res: Response) => {
  try {
    const { prompt, n = 1, size = '1024x1024' } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    // @ts-ignore
    const { Whisk } = await import('@rohitaryal/whisk-api');
    
    const whisk = new Whisk(process.env.COOKIE_WHISK || process.env.WHISK_API_KEY || '');
    const project = await whisk.newProject("AI Research Project");
    const media = await project.generateImage(prompt);

    if (media && media.encodedMedia) {
      const imageId = randomUUID();
      // Evict oldest entry if at capacity
      if (imageCache.size >= IMAGE_CACHE_MAX) {
        let oldestKey = '';
        let oldestTs = Infinity;
        for (const [k, v] of imageCache.entries()) {
          if (v.timestamp < oldestTs) { oldestTs = v.timestamp; oldestKey = k; }
        }
        if (oldestKey) imageCache.delete(oldestKey);
      }
      imageCache.set(imageId, { media, timestamp: Date.now() });

      res.json({
        created: Math.floor(Date.now() / 1000),
        data: [{ b64_json: media.encodedMedia, id: imageId }]
      });
    } else {
      throw new Error("Failed to generate image");
    }
  } catch (err) {
    res.status(500).json({ error: { message: (err as Error).message } });
  }
});

/**
 * @route POST /v1/images/edits
 */
app.post('/v1/images/edits', verifyWrapperKey, async (req: any, res: Response) => {
  try {
    const { image, prompt } = req.body;
    if (!image || !prompt) return res.status(400).json({ error: 'Image ID and prompt are required' });

    const cached = imageCache.get(image);
    if (!cached) return res.status(404).json({ error: 'Image not found or expired' });

    const refinedMedia = await cached.media.refine(prompt);
    if (refinedMedia && refinedMedia.encodedMedia) {
      const newImageId = randomUUID();
      imageCache.set(newImageId, { media: refinedMedia, timestamp: Date.now() });

      res.json({
        created: Math.floor(Date.now() / 1000),
        data: [{ b64_json: refinedMedia.encodedMedia, id: newImageId }]
      });
    } else {
      throw new Error("Failed to refine image");
    }
  } catch (err) {
    res.status(500).json({ error: { message: (err as Error).message } });
  }
});

/**
 * @route POST /v1/tools/execute
 */
app.post('/v1/tools/execute', verifyWrapperKey, async (req: any, res: Response) => {
  try {
    const { server, tool, arguments: toolArgs } = req.body;
    if (!server || !tool) return res.status(400).json({ error: 'Server and tool names are required' });

    const result = await mcpService.executeTool(server, tool, toolArgs);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: { message: (err as Error).message } });
  }
});

/**
 * @route GET /v1/models
 * List available models
 */
app.get('/v1/models', async (req: any, res: Response) => {
  const providers = providerManager.getOrderedProviders();
  console.log(`[ProxyServer] /v1/models called. Active providers: ${providers.join(', ')}`);
  const allModels: any[] = [];

  providers.forEach(p => {
    const config = providerManager.getProviderConfig(p);
    if (config) {
      console.log(`[ProxyServer] Adding ${config.models.length} models from ${p}`);
      config.models.forEach(m => {
        allModels.push({
          id: m,
          object: 'model',
          created: Math.floor(Date.now() / 1000),
          owned_by: p,
        });
      });
    }
  });

  res.json({ object: 'list', data: allModels });
});

// --- Admin / Auth Routes ---

app.post('/api/auth/login', async (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'All fields required' });

  try {
    const user = await dbService.get<any>('SELECT * FROM admin_users WHERE username = ?', [username]);
    
    let isValid = false;
    let userId = user?.id || 0;

    if (user && bcrypt.compareSync(password, user.password_hash)) {
      isValid = true;
    }

    // Fallback to .env credentials (timing-safe comparison)
    if (!isValid && process.env.ADMIN_USER && process.env.ADMIN_PASS) {
      const userBuf = Buffer.from(username);
      const passBuf = Buffer.from(password);
      const envUserBuf = Buffer.from(process.env.ADMIN_USER);
      const envPassBuf = Buffer.from(process.env.ADMIN_PASS);
      const userMatch = userBuf.length === envUserBuf.length && timingSafeEqual(userBuf, envUserBuf);
      const passMatch = passBuf.length === envPassBuf.length && timingSafeEqual(passBuf, envPassBuf);
      if (userMatch && passMatch) {
        isValid = true;
      }
    }

    if (isValid) {
      const token = jwt.sign({ user_id: userId, username }, JWT_SECRET, { expiresIn: '24h' });
      return res.json({ token, username });
    }

    res.status(401).json({ error: 'Invalid Credentials' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/admin/stats', verifyToken, async (req: any, res: Response) => {
  try {
    const stats: any = await dbService.get('SELECT COUNT(*) as requests, SUM(cost_usd) as cost, AVG(latency_ms) as latency FROM request_logs', []);
    const providers = providerManager.getProviderStatus();
    
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const dailyCosts = await dbService.all(`
      SELECT date(timestamp/1000, 'unixepoch') as date, SUM(cost_usd) as cost
      FROM request_logs
      WHERE timestamp >= ?
      GROUP BY date
    `, [sevenDaysAgo]);

    res.json({
      totalRequests: stats.requests || 0,
      totalCost: stats.cost || 0,
      avgLatency: stats.latency || 0,
      dailyCosts,
      configuredProviders: Object.keys(providers).length,
      activeProviders: Object.values(providers).filter((p: any) => p.health_status === 'healthy').length
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/admin/providers', verifyToken, async (req: any, res: Response) => {
  res.json(providerManager.getProviderStatus());
});

app.get('/api/admin/health', verifyToken, async (req: any, res: Response) => {
  const redisOk = cacheService.connected;
  let dbOk = false;
  try {
    await dbService.get('SELECT 1', []);
    dbOk = true;
  } catch {}

  const providers = providerManager.getProviderStatus();
  const activeCount = Object.values(providers).filter((p: any) => p.health_status === 'healthy').length;

  res.json({
    database: dbOk ? 'operational' : 'down',
    redis: redisOk ? 'operational' : 'down',
    proxy: 'online',
    providers: { active: activeCount, total: Object.keys(providers).length },
    maintenance: 'running'
  });
});

app.get('/api/admin/logs', verifyToken, async (req: any, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const offset = (page - 1) * limit;

  try {
    const logs = await dbService.all(`
      SELECT r.*, w.name as client_name 
      FROM request_logs r 
      LEFT JOIN wrapper_keys w ON r.wrapper_key_id = w.id 
      ORDER BY r.timestamp DESC LIMIT ? OFFSET ?
    `, [limit, offset]);
    
    const count: any = await dbService.get('SELECT COUNT(*) as count FROM request_logs', []);
    
    res.json({
      data: logs,
      pagination: {
        page,
        limit,
        total_pages: Math.ceil((count?.count || 0) / limit),
        total_items: count?.count || 0
      }
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// --- Provider Key Management ---

app.get('/api/admin/provider-keys', verifyToken, async (req: any, res: Response) => {
  try {
    const keys = await dbService.all('SELECT id, provider_name, is_active, added_at FROM provider_keys', []);
    res.json(keys);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

const VALID_PROVIDERS = ['groq', 'nvidia', 'gemini', 'openrouter', 'together', 'fireworks', 'cerebras', 'anthropic', 'deepseek', 'mistral', 'cohere', 'opencode', 'aitools', 'megallm'];

app.post('/api/admin/provider-keys', verifyToken, async (req: any, res: Response) => {
  const { provider_name, api_key } = req.body;
  if (!provider_name || !api_key) return res.status(400).json({ error: 'Provider name and API key are required' });
  if (!VALID_PROVIDERS.includes(provider_name)) return res.status(400).json({ error: `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(', ')}` });
  if (typeof api_key !== 'string' || api_key.trim().length < 5) return res.status(400).json({ error: 'API key must be at least 5 characters' });

  try {
    await dbService.run('INSERT INTO provider_keys (provider_name, api_key) VALUES (?, ?)', [provider_name, api_key]);
    await providerManager.reloadKeysFromDB();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.delete('/api/admin/provider-keys/:id', verifyToken, async (req: any, res: Response) => {
  try {
    await dbService.run('DELETE FROM provider_keys WHERE id = ?', [req.params.id]);
    await providerManager.reloadKeysFromDB();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/admin/usage-report', verifyToken, async (req: any, res: Response) => {
  try {
    const costByClient = await dbService.all(`
      SELECT w.name as client_name, COUNT(*) as request_count, SUM(r.cost_usd) as total_cost
      FROM request_logs r
      LEFT JOIN wrapper_keys w ON r.wrapper_key_id = w.id
      GROUP BY w.name ORDER BY total_cost DESC
    `, []);

    const costByProvider = await dbService.all(`
      SELECT provider, COUNT(*) as request_count, SUM(cost_usd) as total_cost
      FROM request_logs
      GROUP BY provider ORDER BY total_cost DESC
    `, []);

    res.json({ costByClient, costByProvider });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/admin/pricing', verifyToken, async (req: any, res: Response) => {
  try {
    const pricing = await dbService.all('SELECT * FROM model_pricing', []);
    res.json(pricing);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/admin/pricing', verifyToken, async (req: any, res: Response) => {
  const { provider, model, input_cost_per_1m, output_cost_per_1m } = req.body;
  if (!provider || !model) return res.status(400).json({ error: 'Provider and Model are required' });
  if (typeof provider !== 'string' || provider.length > 50) return res.status(400).json({ error: 'Invalid provider name' });
  if (typeof model !== 'string' || model.length > 100) return res.status(400).json({ error: 'Invalid model name' });
  const inputCost = Number(input_cost_per_1m);
  const outputCost = Number(output_cost_per_1m);
  if (isNaN(inputCost) || inputCost < 0 || isNaN(outputCost) || outputCost < 0) return res.status(400).json({ error: 'Costs must be non-negative numbers' });

  try {
    await dbService.run(`
      INSERT INTO model_pricing (provider, model, input_cost_per_1m, output_cost_per_1m)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(provider, model) DO UPDATE SET
        input_cost_per_1m = excluded.input_cost_per_1m,
        output_cost_per_1m = excluded.output_cost_per_1m,
        updated_at = CURRENT_TIMESTAMP
    `, [provider, model, input_cost_per_1m || 0, output_cost_per_1m || 0]);

    providerManager.pricingCache.delete(`${provider}:${model}`);
    if (model === '*') providerManager.pricingCache.clear();

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.delete('/api/admin/pricing/:id', verifyToken, async (req: any, res: Response) => {
  try {
    const pricingRow = await dbService.get<any>('SELECT provider, model FROM model_pricing WHERE id = ?', [req.params.id]);
    await dbService.run('DELETE FROM model_pricing WHERE id = ?', [req.params.id]);

    if (pricingRow) {
      providerManager.pricingCache.delete(`${pricingRow.provider}:${pricingRow.model}`);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// --- Key Management ---

app.get('/api/keys', verifyToken, async (req: any, res: Response) => {
  try {
    const keys = await dbService.all(
      `SELECT id, name, prefix, is_active, created_at,
              rate_limit_rpm, rate_limit_rph, rate_limit_rpd,
              max_lifetime_requests, monthly_token_limit, monthly_cost_limit_usd
       FROM wrapper_keys`,
      []
    );
    res.json(keys);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/keys', verifyToken, async (req: any, res: Response) => {
  const { name, prefix = 'sk', rate_limit_rpm, rate_limit_rph, rate_limit_rpd, max_lifetime_requests, monthly_token_limit, monthly_cost_limit_usd } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  const apiKey = `${prefix}-${randomUUID().replace(/-/g, '')}`;
  const hash = createHash('sha256').update(apiKey).digest('hex');
  const displayPrefix = apiKey.substring(0, 10) + '...';

  // Normalize limit values: convert undefined/empty to null, validate numbers
  const normLimit = (v: any): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return isNaN(n) || n < 0 ? null : n;
  };

  try {
    await dbService.run(
      `INSERT INTO wrapper_keys (name, api_key_hash, prefix, rate_limit_rpm, rate_limit_rph, rate_limit_rpd, max_lifetime_requests, monthly_token_limit, monthly_cost_limit_usd)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, hash, displayPrefix, normLimit(rate_limit_rpm), normLimit(rate_limit_rph), normLimit(rate_limit_rpd), normLimit(max_lifetime_requests), normLimit(monthly_token_limit), normLimit(monthly_cost_limit_usd)]
    );
    res.json({ api_key: apiKey, name });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.patch('/api/keys/:id/toggle', verifyToken, async (req: any, res: Response) => {
  try {
    const key = await dbService.get<any>('SELECT id, is_active FROM wrapper_keys WHERE id = ?', [req.params.id]);
    if (!key) return res.status(404).json({ error: 'Key not found' });
    const newStatus = key.is_active ? 0 : 1;
    await dbService.run('UPDATE wrapper_keys SET is_active = ? WHERE id = ?', [newStatus, req.params.id]);
    res.json({ success: true, is_active: newStatus });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.put('/api/keys/:id/limits', verifyToken, async (req: any, res: Response) => {
  try {
    const key = await dbService.get<any>('SELECT id FROM wrapper_keys WHERE id = ?', [req.params.id]);
    if (!key) return res.status(404).json({ error: 'Key not found' });

    const limitFields = ['rate_limit_rpm', 'rate_limit_rph', 'rate_limit_rpd', 'max_lifetime_requests', 'monthly_token_limit', 'monthly_cost_limit_usd'];
    const updates: string[] = [];
    const values: any[] = [];

    for (const field of limitFields) {
      if (field in req.body) {
        const val = req.body[field];
        const normalized = (val === null || val === undefined || val === '') ? null : Number(val);
        if (normalized !== null && (isNaN(normalized) || normalized < 0)) {
          return res.status(400).json({ error: `Invalid value for ${field}` });
        }
        updates.push(`${field} = ?`);
        values.push(normalized);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No limit fields provided' });
    }

    values.push(req.params.id);
    await dbService.run(`UPDATE wrapper_keys SET ${updates.join(', ')} WHERE id = ?`, values);

    // Invalidate in-memory cache so new limits take effect immediately
    invalidateKeyCache(Number(req.params.id));

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/keys/:id/usage', verifyToken, async (req: any, res: Response) => {
  try {
    const key = await dbService.get<any>(
      `SELECT id, rate_limit_rpm, rate_limit_rph, rate_limit_rpd,
              max_lifetime_requests, monthly_token_limit, monthly_cost_limit_usd
       FROM wrapper_keys WHERE id = ?`,
      [req.params.id]
    );
    if (!key) return res.status(404).json({ error: 'Key not found' });

    const usage = await getKeyUsageStats(Number(req.params.id));

    res.json({
      ...usage,
      limits: {
        rate_limit_rpm: key.rate_limit_rpm,
        rate_limit_rph: key.rate_limit_rph,
        rate_limit_rpd: key.rate_limit_rpd,
        max_lifetime_requests: key.max_lifetime_requests,
        monthly_token_limit: key.monthly_token_limit,
        monthly_cost_limit_usd: key.monthly_cost_limit_usd,
      }
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.delete('/api/keys/:id', verifyToken, async (req: any, res: Response) => {
  try {
    await dbService.run('DELETE FROM wrapper_keys WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Export the app
export const proxyApp = app;

const PORT = process.env.PROXY_PORT || process.env.PORT || 3010;
export function startProxyServer() {
  MaintenanceService.start(imageCache);
  app.listen(PORT, () => {
    console.log(`[ProxyServer] Running on http://localhost:${PORT}`);
    console.log(`[ProxyServer] Admin API: /api/admin/stats`);
    console.log(`[ProxyServer] OpenAI API: /v1/chat/completions`);
  });
}
