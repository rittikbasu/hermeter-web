export type DashboardData = {
  range: { from: string; to: string };
  summary: {
    calls: number;
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
    processedTokens: number;
    knownCostNanos: number;
    incompleteEvents: number;
    cacheRate: number;
  };
  daily: Array<Record<string, string | number>>;
  hourly: Array<Record<string, string | number>>;
  models: Array<Record<string, string | number>>;
  sources: Array<Record<string, string | number>>;
  sessions: Array<Record<string, string | number | null>>;
  status: {
    generatedAtMs: number;
    coveredFromMs: number;
    checkedThroughMs: number;
    dataRevision: number;
  };
  coverage: {
    state: 'complete' | 'partial' | 'unavailable';
    fromDay: string | null;
    throughDay: string | null;
  };
};

const RANGE = 'local_day >= ? AND local_day <= ?';

const SQL = [
  `SELECT
    COUNT(*) AS calls,
    COALESCE(SUM(input_tokens), 0) AS inputTokens,
    COALESCE(SUM(cached_input_tokens), 0) AS cachedInputTokens,
    COALESCE(SUM(output_tokens), 0) AS outputTokens,
    COALESCE(SUM(known_cost_nanos), 0) AS knownCostNanos,
    COALESCE(SUM(cost_status != 'complete'), 0) AS incompleteEvents
   FROM usage_events WHERE ${RANGE}`,
  `SELECT
    local_day AS day,
    COUNT(*) AS calls,
    SUM(input_tokens) AS inputTokens,
    SUM(cached_input_tokens) AS cachedInputTokens,
    SUM(output_tokens) AS outputTokens,
    SUM(known_cost_nanos) AS knownCostNanos,
    SUM(cost_status != 'complete') AS incompleteEvents
   FROM usage_events WHERE ${RANGE}
   GROUP BY local_day ORDER BY local_day`,
  `SELECT
    local_day AS day,
    local_hour AS hour,
    COUNT(*) AS calls,
    SUM(known_cost_nanos) AS knownCostNanos
   FROM usage_events WHERE ${RANGE}
   GROUP BY local_day, local_hour ORDER BY local_day, local_hour`,
  `SELECT
    provider,
    model,
    COUNT(*) AS calls,
    SUM(input_tokens + output_tokens) AS processedTokens,
    SUM(known_cost_nanos) AS knownCostNanos
   FROM usage_events WHERE ${RANGE}
   GROUP BY provider, model ORDER BY knownCostNanos DESC`,
  `SELECT
    source,
    COUNT(*) AS calls,
    SUM(input_tokens + output_tokens) AS processedTokens,
    SUM(known_cost_nanos) AS knownCostNanos
   FROM usage_events WHERE ${RANGE}
   GROUP BY source ORDER BY knownCostNanos DESC`,
  `SELECT
    e.session_key AS sessionKey,
    s.title AS title,
    MIN(e.source) AS source,
    COUNT(*) AS calls,
    SUM(e.known_cost_nanos) AS knownCostNanos
   FROM usage_events e
   LEFT JOIN sessions s ON s.session_key = e.session_key
   WHERE e.local_day >= ? AND e.local_day <= ?
   GROUP BY e.session_key, s.title
   ORDER BY knownCostNanos DESC LIMIT 20`,
  `SELECT generated_at_ms AS generatedAtMs,
          covered_from_ms AS coveredFromMs,
          checked_through_ms AS checkedThroughMs,
          data_revision AS dataRevision
   FROM sync_state WHERE singleton = 1`
];

function rowNumber(row: Record<string, unknown>, key: string): number {
  return Number(row[key] ?? 0);
}

function resultRows(result: D1Result): Array<Record<string, unknown>> {
  return (result.results ?? []) as Array<Record<string, unknown>>;
}

function numericRows(result: D1Result): Array<Record<string, string | number>> {
  return resultRows(result).map((row) => Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, typeof value === 'number' ? Number(value) : String(value)])
  ));
}

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

function nextDay(day: string): string {
  const value = new Date(`${day}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

function fillDaily(
  rows: Array<Record<string, string | number>>,
  from: string,
  to: string,
  coveredFromDay: string | null,
  throughDay: string | null
): Array<Record<string, string | number>> {
  if (
    !coveredFromDay || !throughDay || coveredFromDay > throughDay
    || to < coveredFromDay || from > throughDay
  ) return rows;
  const start = from > coveredFromDay ? from : coveredFromDay;
  const end = to < throughDay ? to : throughDay;
  const byDay = new Map(rows.map((row) => [String(row.day), row]));
  const output = rows.filter((row) => String(row.day) < start || String(row.day) > end);
  let day = start;
  while (true) {
    output.push(byDay.get(day) ?? {
      day, calls: 0, inputTokens: 0, cachedInputTokens: 0,
      outputTokens: 0, knownCostNanos: 0, incompleteEvents: 0
    });
    if (day === end) break;
    day = nextDay(day);
  }
  return output;
}

export async function loadDashboard(
  db: D1Database,
  from: string,
  to: string
): Promise<DashboardData> {
  const statements = SQL.map((sql, index) =>
    index === 6 ? db.prepare(sql) : db.prepare(sql).bind(from, to)
  );
  const [summaryResult, dailyResult, hourlyResult, modelResult, sourceResult, sessionResult, statusResult] =
    await db.batch(statements);

  const rawSummary = resultRows(summaryResult)[0] ?? {};
  const inputTokens = rowNumber(rawSummary, 'inputTokens');
  const cachedInputTokens = rowNumber(rawSummary, 'cachedInputTokens');
  const outputTokens = rowNumber(rawSummary, 'outputTokens');
  const rawStatus = resultRows(statusResult)[0] ?? {};
  const coveredFromMs = rowNumber(rawStatus, 'coveredFromMs');
  const checkedThroughMs = rowNumber(rawStatus, 'checkedThroughMs');
  const coveredFromDay = dayInKolkata(coveredFromMs);
  const throughDay = dayInKolkata(checkedThroughMs);
  const coverageState = !coveredFromDay || !throughDay || coveredFromDay > throughDay
    || to < coveredFromDay || from > throughDay
    ? 'unavailable'
    : from >= coveredFromDay && to < throughDay
      ? 'complete'
      : 'partial';
  const daily = fillDaily(numericRows(dailyResult), from, to, coveredFromDay, throughDay)
    .sort((left, right) => String(left.day).localeCompare(String(right.day)));

  return {
    range: { from, to },
    summary: {
      calls: rowNumber(rawSummary, 'calls'),
      inputTokens,
      cachedInputTokens,
      outputTokens,
      processedTokens: inputTokens + outputTokens,
      knownCostNanos: rowNumber(rawSummary, 'knownCostNanos'),
      incompleteEvents: rowNumber(rawSummary, 'incompleteEvents'),
      cacheRate: inputTokens ? (cachedInputTokens / inputTokens) * 100 : 0
    },
    daily,
    hourly: numericRows(hourlyResult),
    models: numericRows(modelResult),
    sources: numericRows(sourceResult),
    sessions: resultRows(sessionResult).map((row) => ({
      sessionKey: String(row.sessionKey ?? ''),
      title: row.title === null || row.title === undefined ? null : String(row.title),
      source: String(row.source ?? 'unknown'),
      calls: rowNumber(row, 'calls'),
      knownCostNanos: rowNumber(row, 'knownCostNanos')
    })),
    status: {
      generatedAtMs: rowNumber(rawStatus, 'generatedAtMs'),
      coveredFromMs,
      checkedThroughMs,
      dataRevision: rowNumber(rawStatus, 'dataRevision')
    },
    coverage: { state: coverageState, fromDay: coveredFromDay, throughDay }
  };
}
