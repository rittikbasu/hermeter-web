import { describe, expect, it } from 'vitest';
import { GET } from './+server';

const snapshot = {
  schema: 'hermeter.snapshot.v1',
  dataRevision: 7,
  generatedAtMs: Date.parse('2026-07-16T07:00:00Z'),
  coveredFromMs: Date.parse('2026-07-15T18:30:00Z'),
  checkedThroughMs: Date.parse('2026-07-16T07:00:00Z'),
  sessions: [{ sessionKey: 's_one', title: null }],
  buckets: [{
    day: '2026-07-16', hour: 12, provider: 'openai', model: 'gpt-5.6-sol',
    source: 'telegram', sessionKey: 's_one', calls: 2, inputTokens: 100,
    cachedInputTokens: 80, outputTokens: 10, knownCostNanos: 1000, incompleteEvents: 0
  }]
};

const kv = {
  async get(key: string) {
    return key === 'hermeter:snapshot:v1' ? JSON.stringify(snapshot) : null;
  }
};

const db = {
  prepare() {
    return { async first() { return null; } };
  }
};

describe('GET /api/dashboard', () => {
  it('loads the selected range from the KV snapshot', async () => {
    const response = await GET({
      url: new URL('http://localhost/api/dashboard?from=2026-07-16&to=2026-07-16'),
      platform: { env: { DB: db, SNAPSHOTS: kv } }
    } as never);

    expect(response.status).toBe(200);
    const data = await response.json() as { summary: { calls: number } };
    expect(data.summary.calls).toBe(2);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('fails visibly without the snapshot binding', async () => {
    const response = await GET({
      url: new URL('http://localhost/api/dashboard?from=2026-07-16&to=2026-07-16'),
      platform: { env: {} }
    } as never);

    expect(response.status).toBe(503);
  });
});
