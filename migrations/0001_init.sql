CREATE TABLE sessions (
  session_key TEXT PRIMARY KEY,
  title TEXT,
  first_seen_ms INTEGER NOT NULL,
  last_seen_ms INTEGER NOT NULL
) WITHOUT ROWID;

CREATE TABLE usage_events (
  event_id TEXT PRIMARY KEY,
  occurred_at_ms INTEGER NOT NULL,
  local_day TEXT NOT NULL,
  local_hour INTEGER NOT NULL CHECK (local_hour BETWEEN 0 AND 23),
  kind TEXT NOT NULL CHECK (kind IN ('text', 'image')),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  source TEXT NOT NULL,
  session_key TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  cached_input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (cached_input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  image_size TEXT,
  image_quality TEXT,
  known_cost_nanos INTEGER NOT NULL CHECK (known_cost_nanos >= 0),
  cost_status TEXT NOT NULL CHECK (cost_status IN ('complete', 'partial', 'unpriced')),
  pricing_confidence TEXT NOT NULL,
  pricing_version TEXT NOT NULL,
  FOREIGN KEY (session_key) REFERENCES sessions(session_key)
) WITHOUT ROWID;

CREATE INDEX usage_events_time ON usage_events(occurred_at_ms);
CREATE INDEX usage_events_day_hour ON usage_events(local_day, local_hour);
CREATE INDEX usage_events_session_time ON usage_events(session_key, occurred_at_ms);

CREATE TABLE sync_state (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  generated_at_ms INTEGER NOT NULL,
  checked_through_ms INTEGER NOT NULL,
  data_revision INTEGER NOT NULL DEFAULT 0
);
