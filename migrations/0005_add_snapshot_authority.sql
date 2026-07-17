CREATE TABLE snapshot_authority (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  snapshot_key TEXT NOT NULL CHECK (
    length(snapshot_key) BETWEEN 80 AND 160
    AND snapshot_key GLOB 'hermeter:snapshot:v2:*'
  ),
  content_hash TEXT NOT NULL CHECK (
    length(content_hash) = 64
    AND content_hash NOT GLOB '*[^0-9a-f]*'
  ),
  data_revision INTEGER NOT NULL CHECK (
    data_revision >= 0 AND data_revision <= 9007199254740991
  ),
  generated_at_ms INTEGER NOT NULL CHECK (
    generated_at_ms >= 0 AND generated_at_ms <= 253402280999999
  ),
  covered_from_ms INTEGER NOT NULL CHECK (
    covered_from_ms >= 0 AND covered_from_ms <= 253402280999999
  ),
  checked_through_ms INTEGER NOT NULL CHECK (
    checked_through_ms >= covered_from_ms
    AND checked_through_ms <= generated_at_ms
    AND checked_through_ms <= 253402280999999
  )
);
