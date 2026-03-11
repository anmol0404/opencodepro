import { config } from 'dotenv';
config();
import { startProxyServer } from '../src/service/proxy/ProxyServer';
console.log("GEMINI_API_KEYS from env:", process.env.GEMINI_API_KEYS);

console.log("=== Starting AI Research Proxy Server ===");
startProxyServer();
