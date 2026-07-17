import { describe, expect, it } from 'vitest';
import { buildDashboardPageData } from './page-data';
import type { DashboardSnapshot } from './snapshot';

const snapshot: DashboardSnapshot = {
  schema: 'hermeter.snapshot.v1',
  dataRevision: 7,
  generatedAtMs: Date.parse('2026-07-16T07:00:00Z'),
  coveredFromMs: Date.parse('2026-07-09T18:30:00Z'),
  checkedThroughMs: Date.parse('2026-07-16T07:00:00Z'),
  sessions: [{ sessionKey: 's_one', title: null }],
  buckets: [{
    day: '2026-07-16', hour: 12, provider: 'openai', model: 'gpt-5.6-sol',
    source: 'telegram', sessionKey: 's_one', calls: 1, inputTokens: 10,
    cachedInputTokens: 5, outputTokens: 1, knownCostNanos: 100, incompleteEvents: 0
  }]
};

describe('buildDashboardPageData', () => {
  it('defaults to seven days ending at the measured bound', () => {
    const data = buildDashboardPageData(snapshot, new URLSearchParams(), '2026-07-17');

    expect(data.bounds).toEqual({ firstDay: '2026-07-10', lastDay: '2026-07-16' });
    expect(data.dashboard.range).toEqual({ from: '2026-07-10', to: '2026-07-16' });
  });

  it('preserves a valid requested custom range', () => {
    const data = buildDashboardPageData(
      snapshot,
      new URLSearchParams('from=2026-07-15&to=2026-07-16'),
      '2026-07-17'
    );

    expect(data.dashboard.range).toEqual({ from: '2026-07-15', to: '2026-07-16' });
  });
});
