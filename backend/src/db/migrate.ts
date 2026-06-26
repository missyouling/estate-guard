import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function runMigrations(dbPath?: string) {
  const dbFile = dbPath || './data/db.sqlite';
  const sqlite = new Database(dbFile);

  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  const db = drizzle(sqlite);

  const migrationsFolder = path.join(__dirname, 'migrations');

  try {
    migrate(db, { migrationsFolder });
    console.log('[DB] Migrations completed successfully');
  } catch (err: any) {
    if (err.message?.includes('already exists')) {
      console.log('[DB] Tables already exist, skipping migration');
    } else {
      throw err;
    }
  }

  sqlite.close();
}
