import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { validateRange } from '$lib/date';
import {
  D1SnapshotAuthorityPersistence,
  loadVerifiedSnapshot
} from '$lib/server/ordered-snapshot-store';
import { loadDashboardFromSnapshot } from '$lib/server/snapshot-dashboard';

export const GET: RequestHandler = async ({ url, platform }) => {
  if (!platform?.env.SNAPSHOTS || !platform.env.DB) {
    return json({ error: 'snapshot store unavailable' }, { status: 503 });
  }
  const range = validateRange(url.searchParams.get('from') ?? '', url.searchParams.get('to') ?? '');
  if (!range) return json({ error: 'invalid date range' }, { status: 400 });
  try {
    const snapshot = await loadVerifiedSnapshot(
      new D1SnapshotAuthorityPersistence(platform.env.DB),
      platform.env.SNAPSHOTS
    );
    return json(loadDashboardFromSnapshot(snapshot, range.from, range.to), {
      headers: { 'cache-control': 'private, no-store' }
    });
  } catch {
    return json({ error: 'dashboard temporarily unavailable' }, { status: 503 });
  }
};
