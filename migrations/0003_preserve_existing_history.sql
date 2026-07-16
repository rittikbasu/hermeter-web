UPDATE sync_state
SET covered_from_ms = CASE
  WHEN covered_from_ms = 0 THEN (SELECT MIN(occurred_at_ms) FROM usage_events)
  ELSE MIN(covered_from_ms, (SELECT MIN(occurred_at_ms) FROM usage_events))
END
WHERE singleton = 1
  AND EXISTS (SELECT 1 FROM usage_events);
