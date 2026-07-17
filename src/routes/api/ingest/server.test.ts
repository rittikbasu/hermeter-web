import { describe, expect, it } from 'vitest';
import { POST } from './+server';
import { HEARTBEAT_KEY, SNAPSHOT_KEY } from '$lib/server/snapshot';

function validSnapshot(overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    schema: 'hermeter.snapshot.v1',
    dataRevision: 7,
    generatedAtMs: now,
    coveredFromMs: now - 1_000,
    checkedThroughMs: now,
    sessions: [],
    buckets: [],
    ...overrides
  };
}

class FakeKV {
  values = new Map<string, string>();
  metadata = new Map<string, Record<string, unknown>>();
  puts: Array<{ key: string; value: string; options: unknown }> = [];

  async put(key: string, value: string, options?: unknown) {
    this.puts.push({ key, value, options });
    this.values.set(key, value);
    const stored = (options as { metadata?: Record<string, unknown> } | undefined)?.metadata;
    if (stored) this.metadata.set(key, stored);
  }

  async get(key: string) {
    return this.values.get(key) ?? null;
  }

  async getWithMetadata(key: string) {
    return { value: this.values.get(key) ?? null, metadata: this.metadata.get(key) ?? null };
  }

  async delete(key: string) {
    this.values.delete(key);
    this.metadata.delete(key);
  }

  async list({ prefix }: { prefix?: string } = {}) {
    return {
      keys: [...this.values.keys()]
        .filter((key) => !prefix || key.startsWith(prefix))
        .map((name) => ({ name, metadata: this.metadata.get(name) })),
      list_complete: true,
      cacheStatus: null
    };
  }
}

class FakeAuthorityDatabase {
  row: Record<string, unknown> | null = null;

  prepare(sql: string) {
    const database = this;
    let bindings: unknown[] = [];
    const statement = {
      bind(...values: unknown[]) {
        bindings = values;
        return statement;
      },
      async first() {
        return database.row;
      },
      async run() {
        const replacement = bindings.slice(0, 6);
        let changes = 0;
        if (/\binsert\b/i.test(sql)) {
          if (database.row === null) {
            database.row = rowFrom(replacement);
            changes = 1;
          }
        } else if (/\bupdate\b/i.test(sql) && database.row !== null) {
          const expected = bindings.slice(6);
          if (JSON.stringify(rowValues(database.row)) === JSON.stringify(expected)) {
            database.row = rowFrom(replacement);
            changes = 1;
          }
        }
        return { success: true, meta: { changes } };
      }
    };
    return statement;
  }
}

function rowFrom(values: unknown[]): Record<string, unknown> {
  return {
    snapshot_key: values[0],
    content_hash: values[1],
    data_revision: values[2],
    generated_at_ms: values[3],
    covered_from_ms: values[4],
    checked_through_ms: values[5]
  };
}

function rowValues(row: Record<string, unknown>): unknown[] {
  return [
    row.snapshot_key,
    row.content_hash,
    row.data_revision,
    row.generated_at_ms,
    row.covered_from_ms,
    row.checked_through_ms
  ];
}

async function post(
  payload: unknown,
  kv = new FakeKV(),
  db = new FakeAuthorityDatabase()
) {
  const request = new Request('http://localhost/api/ingest', {
    method: 'POST',
    body: typeof payload === 'string' ? payload : JSON.stringify(payload)
  });
  const response = await POST({ request, platform: { env: { SNAPSHOTS: kv, DB: db } } } as never);
  return { response, kv, db };
}

describe('POST /api/ingest', () => {
  it('accepts legacy ingest payloads through D1 during rollout', async () => {
    const runs: unknown[][] = [];
    const db = {
      prepare() {
        return {
          bind(...args: unknown[]) {
            return {
              async run() {
                runs.push(args);
                return { success: true, meta: { changes: 1 } };
              }
            };
          }
        };
      },
      async batch() { return []; }
    };
    const now = Date.now();
    const request = new Request('http://localhost/api/ingest', {
      method: 'POST',
      body: JSON.stringify({
        schema: 'hermeter.ingest.v1',
        generatedAtMs: now,
        coveredFromMs: now - 1_000,
        checkedThroughMs: now,
        complete: true,
        sessions: [],
        events: []
      })
    });

    const response = await POST({ request, platform: { env: { DB: db } } } as never);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, acceptedEvents: 0 });
    expect(runs).toHaveLength(1);
  });

  it('keeps malformed producer input as a client error', async () => {
    const { response } = await post('{not json');
    expect(response.status).toBe(400);
  });

  it('writes one immutable snapshot before advancing D1 authority', async () => {
    const payload = validSnapshot();
    const { response, kv } = await post(payload);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      acceptedBuckets: 0,
      checkedThroughMs: payload.checkedThroughMs,
      dataRevision: 7,
      kind: 'snapshot'
    });
    expect(kv.puts.map(({ key }) => key)).toHaveLength(1);
    expect(kv.puts[0]?.key).toMatch(/^hermeter:snapshot:v2:/);
    expect(kv.puts.map(({ key }) => key)).not.toContain(SNAPSHOT_KEY);
    expect(kv.puts.map(({ key }) => key)).not.toContain(HEARTBEAT_KEY);
  });

  it('accepts a matching tiny heartbeat and refreshes only the selected key', async () => {
    const kv = new FakeKV();
    const db = new FakeAuthorityDatabase();
    await post(validSnapshot(), kv, db);
    kv.puts = [];
    const heartbeat = {
      schema: 'hermeter.heartbeat.v1',
      dataRevision: 7,
      generatedAtMs: Date.now() + 1,
      checkedThroughMs: Date.now()
    };

    const { response } = await post(heartbeat, kv, db);

    expect(response.status).toBe(200);
    const result = (await response.json()) as { kind?: unknown };
    expect(result.kind).toBe('heartbeat');
    expect(kv.puts).toHaveLength(1);
    expect(kv.puts[0]?.key).toBe(db.row?.snapshot_key);
    expect((kv.puts[0]?.options as { expirationTtl?: number }).expirationTtl)
      .toBe(30 * 24 * 60 * 60);
  });

  it('rejects stale snapshots and mismatched heartbeats without changing authority', async () => {
    const kv = new FakeKV();
    const db = new FakeAuthorityDatabase();
    const current = validSnapshot();
    await post(current, kv, db);
    const authoritativeKey = db.row?.snapshot_key;
    kv.puts = [];

    const stale = await post(validSnapshot({
      generatedAtMs: (current.generatedAtMs as number) - 1,
      checkedThroughMs: (current.generatedAtMs as number) - 1,
      dataRevision: 8
    }), kv, db);
    expect(stale.response.status).toBe(409);

    const mismatch = await post({
      schema: 'hermeter.heartbeat.v1', dataRevision: 8,
      generatedAtMs: Date.now(), checkedThroughMs: Date.now()
    }, kv, db);
    expect(mismatch.response.status).toBe(409);
    expect(db.row?.snapshot_key).toBe(authoritativeKey);
    expect(kv.values.has(authoritativeKey as string)).toBe(true);
    expect(kv.values.size).toBe(2);
  });

  it('rejects an undeclared oversized body', async () => {
    const request = new Request('http://localhost/api/ingest', {
      method: 'POST',
      body: 'x'.repeat(5 * 1024 * 1024 + 1)
    });
    const response = await POST({
      request,
      platform: { env: { SNAPSHOTS: new FakeKV() } }
    } as never);
    expect(response.status).toBe(413);
  });

  it('returns a generic service error when KV fails', async () => {
    const request = new Request('http://localhost/api/ingest', {
      method: 'POST',
      body: JSON.stringify(validSnapshot())
    });
    const platform = {
      env: {
        SNAPSHOTS: {
          async get() { return null; },
          put() { throw new Error('private KV failure details'); }
        },
        DB: new FakeAuthorityDatabase()
      }
    };

    const response = await POST({ request, platform } as never);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'ingest temporarily unavailable' });
  });

  it('fails closed when the D1 snapshot authority is unavailable', async () => {
    const request = new Request('http://localhost/api/ingest', {
      method: 'POST',
      body: JSON.stringify(validSnapshot())
    });
    const response = await POST({
      request,
      platform: { env: { SNAPSHOTS: new FakeKV() } }
    } as never);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'snapshot authority unavailable' });
  });

  it('fails visibly when the KV binding is unavailable', async () => {
    const request = new Request('http://localhost/api/ingest', {
      method: 'POST',
      body: JSON.stringify(validSnapshot())
    });

    const response = await POST({ request, platform: { env: {} } } as never);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'snapshot store unavailable' });
  });
});
