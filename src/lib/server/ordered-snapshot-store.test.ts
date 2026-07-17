import { describe, expect, it } from 'vitest';
import {
  AuthoritativeSnapshotUnavailableError,
  CasSnapshotAuthority,
  D1SnapshotAuthorityPersistence,
  StaleSnapshotError,
  loadVerifiedSnapshot,
  loadVerifiedSnapshotMetadata,
  saveOrderedHeartbeat,
  saveOrderedSnapshot,
  snapshotAuthorityState,
  type SnapshotAuthority,
  type SnapshotAuthorityPersistence,
  type SnapshotAuthorityState
} from './ordered-snapshot-store';
import { HEARTBEAT_KEY, SNAPSHOT_KEY, type DashboardSnapshot } from './snapshot';

const COVERED_FROM_MS = Date.parse('2026-07-15T18:30:00Z');
const GENERATED_BASE_MS = Date.parse('2026-07-16T18:29:00Z');

function makeSnapshot(
  revision: number,
  generatedOffsetMs: number,
  calls = revision
): DashboardSnapshot {
  const generatedAtMs = GENERATED_BASE_MS + generatedOffsetMs;
  return {
    schema: 'hermeter.snapshot.v1',
    dataRevision: revision,
    generatedAtMs,
    coveredFromMs: COVERED_FROM_MS,
    checkedThroughMs: generatedAtMs - 10,
    sessions: [{ sessionKey: 's_test', title: 'safe title' }],
    buckets: [{
      day: '2026-07-16', hour: 12, provider: 'openai', model: 'test-model', source: 'cli',
      sessionKey: 's_test', calls, inputTokens: 10, cachedInputTokens: 2,
      outputTokens: 3, knownCostNanos: 4, incompleteEvents: 0
    }]
  };
}

function equalState(
  left: SnapshotAuthorityState | null,
  right: SnapshotAuthorityState | null
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

class MemoryPersistence implements SnapshotAuthorityPersistence {
  state: SnapshotAuthorityState | null = null;

  async read() {
    await Promise.resolve();
    return this.state ? { ...this.state } : null;
  }

  async compareAndSwap(
    expected: SnapshotAuthorityState | null,
    replacement: SnapshotAuthorityState
  ) {
    await Promise.resolve();
    if (!equalState(this.state, expected)) return false;
    this.state = { ...replacement };
    return true;
  }
}

type StoredValue = { value: string; metadata?: unknown };

class FakeKV {
  values = new Map<string, StoredValue>();
  puts: string[] = [];
  putOptions = new Map<string, { expirationTtl?: number; metadata?: unknown }>();
  deletes: string[] = [];

  async put(key: string, value: string, options?: { expirationTtl?: number; metadata?: unknown }) {
    this.puts.push(key);
    this.putOptions.set(key, options ?? {});
    this.values.set(key, { value, metadata: options?.metadata });
  }

  async get(key: string) {
    return this.values.get(key)?.value ?? null;
  }

  async getWithMetadata(key: string) {
    const stored = this.values.get(key);
    return { value: stored?.value ?? null, metadata: stored?.metadata ?? null };
  }

  async delete(key: string) {
    this.deletes.push(key);
    this.values.delete(key);
  }

  async list({ prefix }: { prefix?: string } = {}) {
    return {
      keys: [...this.values.entries()]
        .filter(([name]) => !prefix || name.startsWith(prefix))
        .map(([name, stored]) => ({ name, metadata: stored.metadata })),
      list_complete: true,
      cacheStatus: null
    };
  }
}

class InspectingAuthority implements SnapshotAuthority {
  constructor(
    private inner: SnapshotAuthority,
    private kv: FakeKV
  ) {}

  async acceptSnapshot(candidate: SnapshotAuthorityState) {
    expect(this.kv.values.has(candidate.snapshotKey)).toBe(true);
    return this.inner.acceptSnapshot(candidate);
  }

  acceptHeartbeat(heartbeat: Parameters<SnapshotAuthority['acceptHeartbeat']>[0]) {
    return this.inner.acceptHeartbeat(heartbeat);
  }

  latest() {
    return this.inner.latest();
  }
}

type AuthorityRow = {
  snapshot_key: string;
  content_hash: string;
  data_revision: number;
  generated_at_ms: number;
  covered_from_ms: number;
  checked_through_ms: number;
};

class FakeD1Statement {
  bindings: unknown[] = [];

  constructor(
    readonly sql: string,
    private database: FakeD1Database
  ) {}

  bind(...bindings: unknown[]) {
    this.bindings = bindings;
    return this;
  }

  async first<T>() {
    return (this.database.row ? { ...this.database.row } : null) as T | null;
  }

  async run() {
    const replacement = this.database.rowFromBindings(this.bindings.slice(0, 6));
    if (/insert into/i.test(this.sql)) {
      if (this.database.row) return { meta: { changes: 0 } };
      this.database.row = replacement;
      return { meta: { changes: 1 } };
    }
    const expected = this.database.rowFromBindings(this.bindings.slice(6, 12));
    if (!this.database.row || JSON.stringify(this.database.row) !== JSON.stringify(expected)) {
      return { meta: { changes: 0 } };
    }
    this.database.row = replacement;
    return { meta: { changes: 1 } };
  }
}

class FakeD1Database {
  row: AuthorityRow | null = null;
  statements: FakeD1Statement[] = [];

  prepare(sql: string) {
    const statement = new FakeD1Statement(sql, this);
    this.statements.push(statement);
    return statement;
  }

  rowFromBindings(values: unknown[]): AuthorityRow {
    return {
      snapshot_key: values[0] as string,
      content_hash: values[1] as string,
      data_revision: values[2] as number,
      generated_at_ms: values[3] as number,
      covered_from_ms: values[4] as number,
      checked_through_ms: values[5] as number
    };
  }
}

describe('ordered snapshot store', () => {
  it('persists only a small control record in D1', async () => {
    const database = new FakeD1Database();
    const persistence = new D1SnapshotAuthorityPersistence(database as unknown as D1Database);
    const state = await snapshotAuthorityState(makeSnapshot(1, 200));

    expect(await persistence.compareAndSwap(null, state)).toBe(true);
    await expect(persistence.read()).resolves.toEqual(state);
    expect(JSON.stringify(database.row).length).toBeLessThan(500);
    expect(database.statements[0]?.sql).not.toMatch(/snapshot_json/i);
  });

  it('writes the immutable KV object before D1 can accept it', async () => {
    const persistence = new MemoryPersistence();
    const kv = new FakeKV();
    const authority = new InspectingAuthority(new CasSnapshotAuthority(persistence), kv);

    await saveOrderedSnapshot(authority, kv as unknown as KVNamespace, makeSnapshot(1, 200));

    expect(kv.puts).toHaveLength(1);
    expect(kv.puts[0]).toMatch(/^hermeter:snapshot:v2:/);
    expect(kv.putOptions.get(kv.puts[0]!)?.expirationTtl).toBe(30 * 24 * 60 * 60);
    expect(kv.puts).not.toContain(SNAPSHOT_KEY);
    expect(kv.puts).not.toContain(HEARTBEAT_KEY);
  });

  it('converges on revision three under three concurrent full ingests', async () => {
    const persistence = new MemoryPersistence();
    const authority = new CasSnapshotAuthority(persistence);
    const kv = new FakeKV();

    const results = await Promise.allSettled([1, 2, 3].map((revision) =>
      saveOrderedSnapshot(
        authority,
        kv as unknown as KVNamespace,
        makeSnapshot(revision, revision * 100)
      )
    ));

    expect(results.some(({ status }) => status === 'fulfilled')).toBe(true);
    expect(persistence.state?.dataRevision).toBe(3);
    await expect(loadVerifiedSnapshot(persistence, kv as unknown as KVNamespace))
      .resolves.toMatchObject({ dataRevision: 3, buckets: [{ calls: 3 }] });
  });

  it('rejects reused revisions with changed content and gives retries distinct orphan keys', async () => {
    const persistence = new MemoryPersistence();
    const authority = new CasSnapshotAuthority(persistence);
    const kv = new FakeKV();
    await saveOrderedSnapshot(authority, kv as unknown as KVNamespace, makeSnapshot(7, 700, 7));
    const conflicting = makeSnapshot(7, 800, 99);
    await expect(saveOrderedSnapshot(
      authority,
      kv as unknown as KVNamespace,
      conflicting
    )).rejects.toBeInstanceOf(StaleSnapshotError);

    await expect(saveOrderedSnapshot(
      authority,
      kv as unknown as KVNamespace,
      conflicting
    )).rejects.toBeInstanceOf(StaleSnapshotError);

    expect(new Set(kv.puts).size).toBe(3);
    expect(kv.values.size).toBe(3);
    expect(persistence.state?.dataRevision).toBe(7);
  });

  it('rejects a lower revision even when its freshness timestamps are newer', async () => {
    const persistence = new MemoryPersistence();
    const authority = new CasSnapshotAuthority(persistence);
    const kv = new FakeKV();
    await saveOrderedSnapshot(authority, kv as unknown as KVNamespace, makeSnapshot(10, 500));

    await expect(saveOrderedSnapshot(
      authority,
      kv as unknown as KVNamespace,
      makeSnapshot(9, 900)
    )).rejects.toBeInstanceOf(StaleSnapshotError);
    expect(persistence.state?.dataRevision).toBe(10);
  });

  it('uses D1 to select the authoritative immutable key', async () => {
    const persistence = new MemoryPersistence();
    const authority = new CasSnapshotAuthority(persistence);
    const kv = new FakeKV();
    await saveOrderedSnapshot(authority, kv as unknown as KVNamespace, makeSnapshot(2, 200, 2));
    const authoritative = persistence.state!;
    kv.values.set(SNAPSHOT_KEY, { value: JSON.stringify(makeSnapshot(1, 100, 99)) });

    await expect(loadVerifiedSnapshot(persistence, kv as unknown as KVNamespace))
      .resolves.toMatchObject({ dataRevision: 2, buckets: [{ calls: 2 }] });
    expect(await kv.get(authoritative.snapshotKey)).not.toBeNull();
  });

  it('fails closed when D1 points to a missing immutable snapshot', async () => {
    const persistence = new MemoryPersistence();
    persistence.state = await snapshotAuthorityState(makeSnapshot(2, 200));

    const kv = new FakeKV() as unknown as KVNamespace;
    await expect(loadVerifiedSnapshot(persistence, kv))
      .rejects.toBeInstanceOf(AuthoritativeSnapshotUnavailableError);
    await expect(loadVerifiedSnapshotMetadata(persistence, kv))
      .rejects.toBeInstanceOf(AuthoritativeSnapshotUnavailableError);
  });

  it('advances heartbeat freshness and refreshes only the selected key TTL', async () => {
    const persistence = new MemoryPersistence();
    const authority = new CasSnapshotAuthority(persistence);
    const kv = new FakeKV();
    await saveOrderedSnapshot(authority, kv as unknown as KVNamespace, makeSnapshot(4, 400));
    const puts = kv.puts.length;

    await saveOrderedHeartbeat(authority, kv as unknown as KVNamespace, {
      schema: 'hermeter.heartbeat.v1',
      dataRevision: 4,
      generatedAtMs: GENERATED_BASE_MS + 500,
      checkedThroughMs: GENERATED_BASE_MS + 490
    });

    expect(kv.puts).toHaveLength(puts + 1);
    expect(kv.puts.at(-1)).toBe(persistence.state?.snapshotKey);
    expect(kv.putOptions.get(kv.puts.at(-1)!)?.expirationTtl).toBe(30 * 24 * 60 * 60);
    await expect(loadVerifiedSnapshot(persistence, kv as unknown as KVNamespace))
      .resolves.toMatchObject({
        dataRevision: 4,
        generatedAtMs: GENERATED_BASE_MS + 500,
        checkedThroughMs: GENERATED_BASE_MS + 490
      });
    await expect(loadVerifiedSnapshotMetadata(persistence, kv as unknown as KVNamespace))
      .resolves.toEqual({
        dataRevision: 4,
        generatedAtMs: GENERATED_BASE_MS + 500,
        coveredFromMs: COVERED_FROM_MS,
        checkedThroughMs: GENERATED_BASE_MS + 490
      });
  });

  it('does not advance heartbeat authority when the TTL refresh fails', async () => {
    const persistence = new MemoryPersistence();
    const authority = new CasSnapshotAuthority(persistence);
    const kv = new FakeKV();
    await saveOrderedSnapshot(authority, kv as unknown as KVNamespace, makeSnapshot(4, 400));
    const before = { ...persistence.state! };
    kv.put = async () => { throw new Error('KV write failed'); };

    await expect(saveOrderedHeartbeat(authority, kv as unknown as KVNamespace, {
      schema: 'hermeter.heartbeat.v1',
      dataRevision: 4,
      generatedAtMs: GENERATED_BASE_MS + 500,
      checkedThroughMs: GENERATED_BASE_MS + 490
    })).rejects.toThrow(/KV write failed/i);
    expect(persistence.state).toEqual(before);
  });

});
