const SNAPSHOT_FIELDS = new Set([
  'schema', 'dataRevision', 'generatedAtMs', 'coveredFromMs', 'checkedThroughMs', 'sessions', 'buckets'
]);
const HEARTBEAT_FIELDS = new Set([
  'schema', 'dataRevision', 'generatedAtMs', 'checkedThroughMs'
]);
const SESSION_FIELDS = new Set(['sessionKey', 'title']);
const BUCKET_FIELDS = new Set([
  'day', 'hour', 'provider', 'model', 'source', 'sessionKey', 'calls', 'inputTokens',
  'cachedInputTokens', 'outputTokens', 'knownCostNanos', 'incompleteEvents', 'apiEquivalentEvents'
]);
const SESSION_ID = /^s_[A-Za-z0-9_-]{2,64}$/;
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const SOURCES = new Set(['cli', 'desktop', 'subagent', 'telegram', 'unknown']);
export const MAX_TIMESTAMP_MS = 253_402_280_999_999;
const MAX_SESSIONS = 10_000;
const MAX_BUCKETS = 100_000;
const UNSAFE_SESSION_TITLE_CONTROL = /[\u0000-\u001f\u007f-\u009f\u061c\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/u;
const UNSAFE_SESSION_TITLE = [
  /(?:^|[^a-z0-9._~/-])\/(?!\/)(?:[^/\s]+\/)*[^/\s]+/i,
  /\/\/[a-z0-9._-]+(?:\/[^\s]*)?/i,
  /~[\\/]/,
  /[a-z]:[\\/]/i,
  /(?:^|[^\\])\\\\[^\\\s]+\\[^\s]+/,
  /(?:^|[^a-z0-9_])\.env(?:$|[^a-z0-9_])/i,
  /(?:^|[^a-z0-9])(?:password|passwd|credential|api[_ -]?key|access[_ -]?token|refresh[_ -]?token|secret)\b\s*(?::|=|\bis\b)\s*\S+/i,
  /\bbearer\s+[a-z0-9._~+/-]{10,}/i,
  /-----begin\s+(?:[a-z0-9-]+\s+)*private\s+key-----/i,
  /\b(?:sk-[a-z0-9_-]{16,}|gh[pousr]_[a-z0-9]{16,}|akia[0-9a-z]{12,})\b/i,
  /\b(?:https?|file|ftp|ftps|ssh|sftp|mailto|data|tel|urn|ws|wss|gemini|ipfs):/i,
  /\b(?:www\.[a-z0-9-]+(?:\.[a-z0-9-]+)+|[a-z0-9-]+(?:\.[a-z0-9-]+)+\/)\S*/i,
  /\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,24}\b/i,
  /\b[a-z0-9_-]{4,}\.[a-z0-9_-]{10,}\.[a-z0-9_-]{10,}\b/i
];

export const SNAPSHOT_KEY = 'hermeter:snapshot:v1';
export const HEARTBEAT_KEY = 'hermeter:heartbeat:v1';

export type SnapshotSession = {
  sessionKey: string;
  title: string | null;
};

export type SnapshotBucket = {
  day: string;
  hour: number;
  provider: string;
  model: string;
  source: string;
  sessionKey: string;
  calls: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  knownCostNanos: number;
  incompleteEvents: number;
  apiEquivalentEvents?: number;
};

export type DashboardSnapshot = {
  schema: 'hermeter.snapshot.v1';
  dataRevision: number;
  generatedAtMs: number;
  coveredFromMs: number;
  checkedThroughMs: number;
  sessions: SnapshotSession[];
  buckets: SnapshotBucket[];
};

export type SnapshotHeartbeat = {
  schema: 'hermeter.heartbeat.v1';
  dataRevision: number;
  generatedAtMs: number;
  checkedThroughMs: number;
};

export type SnapshotMetadata = {
  generatedAtMs: number;
  coveredFromMs: number;
  checkedThroughMs: number;
  dataRevision: number;
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
  if (parsed > MAX_TIMESTAMP_MS) throw new Error(`${label} timestamp is outside the supported date range`);
  return parsed;
}

function text(value: unknown, label: string, maximum = 160): string {
  if (typeof value !== 'string' || !value || value.length > maximum) {
    throw new Error(`${label} must be a non-empty string up to ${maximum} characters`);
  }
  return value;
}

function validDay(value: unknown): string {
  const day = text(value, 'day', 10);
  const match = DAY.exec(day);
  if (!match) throw new Error('invalid day');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const date = Number(match[3]);
  const lastDate = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (year < 1 || month < 1 || month > 12 || date < 1 || date > lastDate) {
    throw new Error('invalid day');
  }
  return day;
}

function publicLabel(value: unknown, label: string): string {
  const parsed = text(value, label);
  if (
    UNSAFE_SESSION_TITLE_CONTROL.test(parsed)
    || UNSAFE_SESSION_TITLE.some((pattern) => pattern.test(parsed))
  ) throw new Error(`unsafe ${label}`);
  return parsed;
}

function sessionTitle(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') throw new Error('title must be a non-empty string up to 160 characters');
  if (UNSAFE_SESSION_TITLE_CONTROL.test(value)) throw new Error('unsafe session title');
  const title = value.trim().split(/\s+/u).join(' ');
  if (!title || title.length > 160) throw new Error('title must be a non-empty string up to 160 characters');
  if (UNSAFE_SESSION_TITLE.some((pattern) => pattern.test(title))) throw new Error('unsafe session title');
  return title;
}

function parseSession(value: unknown): SnapshotSession {
  const item = record(value, 'session');
  exactFields(item, SESSION_FIELDS, 'session');
  const sessionKey = text(item.sessionKey, 'sessionKey');
  if (!SESSION_ID.test(sessionKey)) throw new Error('invalid sessionKey');
  return { sessionKey, title: sessionTitle(item.title) };
}

function parseBucket(value: unknown): SnapshotBucket {
  const item = record(value, 'bucket');
  exactFields(item, BUCKET_FIELDS, 'bucket');
  const sessionKey = text(item.sessionKey, 'sessionKey');
  if (!SESSION_ID.test(sessionKey)) throw new Error('invalid sessionKey');
  const hour = integer(item.hour, 'hour');
  if (hour > 23) throw new Error('hour must be <= 23');
  const source = text(item.source, 'source');
  if (!SOURCES.has(source)) throw new Error('invalid source');
  const calls = integer(item.calls, 'calls', 1);
  const inputTokens = integer(item.inputTokens, 'inputTokens');
  const cachedInputTokens = integer(item.cachedInputTokens, 'cachedInputTokens');
  if (cachedInputTokens > inputTokens) throw new Error('cachedInputTokens exceeds inputTokens');
  const incompleteEvents = integer(item.incompleteEvents, 'incompleteEvents');
  if (incompleteEvents > calls) throw new Error('incompleteEvents exceeds calls');
  const apiEquivalentEvents = item.apiEquivalentEvents === undefined
    ? undefined
    : integer(item.apiEquivalentEvents, 'apiEquivalentEvents');
  if (apiEquivalentEvents !== undefined && apiEquivalentEvents > calls) {
    throw new Error('apiEquivalentEvents exceeds calls');
  }
  return {
    day: validDay(item.day),
    hour,
    provider: publicLabel(item.provider, 'provider'),
    model: publicLabel(item.model, 'model'),
    source,
    sessionKey,
    calls,
    inputTokens,
    cachedInputTokens,
    outputTokens: integer(item.outputTokens, 'outputTokens'),
    knownCostNanos: integer(item.knownCostNanos, 'knownCostNanos'),
    incompleteEvents,
    ...(apiEquivalentEvents === undefined ? {} : { apiEquivalentEvents })
  };
}

function hourStartInKolkata(day: string, hour: number): number {
  return Date.parse(`${day}T${String(hour).padStart(2, '0')}:00:00+05:30`);
}

function addSafeTotal(total: number, value: number, label: string): number {
  if (value > Number.MAX_SAFE_INTEGER - total) {
    throw new Error(`aggregate ${label} exceeds JavaScript safe integer range`);
  }
  return total + value;
}

export function parseSnapshot(value: unknown): DashboardSnapshot {
  const payload = record(value, 'snapshot');
  exactFields(payload, SNAPSHOT_FIELDS, 'snapshot');
  if (payload.schema !== 'hermeter.snapshot.v1') throw new Error('unsupported schema');
  if (!Array.isArray(payload.sessions)) throw new Error('sessions must be an array');
  if (!Array.isArray(payload.buckets)) throw new Error('buckets must be an array');
  if (payload.sessions.length > MAX_SESSIONS) throw new Error('too many sessions');
  if (payload.buckets.length > MAX_BUCKETS) throw new Error('too many buckets');
  const generatedAtMs = timestamp(payload.generatedAtMs, 'generatedAtMs');
  const coveredFromMs = timestamp(payload.coveredFromMs, 'coveredFromMs');
  const checkedThroughMs = timestamp(payload.checkedThroughMs, 'checkedThroughMs');
  const dataRevision = payload.dataRevision === undefined
    ? generatedAtMs
    : integer(payload.dataRevision, 'dataRevision');
  if (coveredFromMs > checkedThroughMs) throw new Error('coveredFromMs exceeds checkedThroughMs');
  if (checkedThroughMs > generatedAtMs) throw new Error('checkedThroughMs exceeds generatedAtMs');

  const sessions = payload.sessions.map(parseSession);
  const sessionKeys = new Set<string>();
  for (const session of sessions) {
    if (sessionKeys.has(session.sessionKey)) throw new Error('duplicate session');
    sessionKeys.add(session.sessionKey);
  }

  const buckets = payload.buckets.map(parseBucket);
  const bucketKeys = new Set<string>();
  const aggregateFields = [
    'calls', 'inputTokens', 'cachedInputTokens', 'outputTokens',
    'knownCostNanos', 'incompleteEvents', 'apiEquivalentEvents'
  ] as const;
  const totals: Record<(typeof aggregateFields)[number], number> = {
    calls: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    knownCostNanos: 0,
    incompleteEvents: 0,
    apiEquivalentEvents: 0
  };
  for (const bucket of buckets) {
    const bucketStartMs = hourStartInKolkata(bucket.day, bucket.hour);
    const bucketEndMs = bucketStartMs + 60 * 60 * 1000;
    if (bucketEndMs <= coveredFromMs || bucketStartMs > checkedThroughMs) {
      throw new Error('bucket hour is outside snapshot coverage');
    }
    if (!sessionKeys.has(bucket.sessionKey)) throw new Error('bucket references undeclared session');
    for (const field of aggregateFields) {
      totals[field] = addSafeTotal(totals[field], bucket[field] ?? 0, field);
    }
    const key = JSON.stringify([
      bucket.day, bucket.hour, bucket.provider, bucket.model, bucket.source, bucket.sessionKey
    ]);
    if (bucketKeys.has(key)) throw new Error('duplicate bucket');
    bucketKeys.add(key);
  }
  addSafeTotal(totals.inputTokens, totals.outputTokens, 'processedTokens');

  return {
    schema: 'hermeter.snapshot.v1',
    dataRevision,
    generatedAtMs,
    coveredFromMs,
    checkedThroughMs,
    sessions,
    buckets
  };
}

export function parseHeartbeat(value: unknown): SnapshotHeartbeat {
  const payload = record(value, 'heartbeat');
  exactFields(payload, HEARTBEAT_FIELDS, 'heartbeat');
  if (payload.schema !== 'hermeter.heartbeat.v1') throw new Error('unsupported schema');
  const generatedAtMs = timestamp(payload.generatedAtMs, 'generatedAtMs');
  const checkedThroughMs = timestamp(payload.checkedThroughMs, 'checkedThroughMs');
  if (checkedThroughMs > generatedAtMs) throw new Error('checkedThroughMs exceeds generatedAtMs');
  return {
    schema: 'hermeter.heartbeat.v1',
    dataRevision: integer(payload.dataRevision, 'dataRevision'),
    generatedAtMs,
    checkedThroughMs
  };
}

export function snapshotMetadata(snapshot: DashboardSnapshot): SnapshotMetadata {
  return {
    generatedAtMs: snapshot.generatedAtMs,
    coveredFromMs: snapshot.coveredFromMs,
    checkedThroughMs: snapshot.checkedThroughMs,
    dataRevision: snapshot.dataRevision
  };
}
