ALTER TABLE shares ADD COLUMN allow_download integer NOT NULL DEFAULT 0;
ALTER TABLE shares ADD COLUMN max_access_count integer;
ALTER TABLE shares ADD COLUMN force_watermark integer NOT NULL DEFAULT 1;
ALTER TABLE shares ADD COLUMN remark text;
ALTER TABLE shares ADD COLUMN password_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE shares ADD COLUMN locked_until text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_unique ON users(username);
