import { dbService } from '../src/service/db/DBService';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { config } from 'dotenv';

config();

async function setup() {
  console.log("=== AI Research Engine: Initial Setup ===\n");

  const username = process.env.ADMIN_USER || 'admin';
  const password = process.env.ADMIN_PASS || 'admin123';
  const hashedPassword = bcrypt.hashSync(password, 10);

  try {
    // 1. Create Admin User
    await dbService.run(
      'INSERT OR IGNORE INTO admin_users (username, password_hash) VALUES (?, ?)',
      [username, hashedPassword]
    );
    console.log(`✅ Admin user created: ${username} / ${password}`);

    // 2. Create Default Wrapper Key
    const apiKey = 'sk-' + randomBytes(16).toString('hex');
    const hash = createHash('sha256').update(apiKey).digest('hex');
    const prefix = apiKey.substring(0, 10) + '...';

    await dbService.run(
      'INSERT INTO wrapper_keys (name, api_key_hash, prefix) VALUES (?, ?, ?)',
      ['Default Test Key', hash, prefix]
    );

    console.log(`✅ Test API Key created: ${apiKey}`);
    console.log(`👉 Use this key in your Authorization header: Bearer ${apiKey}`);

    // 3. Add default pricing if needed
    console.log("\nSetup complete. You can now start the server with 'npm run start:proxy'");
    dbService.close();
  } catch (err) {
    console.error("❌ Setup failed:", (err as Error).message);
  }
}

setup();
