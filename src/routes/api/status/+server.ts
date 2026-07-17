import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  D1SnapshotAuthorityPersistence,
  loadVerifiedSnapshotMetadata
} from '$lib/server/ordered-snapshot-store';

export const GET: RequestHandler = async ({ platform }) => {
  if (!platform?.env.SNAPSHOTS || !platform.env.DB) {
    return json({ error: 'snapshot store unavailable' }, { status: 503 });
  }
  try {
    const status = await loadVerifiedSnapshotMetadata(
      new D1SnapshotAuthorityPersistence(platform.env.DB),
      platform.env.SNAPSHOTS
    );
    return json(status, {
      headers: { 'cache-control': 'private, no-store' }
    });
  } catch {
    return json({ error: 'status temporarily unavailable' }, { status: 503 });
  }
};
