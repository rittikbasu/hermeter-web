import { describe, expect, it, vi } from 'vitest';
import { fetchStatusVersion } from './status';

describe('fetchStatusVersion', () => {
  it('returns null when the status request rejects', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('offline'));

    await expect(fetchStatusVersion(fetcher as typeof fetch)).resolves.toBeNull();
  });

  it('returns a token that changes for analytics or heartbeat freshness', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ dataRevision: 7, checkedThroughMs: 11 }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    ));

    await expect(fetchStatusVersion(fetcher as typeof fetch)).resolves.toBe('7:11');
  });
});
