import { describe, expect, it } from 'vitest';
import { loadSnapshot, loadSnapshotMetadata } from './snapshot-store';
import {
  HEARTBEAT_KEY,
  SNAPSHOT_KEY,
  snapshotMetadata,
  type DashboardSnapshot,
  type SnapshotHeartbeat
} from './snapshot';

const snapshot: DashboardSnapshot = {
  schema: 'hermeter.snapshot.v1',
  dataRevision: 7,
  generatedAtMs: 300,
  coveredFromMs: 100,
  checkedThroughMs: 250,
  sessions: [],
  buckets: []
};

const heartbeat: SnapshotHeartbeat = {
  schema: 'hermeter.heartbeat.v1',
  dataRevision: 7,
  generatedAtMs: 400,
  checkedThroughMs: 390
};

class FakeKV {
  values = new Map<string, string>();
  metadata = new Map<string, Record<string, unknown>>();

  async put(key: string, value: string, options?: unknown) {
    this.values.set(key, value);
    const stored = (options as { metadata?: Record<string, unknown> } | undefined)?.metadata;
    if (stored) this.metadata.set(key, stored);
  }

  async get(key: string) {
    return this.values.get(key) ?? null;
  }

  async getWithMetadata(key: string) {
    return {
      value: this.values.get(key) ?? null,
      metadata: this.metadata.get(key) ?? null
    };
  }
}

async function seed(kv: FakeKV) {
  await kv.put(SNAPSHOT_KEY, JSON.stringify(snapshot), {
    metadata: snapshotMetadata(snapshot)
  });
  await kv.put(HEARTBEAT_KEY, JSON.stringify(heartbeat));
}

describe('snapshot KV reader', () => {
  it('overlays a matching heartbeat on the complete snapshot', async () => {
    const kv = new FakeKV();
    await seed(kv);

    await expect(loadSnapshot(kv as unknown as KVNamespace)).resolves.toEqual({
      ...snapshot,
      generatedAtMs: 400,
      checkedThroughMs: 390
    });
    await expect(loadSnapshotMetadata(kv as unknown as KVNamespace)).resolves.toEqual({
      generatedAtMs: 400,
      coveredFromMs: 100,
      checkedThroughMs: 390,
      dataRevision: 7
    });
  });

  it('does not overlay a mismatched heartbeat', async () => {
    const kv = new FakeKV();
    await seed(kv);
    kv.values.set(HEARTBEAT_KEY, JSON.stringify({ ...heartbeat, dataRevision: 8 }));

    await expect(loadSnapshot(kv as unknown as KVNamespace)).resolves.toEqual(snapshot);
    await expect(loadSnapshotMetadata(kv as unknown as KVNamespace)).resolves.toEqual(
      snapshotMetadata(snapshot)
    );
  });

  it('ignores unknown metadata and falls back when metadata timestamps are impossible', async () => {
    const kv = new FakeKV();
    await seed(kv);
    kv.metadata.set(SNAPSHOT_KEY, {
      generatedAtMs: 1,
      coveredFromMs: 3,
      checkedThroughMs: 2,
      dataRevision: 99,
      accidentalPrivateField: 'must not pass through'
    });

    await expect(loadSnapshotMetadata(kv as unknown as KVNamespace)).resolves.toEqual({
      generatedAtMs: 400,
      coveredFromMs: 100,
      checkedThroughMs: 390,
      dataRevision: 7
    });
  });

  it('fails visibly when no valid snapshot exists', async () => {
    const kv = new FakeKV();
    await expect(loadSnapshot(kv as unknown as KVNamespace)).rejects.toThrow(/unavailable/i);
    kv.values.set(SNAPSHOT_KEY, '{not json');
    await expect(loadSnapshot(kv as unknown as KVNamespace)).rejects.toThrow(/invalid/i);
  });
});
