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
      checkedThroughMs: 1784181600000,
      complete: true,
      sessions: [session],
      events: [event]
    });

    expect(parsed.events).toEqual([event]);
    expect(parsed.complete).toBe(true);
  });

  it('accepts an empty heartbeat', () => {
    const parsed = parseIngestPayload({
      schema: 'hermeter.ingest.v1',
      generatedAtMs: 1784181600000,
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
      checkedThroughMs: 1784181600000,
      complete: true,
      sessions: [session],
      events: [{ ...event, source: 'telegram:raw-chat-id-123' }]
    })).toThrow(/invalid source/i);
  });

  it('rejects session titles at the privacy boundary', () => {
    expect(() => parseIngestPayload({
      schema: 'hermeter.ingest.v1',
      generatedAtMs: 1784181600000,
      checkedThroughMs: 1784181600000,
      complete: true,
      sessions: [{ ...session, title: '/home/alice/.env credential=do-not-export' }],
      events: [event]
    })).toThrow(/title must be null/i);
  });

  it('rejects oversized event batches', () => {
    expect(MAX_EVENTS_PER_REQUEST).toBe(24);
    expect(() => parseIngestPayload({
      schema: 'hermeter.ingest.v1',
      generatedAtMs: 1784181600000,
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
