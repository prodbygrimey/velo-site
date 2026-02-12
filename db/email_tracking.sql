-- Cloudflare D1 schema for email open tracking.
-- Run this in D1 before deploying the pixel endpoint.

CREATE TABLE IF NOT EXISTS email_open_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id TEXT,
  campaign_id TEXT,
  recipient_id TEXT,
  recipient_email TEXT,
  token_id TEXT,
  opened_at TEXT NOT NULL,
  user_agent TEXT,
  ip_hash TEXT,
  country TEXT,
  colo TEXT,
  ray_id TEXT,
  is_prefetch INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_email_open_events_message_id
  ON email_open_events(message_id);

CREATE INDEX IF NOT EXISTS idx_email_open_events_campaign_id
  ON email_open_events(campaign_id);

CREATE TABLE IF NOT EXISTS email_open_rollups (
  message_id TEXT PRIMARY KEY,
  campaign_id TEXT,
  recipient_id TEXT,
  recipient_email TEXT,
  first_open_at TEXT NOT NULL,
  last_open_at TEXT NOT NULL,
  open_count INTEGER NOT NULL DEFAULT 1,
  last_user_agent TEXT,
  last_ip_hash TEXT,
  last_is_prefetch INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_email_open_rollups_campaign_id
  ON email_open_rollups(campaign_id);
