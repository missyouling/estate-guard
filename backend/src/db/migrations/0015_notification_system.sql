CREATE TABLE IF NOT EXISTS notification_send_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  notification_id INTEGER,
  user_id INTEGER,
  channel TEXT NOT NULL DEFAULT 'system',
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS user_notification_prefs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,
  email_enabled INTEGER NOT NULL DEFAULT 0,
  sms_enabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
