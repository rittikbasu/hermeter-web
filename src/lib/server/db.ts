import type { IngestPayload } from './ingest';

const UPSERT_SESSION = `
  INSERT INTO sessions (session_key, title, first_seen_ms, last_seen_ms)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(session_key) DO UPDATE SET
    title = COALESCE(excluded.title, sessions.title),
    first_seen_ms = MIN(sessions.first_seen_ms, excluded.first_seen_ms),
    last_seen_ms = MAX(sessions.last_seen_ms, excluded.last_seen_ms)
  WHERE sessions.title IS NOT COALESCE(excluded.title, sessions.title)
     OR excluded.first_seen_ms < sessions.first_seen_ms
     OR excluded.last_seen_ms > sessions.last_seen_ms
`;

const UPSERT_EVENT = `
  INSERT INTO usage_events (
    event_id, occurred_at_ms, local_day, local_hour, kind, provider, model, source,
    session_key, input_tokens, cached_input_tokens, output_tokens, image_size,
    image_quality, known_cost_nanos, cost_status, pricing_confidence, pricing_version
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(event_id) DO UPDATE SET
    occurred_at_ms = excluded.occurred_at_ms,
    local_day = excluded.local_day,
    local_hour = excluded.local_hour,
    kind = excluded.kind,
    provider = excluded.provider,
    model = excluded.model,
    source = excluded.source,
    session_key = excluded.session_key,
    input_tokens = excluded.input_tokens,
    cached_input_tokens = excluded.cached_input_tokens,
    output_tokens = excluded.output_tokens,
    image_size = excluded.image_size,
    image_quality = excluded.image_quality,
    known_cost_nanos = excluded.known_cost_nanos,
    cost_status = excluded.cost_status,
    pricing_confidence = excluded.pricing_confidence,
    pricing_version = excluded.pricing_version
  WHERE usage_events.occurred_at_ms IS NOT excluded.occurred_at_ms
     OR usage_events.local_day IS NOT excluded.local_day
     OR usage_events.local_hour IS NOT excluded.local_hour
     OR usage_events.kind IS NOT excluded.kind
     OR usage_events.provider IS NOT excluded.provider
     OR usage_events.model IS NOT excluded.model
     OR usage_events.source IS NOT excluded.source
     OR usage_events.session_key IS NOT excluded.session_key
     OR usage_events.input_tokens IS NOT excluded.input_tokens
     OR usage_events.cached_input_tokens IS NOT excluded.cached_input_tokens
     OR usage_events.output_tokens IS NOT excluded.output_tokens
     OR usage_events.image_size IS NOT excluded.image_size
     OR usage_events.image_quality IS NOT excluded.image_quality
     OR usage_events.known_cost_nanos IS NOT excluded.known_cost_nanos
     OR usage_events.cost_status IS NOT excluded.cost_status
     OR usage_events.pricing_confidence IS NOT excluded.pricing_confidence
     OR usage_events.pricing_version IS NOT excluded.pricing_version
`;

const UPSERT_SYNC = `
  INSERT INTO sync_state (
    singleton, generated_at_ms, checked_through_ms, data_revision
  ) VALUES (1, ?, ?, ?)
  ON CONFLICT(singleton) DO UPDATE SET
    generated_at_ms = MAX(sync_state.generated_at_ms, excluded.generated_at_ms),
    checked_through_ms = CASE
      WHEN ? = 1 THEN MAX(sync_state.checked_through_ms, excluded.checked_through_ms)
      ELSE sync_state.checked_through_ms
    END,
    data_revision = sync_state.data_revision + excluded.data_revision
`;

function changes(result: D1Result): number {
  return Number(result.meta?.changes ?? 0);
}

export async function applyIngest(
  db: D1Database,
  payload: IngestPayload
): Promise<{ acceptedEvents: number; changed: boolean }> {
  const statements: D1PreparedStatement[] = [];
  for (const session of payload.sessions) {
    statements.push(db.prepare(UPSERT_SESSION).bind(
      session.sessionKey, session.title, session.firstSeenMs, session.lastSeenMs
    ));
  }
  for (const event of payload.events) {
    statements.push(db.prepare(UPSERT_EVENT).bind(
      event.eventId, event.occurredAtMs, event.localDay, event.localHour, event.kind,
      event.provider, event.model, event.source, event.sessionKey, event.inputTokens,
      event.cachedInputTokens, event.outputTokens, event.imageSize, event.imageQuality,
      event.knownCostNanos, event.costStatus, event.pricingConfidence, event.pricingVersion
    ));
  }

  const results = statements.length ? await db.batch(statements) : [];
  const changed = results.some((result) => changes(result) > 0);
  const complete = payload.complete ? 1 : 0;
  await db.prepare(UPSERT_SYNC).bind(
    payload.generatedAtMs,
    payload.complete ? payload.checkedThroughMs : 0,
    changed ? 1 : 0,
    complete
  ).run();

  return { acceptedEvents: payload.events.length, changed };
}
