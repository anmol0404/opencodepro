import { dbService } from '../db/DBService';
import nodeFetch, { Response } from 'node-fetch';

export interface ProviderConfig {
  baseUrl: string;
  apiKeys: string[];
  models: string[];
}

export interface ProviderStats {
  priority: number;
  speed_score: number;
  error_rate: number;
  total_requests: number;
  successful_requests: number;
  avg_response_time: number;
  health_status: 'healthy' | 'degraded' | 'unhealthy';
  last_updated: string;
  response_times: number[];
  sequential_errors?: number;
}

export class ProviderManager {
  private providers: Record<string, ProviderConfig> = {};
  private stats: Record<string, ProviderStats> = {};
  public pricingCache: Map<string, { input: number; output: number }> = new Map();

  private speedWeightMultiplier: number;
  private errorPenaltyMultiplier: number;
  private statsUpdateInterval: number;
  private maxStatsHistory: number;
  private healthCheckInterval: number;
  private statsSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private statsSavePending = false;

  constructor() {
    this.speedWeightMultiplier = parseFloat(process.env.SPEED_WEIGHT_MULTIPLIER || '0.6');
    this.errorPenaltyMultiplier = parseFloat(process.env.ERROR_PENALTY_MULTIPLIER || '3.0');
    this.statsUpdateInterval = parseInt(process.env.STATS_UPDATE_INTERVAL || '5000');
    this.maxStatsHistory = parseInt(process.env.MAX_STATS_HISTORY || '1000');
    this.healthCheckInterval = parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000');

    this.initializeProviders();
  }

  private initializeProviders() {
    const providerConfigs: Record<string, ProviderConfig> = {
      groq: {
        baseUrl: process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1',
        apiKeys: this.parseApiKeys(process.env.GROQ_API_KEYS),
        models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'gemma2-9b-it']
      },
      nvidia: {
        baseUrl: process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1',
        apiKeys: this.parseApiKeys(process.env.NVIDIA_API_KEYS),
        models: [
          'meta/llama3-70b-instruct', 'meta/llama3-8b-instruct', 'microsoft/wizardlm-2-8x22b',
          'gpt-3.5-turbo', 'gpt-4', 'nvidia/llama-3.2-11b-vision-instruct'
        ]
      },
      gemini: {
        baseUrl: process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta',
        apiKeys: this.parseApiKeys(process.env.GEMINI_API_KEYS),
        models: ['gemini-pro', 'gemini-pro-vision', 'gemini-1.5-pro', 'gemini-1.5-flash']
      },
      openrouter: {
        baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
        apiKeys: this.parseApiKeys(process.env.OPENROUTER_API_KEYS),
        models: [
          'anthropic/claude-3-haiku', 'openai/gpt-4o-mini', 'meta-llama/llama-3.1-405b-instruct',
          'gpt-3.5-turbo', 'gpt-4', 'gpt-4o', 'google/gemini-flash-1.5'
        ]
      },
      together: {
        baseUrl: process.env.TOGETHER_BASE_URL || 'https://api.together.xyz/v1',
        apiKeys: this.parseApiKeys(process.env.TOGETHER_API_KEYS),
        models: ['meta-llama/Llama-2-70b-chat-hf', 'mistralai/Mistral-7B-Instruct-v0.1']
      },
      fireworks: {
        baseUrl: process.env.FIREWORKS_BASE_URL || 'https://api.fireworks.ai/inference/v1',
        apiKeys: this.parseApiKeys(process.env.FIREWORKS_API_KEYS),
        models: ['accounts/fireworks/models/llama-v3-70b-instruct', 'accounts/fireworks/models/mixtral-8x7b-instruct']
      },
      cerebras: {
        baseUrl: process.env.CEREBRAS_BASE_URL || 'https://api.cerebras.ai/v1',
        apiKeys: this.parseApiKeys(process.env.CEREBRAS_API_KEYS),
        models: ['llama-3.3-70b', 'llama3.1-8b', 'gpt-3.5-turbo', 'gpt-4']
      },
      anthropic: {
        baseUrl: process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1',
        apiKeys: this.parseApiKeys(process.env.ANTHROPIC_API_KEYS),
        models: ['claude-3-haiku-20240307', 'claude-3-sonnet-20240229']
      },
      deepseek: {
        baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
        apiKeys: this.parseApiKeys(process.env.DEEPSEEK_API_KEYS),
        models: ['deepseek-chat', 'deepseek-coder']
      },
      mistral: {
        baseUrl: process.env.MISTRAL_BASE_URL || 'https://api.mistral.ai/v1',
        apiKeys: this.parseApiKeys(process.env.MISTRAL_API_KEYS),
        models: ['mistral-large-latest', 'mistral-medium', 'mistral-small']
      },
      cohere: {
        baseUrl: process.env.COHERE_BASE_URL || 'https://api.cohere.ai/v1',
        apiKeys: this.parseApiKeys(process.env.COHERE_API_KEYS),
        models: ['command', 'command-light', 'command-r']
      },
      opencode: {
        baseUrl: process.env.ZEN_BASE_URL || 'https://opencode.ai/zen/v1',
        apiKeys: [process.env.ZEN_API_KEY || 'your-zen-api-key-here'],
        models: ['minimax-m2.5-free', 'trinity-large-preview-free', 'grok-code']
      },
      aitools: {
        baseUrl: process.env.AITOOLS_BASE_URL || 'https://platform.aitools.cfd/api/v1',
        apiKeys: this.parseApiKeys(process.env.AITOOLS_API_KEYS),
        models: [
          'qwen/qwen3-8b', 'qwen/qwen3-30b-a3b', 'qwen/qwen3-coder', 'qwen/qwen3-14b',
          'deepseek/deepseek-r1-70b', 'deepseek/deepseek-r1-32b', 'deepseek/deepseek-v3-0324',
          'google/gemini-2.0-flash-exp', 'google/gemma-3-27b',
          'zhipu/glm-4-flash', 'zhipu/glm-4-9b', 'zhipu/glm-4v-flash',
          'zhipu/glm-4.1v-thinking-flash', 'zhipu/glm-4.6v-flash', 'zhipu/glm-4.7-flash',
          'qwen/qwen2.5-72b', 'qwen/qwen2.5-7b', 'qwen/qwen2.5-vl-32b'
        ]
      },
      megallm: {
        baseUrl: process.env.MEGALLM_BASE_URL || 'https://api.megallm.ai/v1',
        apiKeys: this.parseApiKeys(process.env.MEGALLM_API_KEY),
        models: ['llama-3-70b-instruct', 'gpt-4o', 'gpt-4o-mini']
      }
    };

    this.providers = providerConfigs;

    // Initialize stats
    Object.keys(this.providers).forEach(name => {
      this.stats[name] = {
        priority: this.getBasePriority(name),
        speed_score: 50,
        error_rate: 0,
        total_requests: 0,
        successful_requests: 0,
        avg_response_time: 1000,
        health_status: 'healthy',
        response_times: [],
        last_updated: new Date().toISOString()
      };
    });

    // Wait for DB to be ready before loading stats/keys
    dbService.ready.then(() => {
      this.loadStatsFromDB().catch(console.error);
      this.reloadKeysFromDB().catch(console.error);
    }).catch(console.error);
    this.startPeriodicTasks();
  }

  public async reloadKeysFromDB() {
    try {
      const rows = await dbService.all<{ provider_name: string; api_key: string }>(
        'SELECT provider_name, api_key FROM provider_keys WHERE is_active = 1',
        []
      );

      const dbKeys: Record<string, string[]> = {};
      rows.forEach(row => {
        if (!dbKeys[row.provider_name]) dbKeys[row.provider_name] = [];
        dbKeys[row.provider_name].push(row.api_key);
      });

      Object.keys(this.providers).forEach(p => {
        if (dbKeys[p]) {
          const currentKeys = new Set(this.providers[p].apiKeys);
          dbKeys[p].forEach(k => currentKeys.add(k));
          this.providers[p].apiKeys = Array.from(currentKeys);
        }
      });
      console.log('[ProviderManager] Keys reloaded from DB');
    } catch (err) {
      console.error('[ProviderManager] Failed to reload keys:', (err as Error).message);
    }
  }

  private parseApiKeys(keysStr?: string): string[] {
    if (!keysStr || keysStr === 'your-api-key-here') return [];
    return keysStr.split(',').map(k => k.trim()).filter(k => k && k !== 'your-api-key-here');
  }

  private getBasePriority(name: string): number {
    const priorityOrder = (process.env.PROVIDER_PRIORITY || 'cerebras,groq,nvidia,gemini,deepseek,opencode,aitools').split(',');
    const index = priorityOrder.indexOf(name);
    return index >= 0 ? Math.max(10, 100 - (index * 5)) : 50;
  }

  private async loadStatsFromDB() {
    try {
      const rows = await dbService.all<any>('SELECT * FROM provider_stats', []);
      rows.forEach(row => {
        if (this.stats[row.provider_name]) {
          const s = this.stats[row.provider_name];
          s.priority = row.priority;
          s.speed_score = row.speed_score;
          s.error_rate = row.error_rate;
          s.total_requests = row.total_requests;
          s.successful_requests = row.successful_requests;
          s.avg_response_time = row.avg_response_time;
          s.health_status = row.health_status;
          s.last_updated = row.last_updated;
          s.response_times = row.response_times_json ? JSON.parse(row.response_times_json) : [];
        }
      });
      console.log('[ProviderManager] Stats loaded from DB');
    } catch (err) {
      console.error('[ProviderManager] Failed to load stats:', (err as Error).message);
    }
  }

  public async saveStatsToDB() {
    for (const [name, s] of Object.entries(this.stats)) {
      if (!this.providers[name]) continue;
      await dbService.run(
        `INSERT INTO provider_stats (
          provider_name, priority, speed_score, error_rate, total_requests, successful_requests,
          avg_response_time, health_status, last_updated, response_times_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(provider_name) DO UPDATE SET
          priority=excluded.priority,
          speed_score=excluded.speed_score,
          error_rate=excluded.error_rate,
          total_requests=excluded.total_requests,
          successful_requests=excluded.successful_requests,
          avg_response_time=excluded.avg_response_time,
          health_status=excluded.health_status,
          last_updated=excluded.last_updated,
          response_times_json=excluded.response_times_json`,
        [
          name, s.priority, s.speed_score, s.error_rate, s.total_requests,
          s.successful_requests, s.avg_response_time, s.health_status,
          s.last_updated, JSON.stringify(s.response_times)
        ]
      );
    }
  }

  public updateStats(name: string, data: { success: boolean; responseTime: number; isAuthError?: boolean }) {
    const s = this.stats[name];
    if (!s) return;

    s.total_requests++;
    if (data.success) {
      s.successful_requests++;
      s.response_times.push(data.responseTime);
      if (s.response_times.length > this.maxStatsHistory) s.response_times.shift();

      s.avg_response_time = s.response_times.reduce((a, b) => a + b, 0) / s.response_times.length;
      const normalizedTime = Math.min(1000, s.avg_response_time) / 10;
      s.speed_score = Math.max(0, 100 - normalizedTime);
      s.sequential_errors = 0;
    } else {
      if (data.isAuthError) {
        s.error_rate = 1.0;
        s.health_status = 'unhealthy';
      } else {
        s.error_rate = (s.total_requests - s.successful_requests) / s.total_requests;
      }
      s.sequential_errors = (s.sequential_errors || 0) + 1;
    }

    s.priority = this.calculatePriority(name);
    s.health_status = this.determineHealth(s);
    s.last_updated = new Date().toISOString();

    this.debouncedSaveStats();
  }

  private debouncedSaveStats() {
    this.statsSavePending = true;
    if (this.statsSaveTimer) return;
    this.statsSaveTimer = setTimeout(async () => {
      this.statsSaveTimer = null;
      if (this.statsSavePending) {
        this.statsSavePending = false;
        await this.saveStatsToDB().catch(console.error);
      }
    }, 5000);
  }

  private calculatePriority(name: string): number {
    const s = this.stats[name];
    const basePriority = this.getBasePriority(name);
    const speedWeight = s.speed_score * this.speedWeightMultiplier;
    const errorPenalty = (s.error_rate * 100) * this.errorPenaltyMultiplier;
    const healthyBonus = s.health_status === 'healthy' ? 20 : 0;

    return Math.max(0, Math.min(200, basePriority + speedWeight - errorPenalty + healthyBonus));
  }

  private determineHealth(s: ProviderStats): 'healthy' | 'degraded' | 'unhealthy' {
    if (s.error_rate > 0.5 || (s.sequential_errors || 0) > 3) return 'unhealthy';
    if (s.error_rate > 0.2) return 'degraded';
    return 'healthy';
  }

  public getOrderedProviders(options: { requiresVision?: boolean } = {}): string[] {
    const { requiresVision = false } = options;

    let providers = Object.keys(this.providers).filter(name => {
      const config = this.providers[name];
      return config.apiKeys.length > 0 && this.stats[name].health_status !== 'unhealthy';
    });

    if (requiresVision) {
      const visionPriority = ['nvidia', 'openai', 'anthropic', 'google', 'groq', 'together', 'openrouter'];
      providers.sort((a, b) => {
        const indexA = visionPriority.indexOf(a);
        const indexB = visionPriority.indexOf(b);

        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;

        const priorityDiff = this.stats[b].priority - this.stats[a].priority;
        return priorityDiff !== 0 ? priorityDiff : Math.random() - 0.5;
      });
    } else {
      providers.sort((a, b) => {
        const priorityDiff = this.stats[b].priority - this.stats[a].priority;
        if (priorityDiff !== 0) return priorityDiff;
        return Math.random() - 0.5;
      });
    }

    return providers;
  }

  public getBestModel(requiresVision: boolean = false): { provider: string; model: string } {
    const orderedProviders = this.getOrderedProviders({ requiresVision });

    if (orderedProviders.length === 0) {
      return { provider: 'opencode', model: process.env.DEFAULT_MODEL || 'minimax-m2.5-free' };
    }

    const bestProvider = orderedProviders[0];
    const model = this.getBestModelForProvider(bestProvider, requiresVision);

    return { provider: bestProvider, model };
  }

  public getBestModelForProvider(providerName: string, requiresVision: boolean = false): string {
    if (requiresVision) return this.getBestVisionModelForProvider(providerName);
    const config = this.providers[providerName];
    if (!config || config.models.length === 0) return 'gpt-3.5-turbo';
    return config.models[0];
  }

  public getBestVisionModelForProvider(providerName: string): string {
    const visionModels: Record<string, string> = {
      'nvidia': 'nvidia/llama-3.2-11b-vision-instruct',
      'groq': 'llama-3.2-11b-vision-preview',
      'openai': 'gpt-4o',
      'anthropic': 'claude-3-5-sonnet-20240620',
      'google': 'gemini-1.5-flash',
      'openrouter': 'google/gemini-flash-1.5',
      'mistral': 'pixtral-12b-2409',
      'together': 'meta-llama/Llama-3.2-11B-Vision-Instruct-Turbo',
      'fireworks': 'accounts/fireworks/models/llama-v3p2-11b-vision-instruct'
    };

    if (visionModels[providerName]) return visionModels[providerName];

    const config = this.providers[providerName];
    if (config) {
      const found = config.models.find(m =>
        m.toLowerCase().includes('vision') ||
        m.toLowerCase().includes('gpt-4o') ||
        m.toLowerCase().includes('pixtral')
      );
      if (found) return found;
    }

    return this.getBestModelForProvider(providerName);
  }

  public getBestProvider(): string {
    const list = this.getOrderedProviders();
    return list.length > 0 ? list[0] : 'opencode';
  }

  public getProviderConfig(name: string) {
    const config = this.providers[name];
    if (!config || config.apiKeys.length === 0) return null;

    // Key rotation per minute
    const keyIndex = Math.floor(Date.now() / 60000) % config.apiKeys.length;
    return { ...config, apiKey: config.apiKeys[keyIndex], keyIndex };
  }

  private startPeriodicTasks() {
    setInterval(() => this.performHealthChecks(), this.healthCheckInterval);
  }

  private async performHealthChecks() {
    const providersToCheck = Object.keys(this.providers).filter(name => this.providers[name].apiKeys.length > 0);

    for (const name of providersToCheck) {
      try {
        const config = this.getProviderConfig(name);
        if (!config) continue;

        const startTime = Date.now();
        const headers: Record<string, string> = {};
        if (name === 'gemini') headers['x-goog-api-key'] = config.apiKey;
        else headers['Authorization'] = `Bearer ${config.apiKey}`;

        const response = await nodeFetch(`${config.baseUrl}/models`, {
          method: 'GET',
          headers,
          timeout: 5000
        });

        this.updateStats(name, {
          success: response.ok,
          responseTime: Date.now() - startTime,
          isAuthError: response.status === 401 || response.status === 403
        });

        if (response.ok) console.log(`[ProviderManager] ${name} health check passed`);
      } catch (err) {
        this.updateStats(name, { success: false, responseTime: 5000 });
      }
    }
  }

  public async makeRequest(name: string, endpoint: string, options: any): Promise<any> {
    const config = this.getProviderConfig(name);
    if (!config) throw new Error(`No valid config for ${name}`);

    const startTime = Date.now();
    let success = false;
    let isAuthError = false;

    try {
      const url = `${config.baseUrl}${endpoint}`;
      const headers = { 'Content-Type': 'application/json', ...options.headers };

      if (name === 'gemini') headers['x-goog-api-key'] = config.apiKey;
      else headers['Authorization'] = `Bearer ${config.apiKey}`;

      const requestTimeout = options.stream ? 60000 : 30000;
      const response = await nodeFetch(url, { ...options, headers, timeout: requestTimeout });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) isAuthError = true;
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      success = true;
      if (options.stream) return response;
      const data = await response.json();

      // Pricing logic
      if (data.usage) {
        const cacheKey = `${name}:${data.model || 'unknown'}`;
        let pricing = this.pricingCache.get(cacheKey);
        if (!pricing) {
          const row = await dbService.get<any>(
            `SELECT input_cost_per_1m, output_cost_per_1m 
             FROM model_pricing 
             WHERE (provider = ? AND model = ?) 
                OR (provider = ? AND model = '*') 
                OR (provider = 'default' AND model = '*')
             ORDER BY (provider = ? AND model = ?) DESC, (provider = ? AND model = '*') DESC
             LIMIT 1`,
            [name, data.model, name, name, data.model, name]
          );
          pricing = row ? { input: row.input_cost_per_1m, output: row.output_cost_per_1m } : { input: 0.50, output: 1.50 };
          this.pricingCache.set(cacheKey, pricing);
        }
        data.cost_usd = ((data.usage.prompt_tokens / 1000000) * pricing.input) +
          ((data.usage.completion_tokens / 1000000) * pricing.output);
      }

      return data;
    } finally {
      this.updateStats(name, { success, responseTime: Date.now() - startTime, isAuthError });
    }
  }

  public getProviderStatus(): Record<string, any> {
    const status: Record<string, any> = {};
    Object.keys(this.providers).forEach(name => {
      const config = this.providers[name];
      const stats = this.stats[name];
      const isConfigured = config.apiKeys && config.apiKeys.length > 0;

      status[name] = {
        configured: isConfigured,
        health_status: stats?.health_status || 'unknown',
        priority: stats?.priority || 0,
        speed_score: stats?.speed_score || 0,
        error_rate: stats?.error_rate || 0,
        total_requests: stats?.total_requests || 0,
        avg_response_time: stats?.avg_response_time || 0,
        last_updated: stats?.last_updated
      };
    });
    return status;
  }
}

export const providerManager = new ProviderManager();
