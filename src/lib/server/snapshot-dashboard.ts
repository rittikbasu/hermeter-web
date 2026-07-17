import type { DashboardData } from './dashboard';
import type { DashboardSnapshot, SnapshotBucket } from './snapshot';

function dayInKolkata(milliseconds: number): string | null {
  if (!milliseconds || !Number.isFinite(milliseconds)) return null;
  const date = new Date(milliseconds);
  if (Number.isNaN(date.valueOf())) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    return null;
  }
}

function shortSessionDate(day: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return 'unknown date';
  const month = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'][
    Number(day.slice(5, 7)) - 1
  ];
  return `${Number(day.slice(8, 10))} ${month}`;
}

function sessionDisplayTitle(title: string, primaryModel: string, firstDay: string): string {
  const cleaned = title
    .replace(/\bsubagent\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s·|—–-]+|[\s·|—–-]+$/g, '')
    .trim();
  return cleaned || `${primaryModel} · ${shortSessionDate(firstDay)}`;
}

function nextDay(day: string): string {
  const value = new Date(`${day}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

type Totals = {
  calls: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  knownCostNanos: number;
  incompleteEvents: number;
};

function emptyTotals(): Totals {
  return {
    calls: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0,
    knownCostNanos: 0, incompleteEvents: 0
  };
}

function addTotals(target: Totals, bucket: SnapshotBucket): void {
  target.calls += bucket.calls;
  target.inputTokens += bucket.inputTokens;
  target.cachedInputTokens += bucket.cachedInputTokens;
  target.outputTokens += bucket.outputTokens;
  target.knownCostNanos += bucket.knownCostNanos;
  target.incompleteEvents += bucket.incompleteEvents;
}

type RankedCount = { calls: number; knownCostNanos: number };
type SessionTotal = Totals & {
  firstDay: string;
  sources: Map<string, RankedCount>;
  models: Map<string, RankedCount>;
};

function addRanked(map: Map<string, RankedCount>, key: string, bucket: SnapshotBucket): void {
  const value = map.get(key) ?? { calls: 0, knownCostNanos: 0 };
  value.calls += bucket.calls;
  value.knownCostNanos += bucket.knownCostNanos;
  map.set(key, value);
}

function primarySource(values: Map<string, RankedCount>): string {
  return [...values.entries()].sort((left, right) =>
    right[1].calls - left[1].calls
    || right[1].knownCostNanos - left[1].knownCostNanos
    || left[0].localeCompare(right[0])
  )[0]?.[0] ?? 'unknown';
}

function primaryModel(values: Map<string, RankedCount>): string {
  return [...values.entries()].sort((left, right) =>
    right[1].knownCostNanos - left[1].knownCostNanos
    || right[1].calls - left[1].calls
    || left[0].localeCompare(right[0])
  )[0]?.[0] ?? 'unknown model';
}

function filledDaily(
  daily: Map<string, Totals>,
  from: string,
  to: string,
  coveredFromDay: string | null,
  throughDay: string | null
): Array<Record<string, string | number>> {
  if (
    !coveredFromDay || !throughDay || coveredFromDay > throughDay
    || to < coveredFromDay || from > throughDay
  ) return [];
  const start = from > coveredFromDay ? from : coveredFromDay;
  const end = to < throughDay ? to : throughDay;
  const output: Array<Record<string, string | number>> = [];
  let day = start;
  while (true) {
    output.push({ day, ...(daily.get(day) ?? emptyTotals()) });
    if (day === end) break;
    day = nextDay(day);
  }
  return output;
}

export function loadDashboardFromSnapshot(
  snapshot: DashboardSnapshot,
  from: string,
  to: string
): DashboardData {
  const buckets = snapshot.buckets.filter((bucket) => bucket.day >= from && bucket.day <= to);
  const summary = emptyTotals();
  const daily = new Map<string, Totals>();
  const hourly = new Map<number, { calls: number; knownCostNanos: number }>();
  const models = new Map<string, { provider: string; model: string; calls: number; processedTokens: number; knownCostNanos: number }>();
  const sources = new Map<string, { source: string; calls: number; processedTokens: number; knownCostNanos: number }>();
  const sessions = new Map<string, SessionTotal>();

  for (const bucket of buckets) {
    addTotals(summary, bucket);

    const day = daily.get(bucket.day) ?? emptyTotals();
    addTotals(day, bucket);
    daily.set(bucket.day, day);

    const hour = hourly.get(bucket.hour) ?? { calls: 0, knownCostNanos: 0 };
    hour.calls += bucket.calls;
    hour.knownCostNanos += bucket.knownCostNanos;
    hourly.set(bucket.hour, hour);

    const modelKey = JSON.stringify([bucket.provider, bucket.model]);
    const model = models.get(modelKey) ?? {
      provider: bucket.provider, model: bucket.model, calls: 0, processedTokens: 0, knownCostNanos: 0
    };
    model.calls += bucket.calls;
    model.processedTokens += bucket.inputTokens + bucket.outputTokens;
    model.knownCostNanos += bucket.knownCostNanos;
    models.set(modelKey, model);

    const source = sources.get(bucket.source) ?? {
      source: bucket.source, calls: 0, processedTokens: 0, knownCostNanos: 0
    };
    source.calls += bucket.calls;
    source.processedTokens += bucket.inputTokens + bucket.outputTokens;
    source.knownCostNanos += bucket.knownCostNanos;
    sources.set(bucket.source, source);

    const session = sessions.get(bucket.sessionKey) ?? {
      ...emptyTotals(), firstDay: bucket.day,
      sources: new Map<string, RankedCount>(), models: new Map<string, RankedCount>()
    };
    addTotals(session, bucket);
    if (bucket.day < session.firstDay) session.firstDay = bucket.day;
    addRanked(session.sources, bucket.source, bucket);
    addRanked(session.models, bucket.model, bucket);
    sessions.set(bucket.sessionKey, session);
  }

  const coveredFromDay = dayInKolkata(snapshot.coveredFromMs);
  const throughDay = dayInKolkata(snapshot.checkedThroughMs);
  const coverageState = !coveredFromDay || !throughDay || coveredFromDay > throughDay
    || to < coveredFromDay || from > throughDay
    ? 'unavailable'
    : from >= coveredFromDay && to < throughDay
      ? 'complete'
      : 'partial';
  const titles = new Map(snapshot.sessions.map((session) => [session.sessionKey, session.title]));

  return {
    range: { from, to },
    summary: {
      ...summary,
      processedTokens: summary.inputTokens + summary.outputTokens,
      cacheRate: summary.inputTokens ? (summary.cachedInputTokens / summary.inputTokens) * 100 : 0
    },
    daily: filledDaily(daily, from, to, coveredFromDay, throughDay),
    hourly: [...hourly.entries()]
      .sort((left, right) => left[0] - right[0])
      .map(([hour, value]) => ({ hour, ...value })),
    models: [...models.values()].sort((left, right) =>
      right.knownCostNanos - left.knownCostNanos || left.model.localeCompare(right.model)
    ),
    sources: [...sources.values()].sort((left, right) =>
      right.knownCostNanos - left.knownCostNanos || left.source.localeCompare(right.source)
    ),
    sessions: [...sessions.entries()]
      .sort((left, right) => right[1].knownCostNanos - left[1].knownCostNanos || left[0].localeCompare(right[0]))
      .slice(0, 20)
      .map(([sessionKey, value]) => {
        const model = primaryModel(value.models);
        return {
          label: sessionDisplayTitle(titles.get(sessionKey) ?? '', model, value.firstDay),
          source: primarySource(value.sources),
          calls: value.calls,
          knownCostNanos: value.knownCostNanos
        };
      }),
    status: {
      generatedAtMs: snapshot.generatedAtMs,
      coveredFromMs: snapshot.coveredFromMs,
      checkedThroughMs: snapshot.checkedThroughMs,
      dataRevision: snapshot.dataRevision
    },
    coverage: { state: coverageState, fromDay: coveredFromDay, throughDay }
  };
}

export function snapshotBounds(
  snapshot: DashboardSnapshot,
  fallbackDay: string
): { firstDay: string; lastDay: string } {
  const eventDays = snapshot.buckets.map((bucket) => bucket.day);
  const coveredFromDay = dayInKolkata(snapshot.coveredFromMs);
  const throughDay = dayInKolkata(snapshot.checkedThroughMs);
  const firstDay = [...eventDays, coveredFromDay]
    .filter((day): day is string => Boolean(day))
    .sort()[0] ?? fallbackDay;
  const lastDay = [...eventDays, throughDay]
    .filter((day): day is string => Boolean(day))
    .sort()
    .at(-1) ?? fallbackDay;
  return { firstDay, lastDay };
}
