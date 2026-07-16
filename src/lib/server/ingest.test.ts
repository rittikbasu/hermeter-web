import { describe, expect, it } from 'vitest';
import { MAX_EVENTS_PER_REQUEST, parseIngestPayload } from './ingest';

const event = {
  eventId: 'e_1234567890abcdefghijkl',
  occurredAtMs: 1784180714000,
  localDay: '2026-07-16',
  localHour: 12,
  kind: 'text',
  provider: 'openai',
  model: 'gpt-5.6-sol',
  source: 'telegram',
  sessionKey: 's_1234567890abcdefghijkl',
  inputTokens: 182340,
  cachedInputTokens: 171200,
  outputTokens: 2241,
  imageSize: null,
  imageQuality: null,
  knownCostNanos: 183421000,
  costStatus: 'complete',
  pricingConfidence: 'exact_from_usage',
  pricingVersion: 'pricelord:test'
};

const session = {
  sessionKey: 's_1234567890abcdefghijkl',
  title: null,
  firstSeenMs: 1784180714000,
  lastSeenMs: 1784180714000
};

describe('parseIngestPayload', () => {
  it('accepts a sanitized event batch', () => {
    const parsed = parseIngestPayload({
      schema: 'hermeter.ingest.v1',
      generatedAtMs: 1784181600000,
      coveredFromMs: 1783621800000,
      checkedThroughMs: 1784181600000,
      complete: true,
      sessions: [session],
      events: [event]
    });

    expect(parsed.events).toEqual([event]);
    expect(parsed.coveredFromMs).toBe(1783621800000);
    expect(parsed.complete).toBe(true);
  });

  it('accepts an empty heartbeat', () => {
    const parsed = parseIngestPayload({
      schema: 'hermeter.ingest.v1',
      generatedAtMs: 1784181600000,
      coveredFromMs: 1783621800000,
      checkedThroughMs: 1784181600000,
      complete: true,
      sessions: [],
      events: []
    });

    expect(parsed.events).toEqual([]);
  });

  it('rejects secret-bearing or unknown event fields', () => {
    expect(() => parseIngestPayload({
      schema: 'hermeter.ingest.v1',
      generatedAtMs: 1784181600000,
      coveredFromMs: 1783621800000,
      checkedThroughMs: 1784181600000,
      complete: true,
      sessions: [session],
      events: [{ ...event, prompt: 'must never be accepted' }]
    })).toThrow(/unknown event field/i);
  });

  it('rejects raw source identifiers at the privacy boundary', () => {
    expect(() => parseIngestPayload({
      schema: 'hermeter.ingest.v1',
      generatedAtMs: 1784181600000,
      coveredFromMs: 1783621800000,
      checkedThroughMs: 1784181600000,
      complete: true,
      sessions: [session],
      events: [{ ...event, source: 'telegram:raw-chat-id-123' }]
    })).toThrow(/invalid source/i);
  });

  it('accepts bounded session titles selected for public display', () => {
    const parsed = parseIngestPayload({
      schema: 'hermeter.ingest.v1',
      generatedAtMs: 1784181600000,
      coveredFromMs: 1783621800000,
      checkedThroughMs: 1784181600000,
      complete: true,
      sessions: [{ ...session, title: 'range calendar redesign' }],
      events: [event]
    });

    expect(parsed.sessions[0].title).toBe('range calendar redesign');
  });

  it('normalizes title whitespace and uses the producer UTF-16 limit', () => {
    const parseTitle = (title: string) => parseIngestPayload({
      schema: 'hermeter.ingest.v1',
      generatedAtMs: 1784181600000,
      coveredFromMs: 1783621800000,
      checkedThroughMs: 1784181600000,
      complete: true,
      sessions: [{ ...session, title }],
      events: [event]
    }).sessions[0].title;

    expect(parseTitle('  range\n calendar\tredesign  ')).toBe('range calendar redesign');
    expect(parseTitle('😀'.repeat(80))).toBe('😀'.repeat(80));
    expect(() => parseTitle('😀'.repeat(81))).toThrow(/160 characters/i);
    expect(() => parseTitle(' \n\t ')).toThrow(/non-empty/i);
  });

  it('rejects secret-bearing session titles at the publication boundary', () => {
    for (const title of [
      '/home/alice/.env credential=do-not-export',
      'inspect(`/home/alice/private/key.pem`)',
      'inspect /root/.ssh/id_rsa',
      'fetch ftp://private.example/secret',
      'password is do-not-publish',
      'Bearer abcdefghijklmnop',
      '-----BEGIN PRIVATE KEY-----',
      '-----BEGIN ENCRYPTED PRIVATE KEY-----',
      'aaaa.bbbbbbbbbbbb.cccccccccccc'
    ]) {
      expect(() => parseIngestPayload({
        schema: 'hermeter.ingest.v1',
        generatedAtMs: 1784181600000,
        coveredFromMs: 1783621800000,
        checkedThroughMs: 1784181600000,
        complete: true,
        sessions: [{ ...session, title }],
        events: [event]
      })).toThrow(/unsafe session title/i);
    }
  });

  it('rejects timestamps that roll beyond the local four-digit calendar', () => {
    expect(() => parseIngestPayload({
      schema: 'hermeter.ingest.v1',
      generatedAtMs: 253402300799999,
      coveredFromMs: 253402300799999,
      checkedThroughMs: 253402300799999,
      complete: true,
      sessions: [],
      events: []
    })).toThrow(/timestamp/i);
  });

  it('rejects timestamps outside the dashboard date domain', () => {
    expect(() => parseIngestPayload({
      schema: 'hermeter.ingest.v1',
      generatedAtMs: Number.MAX_SAFE_INTEGER,
      coveredFromMs: Number.MAX_SAFE_INTEGER,
      checkedThroughMs: Number.MAX_SAFE_INTEGER,
      complete: true,
      sessions: [],
      events: []
    })).toThrow(/timestamp/i);
  });

  it('rejects oversized event batches', () => {
    expect(MAX_EVENTS_PER_REQUEST).toBe(24);
    expect(() => parseIngestPayload({
      schema: 'hermeter.ingest.v1',
      generatedAtMs: 1784181600000,
      coveredFromMs: 1783621800000,
      checkedThroughMs: 1784181600000,
      complete: false,
      sessions: [],
      events: Array.from({ length: 25 }, (_, index) => ({
        ...event,
        eventId: `e_${String(index).padStart(22, '0')}`
      }))
    })).toThrow(/at most 24/i);
  });
});
