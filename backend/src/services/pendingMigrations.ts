import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const MIGRATION_FILES: { file: string; check: string }[] = [
  { file: '0012_add_share_tracking.sql', check: "SELECT name FROM sqlite_master WHERE type='table' AND name='share_access_logs'" },
  { file: '0013_approval_whitelist_enhance.sql', check: "SELECT name FROM sqlite_master WHERE type='table' AND name='change_logs'" },
  { file: '0014_share_enhance_username.sql', check: "PRAGMA table_info(shares)" },
  { file: '0015_notification_system.sql', check: "SELECT name FROM sqlite_master WHERE type='table' AND name='user_notification_prefs'" },
  { file: '0016_user_profile_enhance.sql', check: "SELECT name FROM sqlite_master WHERE type='table' AND name='login_logs'" },
  { file: '0017_add_notification_link.sql', check: "PRAGMA table_info(notifications)" },
  { file: '0018_add_activation_token.sql', check: "PRAGMA table_info(approvals)" },
  { file: '0019_add_community_name.sql', check: "PRAGMA table_info(users)" },
];

export function runPendingMigrations(dbPath?: string) {
  const DB_PATH = dbPath || process.env.DB_PATH || './data/db.sqlite';
  const sqlite = new Database(DB_PATH);

  for (const { file, check } of MIGRATION_FILES) {
    try {
      if (file === '0014_share_enhance_username.sql') {
        const cols = sqlite.prepare(check).all() as any[];
        if (cols.some((c: any) => c.name === 'allow_download')) {
          continue;
        }
      } else if (file === '0017_add_notification_link.sql') {
        const cols = sqlite.prepare(check).all() as any[];
        if (cols.some((c: any) => c.name === 'link')) {
          continue;
        }
      } else if (file === '0018_add_activation_token.sql') {
        const cols = sqlite.prepare(check).all() as any[];
        if (cols.some((c: any) => c.name === 'activation_token')) {
          continue;
        }
      } else if (file === '0019_add_community_name.sql') {
        const cols = sqlite.prepare(check).all() as any[];
        if (cols.some((c: any) => c.name === 'community_name')) {
          continue;
        }
      } else {
        const row = sqlite.prepare(check).get();
        if (row) {
          continue;
        }
      }
      const migrationPath = path.join(import.meta.dirname, '..', 'db', 'migrations', file);
      const sql = fs.readFileSync(migrationPath, 'utf-8');
      sqlite.exec(sql);
    } catch (err: any) {
      console.error(`[Migration] Error applying ${file}:`, err.message);
    }
  }

  sqlite.close();
}
