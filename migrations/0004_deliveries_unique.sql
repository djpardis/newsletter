-- Prevent double-sending to the same subscriber for the same campaign.
-- The queue consumer checks for an existing 'sent' delivery before calling
-- Resend, and uses INSERT OR IGNORE after sending, so this constraint is
-- both a safety net and the source of truth for idempotency.
CREATE UNIQUE INDEX IF NOT EXISTS idx_deliveries_campaign_subscriber
  ON deliveries (campaign_id, subscriber_id);
