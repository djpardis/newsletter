-- Faster unsubscribe lookups
CREATE INDEX IF NOT EXISTS idx_subscribers_unsub_token
  ON subscribers (unsubscribe_token);

-- Resend webhook idempotency log
CREATE TABLE IF NOT EXISTS webhook_events (
  id TEXT PRIMARY KEY NOT NULL,
  source TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT,
  created_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_events_source_id
  ON webhook_events (source, event_id);

CREATE INDEX IF NOT EXISTS idx_webhook_events_created
  ON webhook_events (created_at);
