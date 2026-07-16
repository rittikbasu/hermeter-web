export const MAX_EVENTS_PER_REQUEST = 24;

const PAYLOAD_FIELDS = new Set([
  'schema', 'generatedAtMs', 'coveredFromMs', 'checkedThroughMs', 'complete', 'sessions', 'events'
]);
const SESSION_FIELDS = new Set(['sessionKey', 'title', 'firstSeenMs', 'lastSeenMs']);
const EVENT_FIELDS = new Set([
  'eventId', 'occurredAtMs', 'localDay', 'localHour', 'kind', 'provider', 'model',
  'source', 'sessionKey', 'inputTokens', 'cachedInputTokens', 'outputTokens',
  'imageSize', 'imageQuality', 'knownCostNanos', 'costStatus',
  'pricingConfidence', 'pricingVersion'
]);
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const EVENT_ID = /^e_[A-Za-z0-9_-]{22,64}$/;
const SESSION_ID = /^s_[A-Za-z0-9_-]{22,64}$/;
const SOURCES = new Set(['cli', 'desktop', 'subagent', 'telegram', 'unknown']);
const MAX_TIMESTAMP_MS = 253_402_280_999_999;

export type IngestSession = {
  sessionKey: string;
  title: string | null;
  firstSeenMs: number;
  lastSeenMs: number;
};

export type IngestEvent = {
  eventId: string;
  occurredAtMs: number;
  localDay: string;
  localHour: number;
  kind: 'text' | 'image';
  provider: string;
  model: string;
  source: string;
  sessionKey: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  imageSize: string | null;
  imageQuality: string | null;
  knownCostNanos: number;
  costStatus: 'complete' | 'partial' | 'unpriced';
  pricingConfidence: string;
  pricingVersion: string;
};

export type IngestPayload = {
  schema: 'hermeter.ingest.v1';
  generatedAtMs: number;
  coveredFromMs: number;
  checkedThroughMs: number;
  complete: boolean;
  sessions: IngestSession[];
  events: IngestEvent[];
};

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactFields(value: Record<string, unknown>, allowed: Set<string>, label: string): void {
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) throw new Error(`unknown ${label} field: ${unknown}`);
}

function integer(value: unknown, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new Error(`${label} must be a safe integer >= ${minimum}`);
  }
  return value as number;
}

function timestamp(value: unknown, label: string): number {
  const parsed = integer(value, label);
  if (parsed > MAX_TIMESTAMP_MS) {
    throw new Error(`${label} timestamp is outside the supported date range`);
  }
  return parsed;
}

function text(value: unknown, label: string, maximum = 160): string {
  if (typeof value !== 'string' || !value || value.length > maximum) {
    throw new Error(`${label} must be a non-empty string up to ${maximum} characters`);
  }
  return value;
}

function nullableText(value: unknown, label: string, maximum = 300): string | null {
  if (value === null) return null;
  return text(value, label, maximum);
}

function parseSession(value: unknown): IngestSession {
  const item = record(value, 'session');
  exactFields(item, SESSION_FIELDS, 'session');
  const sessionKey = text(item.sessionKey, 'sessionKey');
  if (!SESSION_ID.test(sessionKey)) throw new Error('invalid sessionKey');
  const firstSeenMs = timestamp(item.firstSeenMs, 'firstSeenMs');
  const lastSeenMs = timestamp(item.lastSeenMs, 'lastSeenMs');
  if (lastSeenMs < firstSeenMs) throw new Error('lastSeenMs precedes firstSeenMs');
  if (item.title !== null) throw new Error('title must be null');
  return { sessionKey, title: null, firstSeenMs, lastSeenMs };
}

function parseEvent(value: unknown): IngestEvent {
  const item = record(value, 'event');
  exactFields(item, EVENT_FIELDS, 'event');
  const eventId = text(item.eventId, 'eventId');
  const sessionKey = text(item.sessionKey, 'sessionKey');
  if (!EVENT_ID.test(eventId)) throw new Error('invalid eventId');
  if (!SESSION_ID.test(sessionKey)) throw new Error('invalid sessionKey');
  const kind = item.kind;
  if (kind !== 'text' && kind !== 'image') throw new Error('invalid event kind');
  const localDay = text(item.localDay, 'localDay', 10);
  if (!DAY.test(localDay)) throw new Error('invalid localDay');
  const localHour = integer(item.localHour, 'localHour');
  if (localHour > 23) throw new Error('localHour must be <= 23');
  const source = text(item.source, 'source');
  if (!SOURCES.has(source)) throw new Error('invalid source');
  const inputTokens = integer(item.inputTokens, 'inputTokens');
  const cachedInputTokens = integer(item.cachedInputTokens, 'cachedInputTokens');
  if (cachedInputTokens > inputTokens) throw new Error('cachedInputTokens exceeds inputTokens');
  const costStatus = item.costStatus;
  if (costStatus !== 'complete' && costStatus !== 'partial' && costStatus !== 'unpriced') {
    throw new Error('invalid costStatus');
  }
  return {
    eventId,
    occurredAtMs: timestamp(item.occurredAtMs, 'occurredAtMs'),
    localDay,
    localHour,
    kind,
    provider: text(item.provider, 'provider'),
    model: text(item.model, 'model'),
    source,
    sessionKey,
    inputTokens,
    cachedInputTokens,
    outputTokens: integer(item.outputTokens, 'outputTokens'),
    imageSize: nullableText(item.imageSize, 'imageSize', 40),
    imageQuality: nullableText(item.imageQuality, 'imageQuality', 40),
    knownCostNanos: integer(item.knownCostNanos, 'knownCostNanos'),
    costStatus,
    pricingConfidence: text(item.pricingConfidence, 'pricingConfidence'),
    pricingVersion: text(item.pricingVersion, 'pricingVersion')
  };
}

export function parseIngestPayload(value: unknown): IngestPayload {
  const payload = record(value, 'payload');
  exactFields(payload, PAYLOAD_FIELDS, 'payload');
  if (payload.schema !== 'hermeter.ingest.v1') throw new Error('unsupported schema');
  if (typeof payload.complete !== 'boolean') throw new Error('complete must be boolean');
  if (!Array.isArray(payload.sessions)) throw new Error('sessions must be an array');
  if (!Array.isArray(payload.events)) throw new Error('events must be an array');
  if (payload.events.length > MAX_EVENTS_PER_REQUEST) {
    throw new Error(`events must contain at most ${MAX_EVENTS_PER_REQUEST} items`);
  }
  if (payload.sessions.length > MAX_EVENTS_PER_REQUEST) {
    throw new Error(`sessions must contain at most ${MAX_EVENTS_PER_REQUEST} items`);
  }
  const generatedAtMs = timestamp(payload.generatedAtMs, 'generatedAtMs');
  const coveredFromMs = timestamp(payload.coveredFromMs, 'coveredFromMs');
  const checkedThroughMs = timestamp(payload.checkedThroughMs, 'checkedThroughMs');
  if (coveredFromMs > checkedThroughMs) throw new Error('coveredFromMs exceeds checkedThroughMs');
  if (checkedThroughMs > generatedAtMs) throw new Error('checkedThroughMs exceeds generatedAtMs');
  return {
    schema: 'hermeter.ingest.v1',
    generatedAtMs,
    coveredFromMs,
    checkedThroughMs,
    complete: payload.complete,
    sessions: payload.sessions.map(parseSession),
    events: payload.events.map(parseEvent)
  };
}
