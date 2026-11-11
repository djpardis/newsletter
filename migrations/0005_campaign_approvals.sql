-- One-time links that let the operator review a campaign by email and then
-- send it. Only the SHA-256 of each token is stored.
CREATE TABLE campaign_approvals (
  id TEXT PRIMARY KEY NOT NULL,
  campaign_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
);

CREATE UNIQUE INDEX idx_campaign_approvals_hash ON campaign_approvals (token_hash);
CREATE INDEX idx_campaign_approvals_campaign ON campaign_approvals (campaign_id);
