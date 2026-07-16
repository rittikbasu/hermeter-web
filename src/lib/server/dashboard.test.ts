import { describe, expect, it } from 'vitest';
import { loadDashboard, sessionAlias } from './dashboard';

class FakeStatement {
  constructor(readonly sql: string, readonly args: unknown[] = []) {}
  bind(...args: unknown[]) { return new FakeStatement(this.sql, args); }
}

class FakeDatabase {
  constructor(
    readonly daily: Array<Record<string, unknown>> = [{
      day: '2026-07-16', calls: 2, inputTokens: 100, cachedInputTokens: 80,
      outputTokens: 10, knownCostNanos: 123000000, incompleteEvents: 1
    }],
    readonly status: Record<string, number> = {
      generatedAtMs: Date.parse('2026-07-16T07:00:00Z'),
      coveredFromMs: Date.parse('2026-07-09T18:30:00Z'),
      checkedThroughMs: Date.parse('2026-07-16T07:00:00Z'),
      dataRevision: 3
    },
    readonly sessionTitle: string | null = 'range calendar redesign'
  ) {}
  prepare(sql: string) { return new FakeStatement(sql); }
  async batch(statements: FakeStatement[]) {
    expect(statements).toHaveLength(7);
    return [
      { results: [{ calls: 2, inputTokens: 100, cachedInputTokens: 80, outputTokens: 10, knownCostNanos: 123000000, incompleteEvents: 1 }] },
      { results: this.daily },
      { results: [{ day: '2026-07-16', hour: 12, calls: 2, knownCostNanos: 123000000 }] },
      { results: [{ provider: 'openai', model: 'gpt-5.6-sol', calls: 2, processedTokens: 110, knownCostNanos: 123000000 }] },
      { results: [{ source: 'telegram', calls: 2, processedTokens: 110, knownCostNanos: 123000000 }] },
      { results: [{
        sessionKey: 's_x', source: 'telegram', primaryModel: 'gpt-5.6-sol',
        title: this.sessionTitle, firstDay: '2026-07-10', calls: 2, knownCostNanos: 123000000
      }] },
      { results: [this.status] }
    ];
  }
}

describe('loadDashboard', () => {
  it('generates stable collision-resistant aliases for a large session sample', async () => {
    const sessionIds = Array.from({ length: 1_600 }, (_, index) => `s_${index.toString(36).padStart(24, '0')}`);
    const aliases = await Promise.all(sessionIds.map(sessionAlias));

    expect(new Set(aliases)).toHaveLength(sessionIds.length);
    expect(aliases[0]).toMatch(/^session [a-z]+-[a-z]+-[0-9a-z]{13}$/);
    expect(await sessionAlias(sessionIds[0])).toBe(aliases[0]);
  });

  it('returns one compact range-shaped view model', async () => {
    const data = await loadDashboard(
      new FakeDatabase() as unknown as D1Database,
      '2026-07-15',
      '2026-07-16'
    );

    expect(data.range).toEqual({ from: '2026-07-15', to: '2026-07-16' });
    expect(data.summary).toMatchObject({ calls: 2, processedTokens: 110, cacheRate: 80 });
    expect(data.daily).toHaveLength(2);
    expect(data.daily[0]).toMatchObject({ day: '2026-07-15', calls: 0, knownCostNanos: 0 });
    expect(data.hourly).toHaveLength(1);
    expect(data.models[0].model).toBe('gpt-5.6-sol');
    expect(data.sessions[0]).toMatchObject({
      label: 'range calendar redesign',
      source: 'telegram',
      calls: 2,
      knownCostNanos: 123000000
    });
    expect(data.sessions[0].alias).toMatch(/^session [a-z]+-[a-z]+-[0-9a-z]{13}$/);
    expect(data.sessions[0]).not.toHaveProperty('sessionKey');
    expect(data.sessions[0]).not.toHaveProperty('title');
    expect(data.status).toEqual({
      generatedAtMs: Date.parse('2026-07-16T07:00:00Z'),
      coveredFromMs: Date.parse('2026-07-09T18:30:00Z'),
      checkedThroughMs: Date.parse('2026-07-16T07:00:00Z'),
      dataRevision: 3
    });
    expect(data.coverage).toEqual({
      state: 'partial', fromDay: '2026-07-10', throughDay: '2026-07-16'
    });
  });

  it('falls back to a generated label when a session has no public title', async () => {
    const data = await loadDashboard(
      new FakeDatabase(undefined, undefined, null) as unknown as D1Database,
      '2026-07-15',
      '2026-07-16'
    );

    expect(data.sessions[0].label).toBe('telegram · gpt-5.6-sol · 10 jul');
  });

  it('does not synthesize zero usage before the coverage lower bound', async () => {
    const data = await loadDashboard(
      new FakeDatabase([]) as unknown as D1Database,
      '2026-07-01',
      '2026-07-02'
    );

    expect(data.coverage).toEqual({
      state: 'unavailable', fromDay: '2026-07-10', throughDay: '2026-07-16'
    });
    expect(data.daily).toEqual([]);
  });

  it('fills zeros only inside the covered portion of a partial range', async () => {
    const data = await loadDashboard(
      new FakeDatabase([]) as unknown as D1Database,
      '2026-07-09',
      '2026-07-10'
    );

    expect(data.coverage.state).toBe('partial');
    expect(data.daily).toEqual([expect.objectContaining({ day: '2026-07-10', calls: 0 })]);
  });

  it('fails closed on an inverted stored coverage interval', async () => {
    const data = await loadDashboard(
      new FakeDatabase([], {
        generatedAtMs: Date.parse('2026-07-16T07:00:00Z'),
        coveredFromMs: Date.parse('2026-07-16T00:00:00Z'),
        checkedThroughMs: Date.parse('2026-07-10T00:00:00Z'),
        dataRevision: 1
      }) as unknown as D1Database,
      '2026-07-12',
      '2026-07-12'
    );

    expect(data.coverage.state).toBe('unavailable');
    expect(data.daily).toEqual([]);
  });

  it('stops after filling the final supported calendar day', async () => {
    const finalDay = Date.parse('9999-12-31T12:00:00Z');
    const data = await loadDashboard(
      new FakeDatabase([], {
        generatedAtMs: finalDay,
        coveredFromMs: finalDay,
        checkedThroughMs: finalDay,
        dataRevision: 1
      }) as unknown as D1Database,
      '9999-12-31',
      '9999-12-31'
    );

    expect(data.daily).toEqual([expect.objectContaining({ day: '9999-12-31', calls: 0 })]);
  });
});
