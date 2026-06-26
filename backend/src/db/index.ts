import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

let dbInstance: ReturnType<typeof drizzle> | null = null;

export function getDb(dbPath?: string) {
  if (dbInstance) return dbInstance;

  const path = dbPath || './data/db.sqlite';
  const sqlite = new Database(path);

  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');

  dbInstance = drizzle(sqlite, { schema });
  return dbInstance;
}

export function closeDb() {
  if (dbInstance) {
    // better-sqlite3 connection is accessed via the internal connection
    dbInstance = null;
  }
}

export { schema };
