import cron from 'node-cron';
import { dbService } from '../db/DBService';
import { EmailService } from '../email/EmailService';
import nodeFetch from 'node-fetch';

export class MaintenanceService {
  public static start(imageCache: Map<string, any>) {
    // 1. Log Cleanup (Daily at midnight) - Keep 30 days
    cron.schedule('0 0 * * *', async () => {
      console.log('[Maintenance] Running daily log cleanup...');
      try {
        const thirtyDaysAgoMs = Date.now() - (30 * 24 * 60 * 60 * 1000);

        // Fetch logs that will be deleted for backup
        const logsToBackup = await dbService.all('SELECT * FROM request_logs WHERE timestamp < ?', [thirtyDaysAgoMs]);
        
        if (logsToBackup.length > 0) {
          console.log(`[Maintenance] Backing up ${logsToBackup.length} logs...`);
          const ownerEmail = process.env.OWNER_MAIL;
          if (ownerEmail) {
            await EmailService.sendBackupEmail(ownerEmail, logsToBackup);
          } else {
            console.warn('[Maintenance] OWNER_MAIL not set, skipping email backup.');
          }
        }

        await dbService.run('DELETE FROM request_logs WHERE timestamp < ?', [thirtyDaysAgoMs]);
        console.log('[Maintenance] Old logs deleted.');
      } catch (err) {
        console.error('[Maintenance] Log cleanup failed:', (err as Error).message);
      }
    });

    // 2. URL Pinging (Every minute)
    cron.schedule('* * * * *', async () => {
      const pingUrls = process.env.PING_URLS;
      if (!pingUrls) return;

      const urls = pingUrls.split(',').map(url => url.trim());
      for (const url of urls) {
        try {
          const res = await nodeFetch(url, { timeout: 5000 });
          console.log(`[Maintenance] Ping ${url}: ${res.status}`);
        } catch (err) {
          console.error(`[Maintenance] Ping failed for ${url}:`, (err as Error).message);
        }
      }
    });

    // 3. Image Cache Cleanup (Every 10 minutes)
    setInterval(() => {
      const now = Date.now();
      let deleted = 0;
      for (const [key, value] of imageCache.entries()) {
        if (now - value.timestamp > 3600000) { // 1 hour
          imageCache.delete(key);
          deleted++;
        }
      }
      if (deleted > 0) console.log(`[Maintenance] Cleaned up ${deleted} expired images from cache`);
    }, 600000);

    console.log('[Maintenance] Services started');
  }
}
