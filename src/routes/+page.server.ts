import type { PageServerLoad } from './$types';
import { presetRange, validateRange } from '$lib/date';
import { loadDashboard } from '$lib/server/dashboard';

function dayInKolkata(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(value);
  const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${fields.year}-${fields.month}-${fields.day}`;
}

export const load: PageServerLoad = async ({ url, platform, depends, setHeaders }) => {
  depends('hermeter:dashboard');
  setHeaders({ 'cache-control': 'private, no-store' });
  if (!platform?.env.DB) throw new Error('D1 binding is unavailable');

  const bounds = await platform.env.DB.prepare(`
    SELECT
      MIN(local_day) AS firstDay,
      MAX(local_day) AS lastEventDay,
      (SELECT checked_through_ms FROM sync_state WHERE singleton = 1) AS checkedThroughMs
    FROM usage_events
  `).first<{ firstDay: string | null; lastEventDay: string | null; checkedThroughMs: number | null }>();
  const coveredDay = bounds?.checkedThroughMs
    ? dayInKolkata(new Date(bounds.checkedThroughMs))
    : null;
  const lastDay = [bounds?.lastEventDay, coveredDay]
    .filter((day): day is string => Boolean(day))
    .sort()
    .at(-1) ?? dayInKolkata(new Date());
  const requested = validateRange(
    url.searchParams.get('from') ?? '',
    url.searchParams.get('to') ?? ''
  );
  const range = requested ?? presetRange('7d', lastDay);

  return {
    dashboard: await loadDashboard(platform.env.DB, range.from, range.to),
    bounds: {
      firstDay: bounds?.firstDay ?? lastDay,
      lastDay
    }
  };
};
