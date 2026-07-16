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
  `WITH filtered AS (
     SELECT session_key, source, model, local_day, known_cost_nanos
     FROM usage_events WHERE ${RANGE}
   ),
   session_totals AS (
     SELECT session_key AS sessionKey,
            MIN(local_day) AS firstDay,
            COUNT(*) AS calls,
            SUM(known_cost_nanos) AS knownCostNanos
     FROM filtered GROUP BY session_key
   ),
   ranked_sources AS (
     SELECT session_key,
            source,
            ROW_NUMBER() OVER (
              PARTITION BY session_key
              ORDER BY COUNT(*) DESC, SUM(known_cost_nanos) DESC, source
            ) AS sourceRank
     FROM filtered GROUP BY session_key, source
   ),
   ranked_models AS (
     SELECT session_key,
            model,
            ROW_NUMBER() OVER (
              PARTITION BY session_key
              ORDER BY SUM(known_cost_nanos) DESC, COUNT(*) DESC, model
            ) AS modelRank
     FROM filtered GROUP BY session_key, model
   )
   SELECT totals.sessionKey,
          ranked_source.source,
          ranked.model AS primaryModel,
          totals.firstDay,
          totals.calls,
          totals.knownCostNanos
   FROM session_totals totals
   JOIN ranked_sources ranked_source
     ON ranked_source.session_key = totals.sessionKey AND ranked_source.sourceRank = 1
   JOIN ranked_models ranked
     ON ranked.session_key = totals.sessionKey AND ranked.modelRank = 1
   ORDER BY totals.knownCostNanos DESC, totals.sessionKey
   LIMIT 20`,
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

const SESSION_WORDS = [
  'ash', 'birch', 'cedar', 'clover', 'comet', 'coral', 'ember', 'fern',
  'flint', 'grove', 'harbor', 'iris', 'juniper', 'kite', 'lotus', 'maple',
  'moss', 'nova', 'olive', 'orbit', 'pine', 'reed', 'river', 'willow'
] as const;

function digestCode(bytes: Uint8Array, length: number): string {
  let value = 0n;
  for (const byte of bytes.slice(0, length)) value = (value << 8n) | BigInt(byte);
  return value.toString(36).padStart(Math.ceil(length * 8 / Math.log2(36)), '0');
}

async function sessionAliasParts(sessionKey: string): Promise<{ short: string; full: string }> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sessionKey)));
  const first = SESSION_WORDS[digest[8] % SESSION_WORDS.length];
  const second = SESSION_WORDS[digest[9] % SESSION_WORDS.length];
  const prefix = `session ${first}-${second}-`;
  return { short: `${prefix}${digestCode(digest, 8)}`, full: `${prefix}${digestCode(digest, 16)}` };
}

export async function sessionAlias(sessionKey: string): Promise<string> {
  return (await sessionAliasParts(sessionKey)).short;
}

function shortSessionDate(day: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return 'unknown date';
  const month = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'][
    Number(day.slice(5, 7)) - 1
  ];
  return `${Number(day.slice(8, 10))} ${month}`;
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
  const rawSessions = await Promise.all(resultRows(sessionResult).map(async (row) => {
    const sessionKey = String(row.sessionKey ?? '');
    const source = String(row.source ?? 'unknown');
    const primaryModel = String(row.primaryModel ?? 'unknown model');
    const aliases = await sessionAliasParts(sessionKey);
    return {
      label: `${source} · ${primaryModel} · ${shortSessionDate(String(row.firstDay ?? ''))}`,
      aliases,
      source,
      calls: rowNumber(row, 'calls'),
      knownCostNanos: rowNumber(row, 'knownCostNanos')
    };
  }));
  const aliasCounts = new Map<string, number>();
  for (const item of rawSessions) {
    aliasCounts.set(item.aliases.short, (aliasCounts.get(item.aliases.short) ?? 0) + 1);
  }
  const sessions = rawSessions.map(({ aliases, ...item }) => ({
    ...item,
    alias: aliasCounts.get(aliases.short) === 1 ? aliases.short : aliases.full
  }));

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
    sessions,
    status: {
      generatedAtMs: rowNumber(rawStatus, 'generatedAtMs'),
      coveredFromMs,
      checkedThroughMs,
      dataRevision: rowNumber(rawStatus, 'dataRevision')
    },
    coverage: { state: coverageState, fromDay: coveredFromDay, throughDay }
  };
}
