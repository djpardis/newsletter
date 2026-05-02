-- Subscribers
CREATE TABLE subscribers (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  confirmed_at INTEGER,
  unsubscribed_at INTEGER,
  source TEXT,
  ip_hash TEXT,
  user_agent_hash TEXT,
  metadata_json TEXT,
  unsubscribe_token TEXT
);

CREATE INDEX idx_subscribers_status ON subscribers (status);
CREATE INDEX idx_subscribers_created ON subscribers (created_at);

-- One-time tokens (confirm; unsubscribe type supported for optional flows)
CREATE TABLE verification_tokens (
  id TEXT PRIMARY KEY NOT NULL,
  subscriber_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  type TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id)
);

CREATE UNIQUE INDEX idx_verification_tokens_hash ON verification_tokens (token_hash);
CREATE INDEX idx_verification_tokens_subscriber ON verification_tokens (subscriber_id, type);

-- Campaigns
CREATE TABLE campaigns (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  subject TEXT NOT NULL,
  kind TEXT NOT NULL,
  html_body TEXT NOT NULL,
  text_body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  sent_at INTEGER
);

CREATE INDEX idx_campaigns_created ON campaigns (created_at);

-- Per-recipient send log
CREATE TABLE deliveries (
  id TEXT PRIMARY KEY NOT NULL,
  campaign_id TEXT NOT NULL,
  subscriber_id TEXT NOT NULL,
  provider_message_id TEXT,
  status TEXT NOT NULL,
  error TEXT,
  sent_at INTEGER,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id)
);

CREATE INDEX idx_deliveries_campaign ON deliveries (campaign_id);
CREATE INDEX idx_deliveries_subscriber ON deliveries (subscriber_id);

-- Audit / events
CREATE TABLE events_audit (
  id TEXT PRIMARY KEY NOT NULL,
  subscriber_id TEXT,
  event_type TEXT NOT NULL,
  payload_json TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id)
);

CREATE INDEX idx_events_subscriber ON events_audit (subscriber_id);
CREATE INDEX idx_events_type_time ON events_audit (event_type, created_at);

-- Simple per-minute rate limit buckets (subscribe)
CREATE TABLE rate_limits (
  bucket_key TEXT PRIMARY KEY NOT NULL,
  hit_count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX idx_rate_limits_expires ON rate_limits (expires_at);
