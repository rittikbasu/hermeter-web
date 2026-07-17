import { beforeEach, describe, expect, it, vi } from 'vitest';

const snapshotState = vi.hoisted(() => {
  class SnapshotUnavailableError extends Error {}
  return { SnapshotUnavailableError };
});
const orderedState = vi.hoisted(() => {
  class AuthoritativeSnapshotUnavailableError extends Error {}
  return {
    AuthoritativeSnapshotUnavailableError,
    D1SnapshotAuthorityPersistence: class {},
    loadVerifiedSnapshot: vi.fn()
  };
});
const dashboardState = vi.hoisted(() => ({ loadDashboard: vi.fn() }));

vi.mock('$lib/server/snapshot-store', () => snapshotState);
vi.mock('$lib/server/ordered-snapshot-store', () => orderedState);
vi.mock('$lib/server/dashboard', () => dashboardState);

import { load } from './+page.server';

class FakeDatabase {
  prepare() {
    return {
      async first() {
        return {
          firstDay: '2026-07-07',
          lastEventDay: '2026-07-16',
          coveredFromMs: Date.parse('2026-07-06T18:30:00Z'),
          checkedThroughMs: Date.parse('2026-07-16T18:29:59Z')
        };
      }
    };
  }
}

describe('dashboard page rollout fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dashboardState.loadDashboard.mockResolvedValue({ range: { from: '2026-07-15', to: '2026-07-16' } });
  });

  it('serves D1 when the KV snapshot has not been seeded', async () => {
    orderedState.loadVerifiedSnapshot.mockRejectedValue(new snapshotState.SnapshotUnavailableError());

    const result = await load({
      url: new URL('https://example.test/?from=2026-07-15&to=2026-07-16'),
      platform: {
        env: {
          SNAPSHOTS: {} as KVNamespace,
          DB: new FakeDatabase() as unknown as D1Database
        }
      },
      depends() {},
      setHeaders() {}
    } as never);

    expect(dashboardState.loadDashboard).toHaveBeenCalledWith(
      expect.anything(), '2026-07-15', '2026-07-16'
    );
    expect(result).toMatchObject({
      dashboard: { range: { from: '2026-07-15', to: '2026-07-16' } },
      bounds: { firstDay: '2026-07-07', lastDay: '2026-07-16' }
    });
  });

  it('does not hide a missing authoritative snapshot behind legacy D1 fallback', async () => {
    orderedState.loadVerifiedSnapshot.mockRejectedValue(
      new orderedState.AuthoritativeSnapshotUnavailableError()
    );

    await expect(load({
      url: new URL('https://example.test/'),
      platform: {
        env: {
          SNAPSHOTS: {} as KVNamespace,
          DB: new FakeDatabase() as unknown as D1Database
        }
      },
      depends() {},
      setHeaders() {}
    } as never)).rejects.toBeInstanceOf(orderedState.AuthoritativeSnapshotUnavailableError);
    expect(dashboardState.loadDashboard).not.toHaveBeenCalled();
  });
});
