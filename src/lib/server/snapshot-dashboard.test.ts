import { describe, expect, it } from 'vitest';
import { loadDashboardFromSnapshot, snapshotBounds } from './snapshot-dashboard';
import type { DashboardSnapshot } from './snapshot';

const snapshot: DashboardSnapshot = {
  schema: 'hermeter.snapshot.v1',
  dataRevision: 7,
  generatedAtMs: Date.parse('2026-07-16T07:00:00Z'),
  coveredFromMs: Date.parse('2026-07-09T18:30:00Z'),
  checkedThroughMs: Date.parse('2026-07-16T07:00:00Z'),
  sessions: [
    { sessionKey: 's_one', title: 'range calendar redesign' },
    { sessionKey: 's_two', title: null }
  ],
  buckets: [
    {
      day: '2026-07-15', hour: 12, provider: 'openai', model: 'gpt-5.6-sol',
      source: 'telegram', sessionKey: 's_one', calls: 2, inputTokens: 100,
      cachedInputTokens: 80, outputTokens: 10, knownCostNanos: 1000, incompleteEvents: 0,
      apiEquivalentEvents: 2
    },
    {
      day: '2026-07-16', hour: 12, provider: 'openai', model: 'gpt-5.6-sol',
      source: 'cli', sessionKey: 's_one', calls: 1, inputTokens: 20,
      cachedInputTokens: 10, outputTokens: 2, knownCostNanos: 500, incompleteEvents: 1
    },
    {
      day: '2026-07-16', hour: 1, provider: 'openai', model: 'gpt-image-2',
      source: 'desktop', sessionKey: 's_two', calls: 1, inputTokens: 0,
      cachedInputTokens: 0, outputTokens: 0, knownCostNanos: 2000, incompleteEvents: 0
    }
  ]
};

describe('loadDashboardFromSnapshot', () => {
  it('folds one complete sparse snapshot into the existing dashboard model', () => {
    const data = loadDashboardFromSnapshot(snapshot, '2026-07-14', '2026-07-16');

    expect(data.summary).toEqual({
      calls: 4,
      inputTokens: 120,
      cachedInputTokens: 90,
      outputTokens: 12,
      processedTokens: 132,
      knownCostNanos: 3500,
      incompleteEvents: 1,
      apiEquivalentEvents: 2,
      cacheRate: 75
    });
    expect(data.daily).toEqual([
      expect.objectContaining({ day: '2026-07-14', calls: 0 }),
      expect.objectContaining({ day: '2026-07-15', calls: 2, knownCostNanos: 1000 }),
      expect.objectContaining({ day: '2026-07-16', calls: 2, knownCostNanos: 2500 })
    ]);
    expect(data.hourly).toEqual([
      { hour: 1, calls: 1, knownCostNanos: 2000 },
      { hour: 12, calls: 3, knownCostNanos: 1500 }
    ]);
    expect(data.models).toEqual([
      { provider: 'openai', model: 'gpt-image-2', calls: 1, processedTokens: 0, knownCostNanos: 2000 },
      { provider: 'openai', model: 'gpt-5.6-sol', calls: 3, processedTokens: 132, knownCostNanos: 1500 }
    ]);
    expect(data.sources).toEqual([
      { source: 'desktop', calls: 1, processedTokens: 0, knownCostNanos: 2000 },
      { source: 'telegram', calls: 2, processedTokens: 110, knownCostNanos: 1000 },
      { source: 'cli', calls: 1, processedTokens: 22, knownCostNanos: 500 }
    ]);
    expect(data.sessions).toEqual([
      { label: 'gpt-image-2 · 16 jul', source: 'desktop', calls: 1, knownCostNanos: 2000 },
      { label: 'range calendar redesign', source: 'telegram', calls: 3, knownCostNanos: 1500 }
    ]);
    expect(data.status).toEqual({
      generatedAtMs: snapshot.generatedAtMs,
      coveredFromMs: snapshot.coveredFromMs,
      checkedThroughMs: snapshot.checkedThroughMs,
      dataRevision: snapshot.dataRevision
    });
    expect(data.coverage).toEqual({
      state: 'partial', fromDay: '2026-07-10', throughDay: '2026-07-16'
    });
  });

  it('does not synthesize zero usage outside measured coverage', () => {
    const data = loadDashboardFromSnapshot(snapshot, '2026-07-01', '2026-07-02');

    expect(data.daily).toEqual([]);
    expect(data.coverage.state).toBe('unavailable');
  });
});

describe('snapshotBounds', () => {
  it('combines event and coverage bounds without querying a database', () => {
    expect(snapshotBounds(snapshot, '2026-07-17')).toEqual({
      firstDay: '2026-07-10',
      lastDay: '2026-07-16'
    });
  });
});
