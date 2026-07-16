import { describe, expect, it } from 'vitest';
import { POST } from './+server';

function validPayload() {
  const now = Date.now();
  return {
    schema: 'hermeter.ingest.v1',
    generatedAtMs: now,
    coveredFromMs: now - 1_000,
    checkedThroughMs: now,
    complete: true,
    sessions: [],
    events: []
  };
}

describe('POST /api/ingest', () => {
  it('keeps malformed producer input as a client error', async () => {
    const request = new Request('http://localhost/api/ingest', {
      method: 'POST',
      body: '{not json'
    });

    const response = await POST({
      request,
      platform: { env: { DB: {} } }
    } as never);

    expect(response.status).toBe(400);
  });

  it('returns a generic service error when D1 fails', async () => {
    const request = new Request('http://localhost/api/ingest', {
      method: 'POST',
      body: JSON.stringify(validPayload())
    });
    const platform = {
      env: {
        DB: {
          prepare() {
            throw new Error('private D1 failure details');
          }
        }
      }
    };

    const response = await POST({ request, platform } as never);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'ingest temporarily unavailable' });
  });
});
