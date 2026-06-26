ALTER TABLE whitelist ADD COLUMN status text NOT NULL DEFAULT 'pending';
ALTER TABLE whitelist ADD COLUMN updated_at text;
ALTER TABLE whitelist ADD COLUMN updated_by integer REFERENCES users(id);

ALTER TABLE approvals ADD COLUMN apply_type text NOT NULL DEFAULT 'register';
ALTER TABLE approvals ADD COLUMN mismatch_fields text;
ALTER TABLE approvals ADD COLUMN reviewed_name text;
ALTER TABLE approvals ADD COLUMN reject_reason_preset text;

CREATE TABLE IF NOT EXISTS change_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_type text NOT NULL,
  target_id integer NOT NULL,
  field text NOT NULL,
  old_value text,
  new_value text,
  operator_id integer REFERENCES users(id),
  operator_name text,
  created_at text NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_change_logs_target ON change_logs(target_type, target_id);

CREATE TABLE IF NOT EXISTS property_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id integer NOT NULL REFERENCES whitelist(id) ON DELETE CASCADE,
  filename text NOT NULL,
  original_name text NOT NULL,
  url text NOT NULL,
  remark text,
  uploaded_by integer REFERENCES users(id),
  created_at text NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_property_files_owner ON property_files(owner_id);
