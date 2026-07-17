import { presetRange, validateRange } from '$lib/date';
import { loadDashboardFromSnapshot, snapshotBounds } from './snapshot-dashboard';
import type { DashboardSnapshot } from './snapshot';

export function buildDashboardPageData(
  snapshot: DashboardSnapshot,
  search: URLSearchParams,
  today: string
) {
  const bounds = snapshotBounds(snapshot, today);
  const requested = validateRange(search.get('from') ?? '', search.get('to') ?? '');
  const range = requested ?? presetRange('7d', bounds.lastDay);
  return {
    dashboard: loadDashboardFromSnapshot(snapshot, range.from, range.to),
    bounds
  };
}
