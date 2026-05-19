-- Adds dedicated webhook event persistence for idempotent Stripe processing.
CREATE TABLE IF NOT EXISTS webhook_events (
  id VARCHAR(36) PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  provider VARCHAR(32) NOT NULL DEFAULT 'stripe',
  event_id VARCHAR(128) NOT NULL UNIQUE,
  event_type VARCHAR(128) NOT NULL,
  livemode BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(32) NOT NULL DEFAULT 'received',
  payload JSONB NULL,
  error_message TEXT NULL,
  processed_at TIMESTAMP NULL
);

CREATE INDEX IF NOT EXISTS ix_webhook_events_provider ON webhook_events(provider);
CREATE INDEX IF NOT EXISTS ix_webhook_events_event_type ON webhook_events(event_type);
CREATE INDEX IF NOT EXISTS ix_webhook_events_status ON webhook_events(status);
