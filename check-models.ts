
import { providerManager } from './src/service/provider/ProviderManager';
import * as dotenv from 'dotenv';
dotenv.config();

async function checkModels() {
  console.log('--- Provider Manager Models Check ---');
  const providers = providerManager.getOrderedProviders();
  console.log('Active Providers:', providers);
  
  providers.forEach(p => {
    const config = providerManager.getProviderConfig(p);
    console.log(`Provider: ${p}, Models:`, config ? config.models : 'No config');
  });
  process.exit(0);
}

checkModels();
