import { describe, expect, it } from 'vitest';
import { GET } from './+server';
import { HEARTBEAT_KEY, SNAPSHOT_KEY } from '$lib/server/snapshot';

const snapshot = {
  schema: 'hermeter.snapshot.v1',
  sessions: [],
  buckets: [],
  generatedAtMs: Date.parse('2026-07-16T07:00:00Z'),
  coveredFromMs: Date.parse('2026-07-15T18:30:00Z'),
  checkedThroughMs: Date.parse('2026-07-16T06:30:00Z'),
  dataRevision: 7
};

const kv = {
  async getWithMetadata(key: string) {
    if (key !== SNAPSHOT_KEY) throw new Error('unexpected key');
    return {
      value: JSON.stringify(snapshot),
      metadata: {
        generatedAtMs: snapshot.generatedAtMs,
        coveredFromMs: snapshot.coveredFromMs,
        checkedThroughMs: snapshot.checkedThroughMs,
        dataRevision: snapshot.dataRevision
      }
    };
  },
  async get(key: string) {
    if (key === SNAPSHOT_KEY) return JSON.stringify(snapshot);
    if (key !== HEARTBEAT_KEY) throw new Error('unexpected key');
    return JSON.stringify({
      schema: 'hermeter.heartbeat.v1',
      generatedAtMs: Date.parse('2026-07-16T08:00:00Z'),
      checkedThroughMs: Date.parse('2026-07-16T07:30:00Z'),
      dataRevision: 7
    });
  }
};

const db = {
  prepare() {
    return { async first() { return null; } };
  }
};

describe('GET /api/status', () => {
  it('combines canonical snapshot metadata with a matching heartbeat', async () => {
    const response = await GET({ platform: { env: { DB: db, SNAPSHOTS: kv } } } as never);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      generatedAtMs: Date.parse('2026-07-16T08:00:00Z'),
      coveredFromMs: Date.parse('2026-07-15T18:30:00Z'),
      checkedThroughMs: Date.parse('2026-07-16T07:30:00Z'),
      dataRevision: 7
    });
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('fails visibly without the snapshot binding', async () => {
    const response = await GET({ platform: { env: {} } } as never);
    expect(response.status).toBe(503);
  });
});
