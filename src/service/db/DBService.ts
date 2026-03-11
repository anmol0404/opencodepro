import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

export class DBService {
  private db: sqlite3.Database;
  private dbPath: string;
  public ready: Promise<void>;

  constructor() {
    this.dbPath = path.resolve(process.cwd(), 'db', 'opencode.db');

    // Ensure db directory exists
    const dbDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    this.db = new sqlite3.Database(this.dbPath);
    this.ready = this.init();
  }

  private init(): Promise<void> {
    const schema = `
      CREATE TABLE IF NOT EXISTS admin_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS provider_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider_name TEXT NOT NULL,
        api_key TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS wrapper_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        api_key_hash TEXT NOT NULL UNIQUE,
        prefix TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        rate_limit_rpm INTEGER DEFAULT NULL,
        rate_limit_rph INTEGER DEFAULT NULL,
        rate_limit_rpd INTEGER DEFAULT NULL,
        max_lifetime_requests INTEGER DEFAULT NULL,
        monthly_token_limit INTEGER DEFAULT NULL,
        monthly_cost_limit_usd REAL DEFAULT NULL
      );

      CREATE TABLE IF NOT EXISTS request_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        wrapper_key_id INTEGER,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        prompt_tokens INTEGER DEFAULT 0,
        completion_tokens INTEGER DEFAULT 0,
        latency_ms INTEGER,
        status_code INTEGER,
        timestamp INTEGER DEFAULT (strftime('%s','now') * 1000),
        cost_usd REAL DEFAULT 0.0,
        FOREIGN KEY (wrapper_key_id) REFERENCES wrapper_keys(id)
      );

      CREATE TABLE IF NOT EXISTS provider_stats (
        provider_name TEXT PRIMARY KEY,
        priority INTEGER DEFAULT 50,
        speed_score REAL DEFAULT 50,
        error_rate REAL DEFAULT 0,
        total_requests INTEGER DEFAULT 0,
        successful_requests INTEGER DEFAULT 0,
        avg_response_time REAL DEFAULT 1000,
        health_status TEXT DEFAULT 'healthy',
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
        response_times_json TEXT
      );

      CREATE TABLE IF NOT EXISTS model_pricing (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        input_cost_per_1m REAL NOT NULL,
        output_cost_per_1m REAL NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(provider, model)
      );
    `;

    return new Promise<void>((resolve, reject) => {
      this.db.exec(schema, (err) => {
        if (err) {
          console.error("[DBService] Schema initialization failed:", err.message);
          reject(err);
        } else {
          console.log("[DBService] Schema initialized successfully");
          this.runMigrations().then(resolve).catch(reject);
        }
      });
    });
  }

  private async runMigrations(): Promise<void> {
    // Add limit columns to wrapper_keys if they don't exist (migration for existing DBs)
    const limitColumns = [
      'rate_limit_rpm INTEGER DEFAULT NULL',
      'rate_limit_rph INTEGER DEFAULT NULL',
      'rate_limit_rpd INTEGER DEFAULT NULL',
      'max_lifetime_requests INTEGER DEFAULT NULL',
      'monthly_token_limit INTEGER DEFAULT NULL',
      'monthly_cost_limit_usd REAL DEFAULT NULL',
    ];

    for (const colDef of limitColumns) {
      const colName = colDef.split(' ')[0];
      try {
        await this.run(`ALTER TABLE wrapper_keys ADD COLUMN ${colDef}`, []);
      } catch (err: any) {
        // Column already exists — ignore
        if (!err.message.includes('duplicate column name')) {
          console.warn(`[DBService] Migration warning for ${colName}:`, err.message);
        }
      }
    }

    // Add index for efficient per-key request lookups
    try {
      await this.run('CREATE INDEX IF NOT EXISTS idx_request_logs_key_ts ON request_logs(wrapper_key_id, timestamp)', []);
    } catch (err: any) {
      console.warn('[DBService] Index migration warning:', err.message);
    }

    console.log("[DBService] Migrations completed");
  }

  public async all<T>(sql: string, params: any[] = []): Promise<T[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows as T[]);
      });
    });
  }

  public async get<T>(sql: string, params: any[] = []): Promise<T | null> {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row as T || null);
      });
    });
  }

  public async run(sql: string, params: any[] = []): Promise<{ lastID: number; changes: number }> {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  public close() {
    this.db.close();
  }
}

export const dbService = new DBService();
