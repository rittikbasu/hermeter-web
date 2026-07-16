import { describe, expect, it, vi } from 'vitest';
import { fetchStatusRevision } from './status';

describe('fetchStatusRevision', () => {
  it('returns null when the status request rejects', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('offline'));

    await expect(fetchStatusRevision(fetcher as typeof fetch)).resolves.toBeNull();
  });

  it('returns the numeric data revision from a successful response', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ dataRevision: 7 }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    ));

    await expect(fetchStatusRevision(fetcher as typeof fetch)).resolves.toBe(7);
  });
});
