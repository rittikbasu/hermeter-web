import { describe, expect, it } from 'vitest';
import { loadDashboard } from './dashboard';

class FakeStatement {
  constructor(readonly sql: string, readonly args: unknown[] = []) {}
  bind(...args: unknown[]) { return new FakeStatement(this.sql, args); }
}

class FakeDatabase {
  prepare(sql: string) { return new FakeStatement(sql); }
  async batch(statements: FakeStatement[]) {
    expect(statements).toHaveLength(7);
    return [
      { results: [{ calls: 2, inputTokens: 100, cachedInputTokens: 80, outputTokens: 10, knownCostNanos: 123000000, incompleteEvents: 1 }] },
      { results: [{ day: '2026-07-16', calls: 2, inputTokens: 100, cachedInputTokens: 80, outputTokens: 10, knownCostNanos: 123000000, incompleteEvents: 1 }] },
      { results: [{ day: '2026-07-16', hour: 12, calls: 2, knownCostNanos: 123000000 }] },
      { results: [{ provider: 'openai', model: 'gpt-5.6-sol', calls: 2, processedTokens: 110, knownCostNanos: 123000000 }] },
      { results: [{ source: 'telegram', calls: 2, processedTokens: 110, knownCostNanos: 123000000 }] },
      { results: [{ sessionKey: 's_x', title: 'dashboard', source: 'telegram', calls: 2, knownCostNanos: 123000000 }] },
      { results: [{ generatedAtMs: Date.parse('2026-07-16T07:00:00Z'), checkedThroughMs: Date.parse('2026-07-16T07:00:00Z'), dataRevision: 3 }] }
    ];
  }
}

describe('loadDashboard', () => {
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
    expect(data.sessions[0].title).toBe('dashboard');
    expect(data.status).toEqual({
      generatedAtMs: Date.parse('2026-07-16T07:00:00Z'),
      checkedThroughMs: Date.parse('2026-07-16T07:00:00Z'),
      dataRevision: 3
    });
    expect(data.coverage).toEqual({ state: 'partial', throughDay: '2026-07-16' });
  });
});
