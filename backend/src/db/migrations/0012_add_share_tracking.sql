ALTER TABLE shares ADD COLUMN download_count integer NOT NULL DEFAULT 0;
ALTER TABLE shares ADD COLUMN last_access_at text;
ALTER TABLE shares ADD COLUMN status text NOT NULL DEFAULT 'active';

CREATE TABLE IF NOT EXISTS share_access_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  share_id INTEGER NOT NULL REFERENCES shares(id) ON DELETE CASCADE,
  ip TEXT,
  action TEXT NOT NULL DEFAULT 'view',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_share_access_logs_share_id ON share_access_logs(share_id);
CREATE INDEX IF NOT EXISTS idx_share_access_logs_created_at ON share_access_logs(created_at);
