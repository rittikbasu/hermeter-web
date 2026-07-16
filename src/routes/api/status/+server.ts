import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ platform }) => {
  if (!platform?.env.DB) return json({ error: 'database unavailable' }, { status: 503 });
  const status = await platform.env.DB.prepare(`
    SELECT generated_at_ms AS generatedAtMs,
           covered_from_ms AS coveredFromMs,
           checked_through_ms AS checkedThroughMs,
           data_revision AS dataRevision
    FROM sync_state WHERE singleton = 1
  `).first();
  return json(status ?? { generatedAtMs: 0, coveredFromMs: 0, checkedThroughMs: 0, dataRevision: 0 }, {
    headers: { 'cache-control': 'private, no-store' }
  });
};
