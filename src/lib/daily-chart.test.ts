import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DAILY_CHART_METRIC,
  dailyChartSeries,
  dailyTokenMarks,
  dailyTokenSeries,
  dailyTokenOutputMarkerHeight,
  formatDailyAxisLabel,
  formatDailyTokenTick,
  type DailyChartPoint
} from './daily-chart';

describe('daily chart metrics', () => {
  it('defaults to cost and switches to processed tokens', () => {
    const point: DailyChartPoint = {
      knownCostNanos: 1_597_370_000_000,
      inputTokens: 2_400,
      cachedInputTokens: 800,
      outputTokens: 600
    };

    expect(DEFAULT_DAILY_CHART_METRIC).toBe('cost');
    expect(dailyChartSeries(point, DEFAULT_DAILY_CHART_METRIC)).toEqual({ value: 1_597.37 });
    expect(dailyChartSeries(point, 'tokens')).toEqual({
      input: 2_400,
      cached: 800,
      uncachedInput: 1_600,
      cacheRate: 1 / 3,
      output: 600
    });
  });

  it('derives cached input as a subset of the input total', () => {
    expect(
      dailyTokenSeries({
        inputTokens: 2_400,
        cachedInputTokens: 800,
        outputTokens: 600,
        knownCostNanos: 0
      })
    ).toEqual({
      input: 2_400,
      cached: 800,
      uncachedInput: 1_600,
      cacheRate: 1 / 3,
      output: 600
    });
  });

  it('uses a null cache rate when input is zero', () => {
    expect(
      dailyTokenSeries({
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 600,
        knownCostNanos: 0
      }).cacheRate
    ).toBeNull();
  });

  it('places the visible uncached cap inside the input total', () => {
    expect(
      dailyTokenMarks({
        input: 309_651_533,
        cached: 292_102_144,
        uncachedInput: 17_549_389,
        cacheRate: 292_102_144 / 309_651_533,
        output: 1_256_748
      })
    ).toEqual({
      inputRange: [0, 309_651_533],
      uncachedRange: [292_102_144, 309_651_533],
      output: 1_256_748
    });
  });

  it('uses a thin output marker at the input top edge', () => {
    expect(dailyTokenOutputMarkerHeight(0)).toBe(0);
    expect(dailyTokenOutputMarkerHeight(500)).toBe(1);
    expect(dailyTokenOutputMarkerHeight(1_000)).toBe(1);
    expect(dailyTokenOutputMarkerHeight(10)).toBe(1);
  });

  it('rejects invalid token invariants instead of silently clamping them', () => {
    expect(() =>
      dailyTokenSeries({
        inputTokens: 400,
        cachedInputTokens: 401,
        outputTokens: 600,
        knownCostNanos: 0
      })
    ).toThrow('cached input tokens cannot exceed input tokens');
  });

  it('adds the year to axis labels only when dates span years', () => {
    expect(formatDailyAxisLabel('2026-08-24', false)).toBe('24/08');
    expect(formatDailyAxisLabel('2026-08-24', true)).toBe('24/08/26');
  });

  it('uses compact whole-unit token ticks for the daily chart axis', () => {
    expect(formatDailyTokenTick(0)).toBe('0');
    expect(formatDailyTokenTick(300_000_000)).toBe('300M');
    expect(formatDailyTokenTick(1_500_000_000)).toBe('1.5B');
  });
});
