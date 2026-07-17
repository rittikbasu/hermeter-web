import {
  HEARTBEAT_KEY,
  MAX_TIMESTAMP_MS,
  SNAPSHOT_KEY,
  parseHeartbeat,
  parseSnapshot,
  snapshotMetadata,
  type DashboardSnapshot,
  type SnapshotHeartbeat,
  type SnapshotMetadata
} from './snapshot';

export class SnapshotUnavailableError extends Error {}

function parseStoredSnapshot(value: string): DashboardSnapshot {
  try {
    return parseSnapshot(JSON.parse(value));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    throw new Error(`stored snapshot is invalid: ${message}`);
  }
}

function parseStoredHeartbeat(value: string | null): SnapshotHeartbeat | null {
  if (value === null) return null;
  try {
    return parseHeartbeat(JSON.parse(value));
  } catch {
    return null;
  }
}

function canonicalMetadata(value: unknown): SnapshotMetadata | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const keys = ['generatedAtMs', 'coveredFromMs', 'checkedThroughMs', 'dataRevision'] as const;
  if (
    !keys.every((key) =>
      Number.isSafeInteger(item[key])
      && (item[key] as number) >= 0
      && (key === 'dataRevision' || (item[key] as number) <= MAX_TIMESTAMP_MS)
    )
  ) return null;
  const metadata = {
    generatedAtMs: item.generatedAtMs as number,
    coveredFromMs: item.coveredFromMs as number,
    checkedThroughMs: item.checkedThroughMs as number,
    dataRevision: item.dataRevision as number
  };
  if (
    metadata.coveredFromMs > metadata.checkedThroughMs
    || metadata.checkedThroughMs > metadata.generatedAtMs
  ) return null;
  return metadata;
}

function applyHeartbeat(
  snapshot: DashboardSnapshot,
  heartbeat: SnapshotHeartbeat | null
): DashboardSnapshot {
  if (
    !heartbeat
    || heartbeat.dataRevision !== snapshot.dataRevision
    || heartbeat.checkedThroughMs < snapshot.checkedThroughMs
    || heartbeat.generatedAtMs < snapshot.generatedAtMs
  ) return snapshot;
  return {
    ...snapshot,
    generatedAtMs: heartbeat.generatedAtMs,
    checkedThroughMs: heartbeat.checkedThroughMs
  };
}

export async function loadSnapshot(kv: KVNamespace): Promise<DashboardSnapshot> {
  const [value, heartbeatValue] = await Promise.all([
    kv.get(SNAPSHOT_KEY),
    kv.get(HEARTBEAT_KEY)
  ]);
  if (value === null) throw new SnapshotUnavailableError('dashboard snapshot is unavailable');
  return applyHeartbeat(parseStoredSnapshot(value), parseStoredHeartbeat(heartbeatValue));
}

export async function loadSnapshotMetadata(kv: KVNamespace): Promise<SnapshotMetadata> {
  const [stored, heartbeatValue] = await Promise.all([
    kv.getWithMetadata<SnapshotMetadata>(SNAPSHOT_KEY, { type: 'text' }),
    kv.get(HEARTBEAT_KEY)
  ]);
  if (stored.value === null) throw new Error('dashboard snapshot is unavailable');
  const metadata = canonicalMetadata(stored.metadata)
    ?? snapshotMetadata(parseStoredSnapshot(stored.value));
  const heartbeat = parseStoredHeartbeat(heartbeatValue);
  if (
    !heartbeat
    || heartbeat.dataRevision !== metadata.dataRevision
    || heartbeat.checkedThroughMs < metadata.checkedThroughMs
    || heartbeat.generatedAtMs < metadata.generatedAtMs
  ) return metadata;
  return {
    generatedAtMs: heartbeat.generatedAtMs,
    coveredFromMs: metadata.coveredFromMs,
    checkedThroughMs: heartbeat.checkedThroughMs,
    dataRevision: metadata.dataRevision
  };
}
