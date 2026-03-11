import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export interface MCPServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
  alwaysAllow: string[];
}

export class MCPService {
  private servers: Record<string, MCPServerConfig> = {
    searxng: {
      command: "npx",
      args: ["-y", "mcp-searxng"],
      env: { SEARXNG_URL: process.env.SEARXNG_URL || "http://localhost:10000" },
      alwaysAllow: ["searxng_web_search"]
    },
    sequentialthinking: {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-sequential-thinking"],
      alwaysAllow: ["sequentialthinking"]
    },
    puppeteer: {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-puppeteer"],
      env: { PUPPETEER_CACHE_DIR: process.env.PUPPETEER_CACHE_DIR || "./.cache/puppeteer" },
      alwaysAllow: ["puppeteer_fill", "puppeteer_evaluate", "puppeteer_navigate", "puppeteer_screenshot", "puppeteer_click"]
    }
  };

  public async executeTool(serverName: string, toolName: string, args: any): Promise<any> {
    const config = this.servers[serverName];
    if (!config) {
      throw new Error(`MCP server ${serverName} not configured`);
    }

    if (!config.alwaysAllow.includes(toolName)) {
      throw new Error(`Tool ${toolName} not allowed for server ${serverName}`);
    }

    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: { ...process.env, ...config.env } as any
    });

    const client = new Client({ name: 'ai-research-engine', version: '1.0.0' }, { capabilities: {} });

    try {
      await client.connect(transport);
      const result = await client.callTool({ name: toolName, arguments: args });
      return result;
    } finally {
      await client.close();
    }
  }

  public getConfiguredServers() {
    return Object.keys(this.servers);
  }
}

export const mcpService = new MCPService();
