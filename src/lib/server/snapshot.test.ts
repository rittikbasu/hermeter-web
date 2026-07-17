import { describe, expect, it } from 'vitest';
import { parseHeartbeat, parseSnapshot } from './snapshot';

const session = {
  sessionKey: 's_1234567890abcdefghijkl',
  title: 'range calendar redesign'
};

const bucket = {
  day: '2026-07-16',
  hour: 11,
  provider: 'openai',
  model: 'gpt-5.6-sol',
  source: 'telegram',
  sessionKey: session.sessionKey,
  calls: 2,
  inputTokens: 150,
  cachedInputTokens: 100,
  outputTokens: 15,
  knownCostNanos: 1_500,
  incompleteEvents: 1
};

function validSnapshot() {
  return {
    schema: 'hermeter.snapshot.v1',
    dataRevision: 7,
    generatedAtMs: 1784181600000,
    coveredFromMs: 1783621800000,
    checkedThroughMs: 1784181600000,
    sessions: [session],
    buckets: [bucket]
  };
}

describe('parseSnapshot', () => {
  it('accepts one complete sanitized aggregate snapshot', () => {
    expect(parseSnapshot(validSnapshot())).toEqual(validSnapshot());
  });

  it('rejects raw event and unknown fields', () => {
    expect(() => parseSnapshot({
      ...validSnapshot(),
      buckets: [{ ...bucket, eventId: 'e_must_not_reach_cloud' }]
    })).toThrow(/unknown bucket field/i);
  });

  it('rejects duplicate sessions and aggregate buckets', () => {
    expect(() => parseSnapshot({
      ...validSnapshot(),
      sessions: [session, session]
    })).toThrow(/duplicate session/i);
    expect(() => parseSnapshot({
      ...validSnapshot(),
      buckets: [bucket, bucket]
    })).toThrow(/duplicate bucket/i);
  });

  it('requires every bucket to reference a declared session', () => {
    expect(() => parseSnapshot({
      ...validSnapshot(),
      sessions: []
    })).toThrow(/undeclared session/i);
  });

  it('rejects impossible aggregate measures', () => {
    expect(() => parseSnapshot({
      ...validSnapshot(),
      buckets: [{ ...bucket, calls: 0 }]
    })).toThrow(/calls/i);
    expect(() => parseSnapshot({
      ...validSnapshot(),
      buckets: [{ ...bucket, cachedInputTokens: 151 }]
    })).toThrow(/cachedInputTokens exceeds inputTokens/i);
    expect(() => parseSnapshot({
      ...validSnapshot(),
      buckets: [{ ...bucket, incompleteEvents: 3 }]
    })).toThrow(/incompleteEvents exceeds calls/i);
  });

  it('rejects secret-bearing session titles at the snapshot boundary', () => {
    for (const title of [
      '/home/alice/.env credential=private',
      'visit www.internal.example/users/alice',
      'visit api.openai.com',
      'inspect //server/share',
      'inspect \\\\server\\users\\alice\\secret.txt'
    ]) {
      expect(() => parseSnapshot({
        ...validSnapshot(),
        sessions: [{ ...session, title }]
      })).toThrow(/unsafe session title/i);
    }
  });

  it('rejects invalid coverage and calendar values', () => {
    expect(() => parseSnapshot({
      ...validSnapshot(),
      coveredFromMs: 1784181600001
    })).toThrow(/coveredFromMs exceeds checkedThroughMs/i);
    expect(() => parseSnapshot({
      ...validSnapshot(),
      buckets: [{ ...bucket, day: '2026-02-30' }]
    })).toThrow(/invalid day/i);
    expect(() => parseSnapshot({
      ...validSnapshot(),
      coveredFromMs: Date.UTC(2026, 6, 17),
      checkedThroughMs: Date.UTC(2026, 6, 17, 12),
      generatedAtMs: Date.UTC(2026, 6, 17, 12),
      buckets: [{ ...bucket, day: '2026-07-16' }]
    })).toThrow(/outside snapshot coverage/i);
  });

  it('rejects buckets whose hour is outside the exact coverage interval', () => {
    expect(() => parseSnapshot({
      ...validSnapshot(),
      generatedAtMs: Date.parse('2026-07-17T06:30:00Z'),
      coveredFromMs: Date.parse('2026-07-16T18:30:00Z'),
      checkedThroughMs: Date.parse('2026-07-17T06:30:00Z'),
      buckets: [{ ...bucket, day: '2026-07-17', hour: 23 }]
    })).toThrow(/outside snapshot coverage/i);
  });

  it('rejects credential-shaped provider and model labels', () => {
    expect(() => parseSnapshot({
      ...validSnapshot(),
      buckets: [{ ...bucket, model: 'sk-abcdefghijklmnop' }]
    })).toThrow(/unsafe model/i);
    expect(() => parseSnapshot({
      ...validSnapshot(),
      buckets: [{ ...bucket, provider: 'api_key=legacy-secret' }]
    })).toThrow(/unsafe provider/i);
    expect(() => parseSnapshot({
      ...validSnapshot(),
      buckets: [{ ...bucket, model: 'OPENAI_API_KEY=legacy-secret' }]
    })).toThrow(/unsafe model/i);
    expect(() => parseSnapshot({
      ...validSnapshot(),
      buckets: [{ ...bucket, provider: 'www.internal.example/users/alice' }]
    })).toThrow(/unsafe provider/i);
    expect(() => parseSnapshot({
      ...validSnapshot(),
      buckets: [{ ...bucket, model: '\\\\server\\users\\alice\\secret.txt' }]
    })).toThrow(/unsafe model/i);
    expect(() => parseSnapshot({
      ...validSnapshot(),
      buckets: [{ ...bucket, provider: 'api.openai.com' }]
    })).toThrow(/unsafe provider/i);
    expect(() => parseSnapshot({
      ...validSnapshot(),
      buckets: [{ ...bucket, model: 'internal.corp' }]
    })).toThrow(/unsafe model/i);
  });

  it('rejects aggregate totals that exceed JavaScript safe integers', () => {
    expect(() => parseSnapshot({
      ...validSnapshot(),
      generatedAtMs: Date.parse('2026-07-16T18:29:59Z'),
      checkedThroughMs: Date.parse('2026-07-16T18:29:59Z'),
      buckets: [
        { ...bucket, knownCostNanos: Number.MAX_SAFE_INTEGER },
        { ...bucket, hour: 13, knownCostNanos: 2 }
      ]
    })).toThrow(/aggregate knownCostNanos/i);
  });

  it('bounds aggregate collection sizes before parsing entries', () => {
    expect(() => parseSnapshot({
      ...validSnapshot(),
      sessions: new Array(10_001).fill(session),
      buckets: []
    })).toThrow(/too many sessions/i);
    expect(() => parseSnapshot({
      ...validSnapshot(),
      sessions: [session],
      buckets: new Array(100_001).fill(bucket)
    })).toThrow(/too many buckets/i);
  });

  it('strictly validates small heartbeat payloads', () => {
    expect(parseHeartbeat({
      schema: 'hermeter.heartbeat.v1',
      generatedAtMs: 300,
      checkedThroughMs: 250,
      dataRevision: 7
    })).toEqual({
      schema: 'hermeter.heartbeat.v1',
      generatedAtMs: 300,
      checkedThroughMs: 250,
      dataRevision: 7
    });
    expect(() => parseHeartbeat({
      schema: 'hermeter.heartbeat.v1', generatedAtMs: 300,
      checkedThroughMs: 250, dataRevision: 7, extra: true
    })).toThrow(/unknown heartbeat field/i);
  });
});
