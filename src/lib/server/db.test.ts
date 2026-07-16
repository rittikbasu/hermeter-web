import { describe, expect, it } from 'vitest';
import { applyIngest } from './db';
import type { IngestPayload } from './ingest';

class FakeStatement {
  constructor(
    readonly sql: string,
    readonly args: unknown[] = [],
    readonly changes = 1
  ) {}

  bind(...args: unknown[]) {
    return new FakeStatement(this.sql, args, this.changes);
  }

  async run() {
    return { success: true, meta: { changes: this.changes } };
  }
}

class FakeDatabase {
  batches: FakeStatement[][] = [];
  runs: FakeStatement[] = [];

  prepare(sql: string) {
    const statement = new FakeStatement(sql);
    const originalRun = statement.run.bind(statement);
    statement.run = async () => {
      this.runs.push(statement);
      return originalRun();
    };
    const originalBind = statement.bind.bind(statement);
    statement.bind = (...args: unknown[]) => {
      const bound = originalBind(...args);
      const run = bound.run.bind(bound);
      bound.run = async () => {
        this.runs.push(bound);
        return run();
      };
      return bound;
    };
    return statement;
  }

  async batch(statements: FakeStatement[]) {
    this.batches.push(statements);
    return statements.map(() => ({ success: true, meta: { changes: 1 } }));
  }
}

const event = {
  eventId: 'e_1234567890abcdefghijkl', occurredAtMs: 1784180714000,
  localDay: '2026-07-16', localHour: 12, kind: 'text' as const,
  provider: 'openai', model: 'gpt-5.6-sol', source: 'telegram',
  sessionKey: 's_1234567890abcdefghijkl', inputTokens: 100,
  cachedInputTokens: 80, outputTokens: 10, imageSize: null,
  imageQuality: null, knownCostNanos: 1234, costStatus: 'complete' as const,
  pricingConfidence: 'exact_from_usage', pricingVersion: 'pricelord:test'
};
const session = {
  sessionKey: event.sessionKey, title: null,
  firstSeenMs: event.occurredAtMs, lastSeenMs: event.occurredAtMs
};

function payload(events = [event]): IngestPayload {
  return {
    schema: 'hermeter.ingest.v1', generatedAtMs: 1784181600000,
    coveredFromMs: 1783621800000,
    checkedThroughMs: 1784181600000, complete: true,
    sessions: events.length ? [session] : [], events
  };
}

describe('applyIngest', () => {
  it('upserts session and event before advancing coverage', async () => {
    const db = new FakeDatabase();
    const result = await applyIngest(db as unknown as D1Database, payload());

    expect(db.batches).toHaveLength(1);
    expect(db.batches[0]).toHaveLength(2);
    expect(db.batches[0][0].sql).toMatch(/insert into sessions/i);
    expect(db.batches[0][1].sql).toMatch(/insert into usage_events/i);
    expect(db.runs.at(-1)?.sql).toMatch(/insert into sync_state/i);
    expect(result).toEqual({ acceptedEvents: 1, changed: true });
  });

  it('records an empty complete heartbeat without touching event tables', async () => {
    const db = new FakeDatabase();
    const result = await applyIngest(db as unknown as D1Database, payload([]));

    expect(db.batches).toHaveLength(0);
    expect(db.runs).toHaveLength(1);
    expect(db.runs[0].sql).toMatch(/covered_from_ms/i);
    expect(db.runs[0].args).toEqual([
      1784181600000, 1783621800000, 1784181600000, 1, 1, 1
    ]);
    expect(result).toEqual({ acceptedEvents: 0, changed: false });
  });
});
