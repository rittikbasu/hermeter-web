export type DailyChartMetric = 'cost' | 'tokens';

export const DEFAULT_DAILY_CHART_METRIC: DailyChartMetric = 'cost';

export type DailyChartPoint = {
  knownCostNanos: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
};

export type DailyChartSeries =
  | { value: number }
  | DailyTokenSeries;

export type DailyTokenSeries = {
  input: number;
  cached: number;
  uncachedInput: number;
  cacheRate: number | null;
  output: number;
};

export type DailyTokenMarks = {
  inputRange: [number, number];
  uncachedRange: [number, number];
  output: number;
};

function assertTokenCount(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} tokens must be a non-negative integer`);
  }
}

export function dailyTokenSeries(point: DailyChartPoint): DailyTokenSeries {
  assertTokenCount('input', point.inputTokens);
  assertTokenCount('cached input', point.cachedInputTokens);
  assertTokenCount('output', point.outputTokens);
  if (point.cachedInputTokens > point.inputTokens) {
    throw new RangeError('cached input tokens cannot exceed input tokens');
  }

  return {
    input: point.inputTokens,
    cached: point.cachedInputTokens,
    uncachedInput: point.inputTokens - point.cachedInputTokens,
    cacheRate: point.inputTokens === 0 ? null : point.cachedInputTokens / point.inputTokens,
    output: point.outputTokens
  };
}

export function dailyTokenMarks(series: DailyTokenSeries): DailyTokenMarks {
  return {
    inputRange: [0, series.input],
    uncachedRange: [series.cached, series.input],
    output: series.output
  };
}

/** Height for the thin output presence marker at each day's input top edge. */
export function dailyTokenOutputMarkerHeight(output: number): number {
  return output > 0 ? 1 : 0;
}

export function dailyChartSeries(
  point: DailyChartPoint,
  metric: DailyChartMetric
): DailyChartSeries {
  return metric === 'tokens'
    ? dailyTokenSeries(point)
    : { value: point.knownCostNanos / 1_000_000_000 };
}

export function formatDailyAxisLabel(day: string, includeYear: boolean): string {
  const short = `${day.slice(8, 10)}/${day.slice(5, 7)}`;
  return includeYear ? `${short}/${day.slice(2, 4)}` : short;
}

export function formatDailyTokenTick(value: number): string {
  const abs = Math.abs(value);
  const compact = (divisor: number, suffix: string) => {
    const scaled = Math.round((value / divisor) * 10) / 10;
    return `${Number.isInteger(scaled) ? scaled : scaled.toFixed(1)}${suffix}`;
  };

  if (abs >= 1_000_000_000) return compact(1_000_000_000, 'B');
  if (abs >= 1_000_000) return compact(1_000_000, 'M');
  if (abs >= 1_000) return compact(1_000, 'K');
  return String(Math.round(value));
}
