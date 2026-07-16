import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { validateRange } from '$lib/date';
import { loadDashboard } from '$lib/server/dashboard';

export const GET: RequestHandler = async ({ url, platform }) => {
  if (!platform?.env.DB) return json({ error: 'database unavailable' }, { status: 503 });
  const range = validateRange(url.searchParams.get('from') ?? '', url.searchParams.get('to') ?? '');
  if (!range) return json({ error: 'invalid date range' }, { status: 400 });
  return json(await loadDashboard(platform.env.DB, range.from, range.to), {
    headers: { 'cache-control': 'private, no-store' }
  });
};
