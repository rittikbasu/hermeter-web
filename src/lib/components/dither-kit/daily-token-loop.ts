import {
  dailyTokenMarks,
  dailyTokenOutputMarkerHeight,
  type DailyTokenSeries
} from '../../daily-chart';
import type { CartesianChartState } from './chart-context.svelte';
import { createBloomSync } from './bloom-sync';
import {
  clamp01,
  easeOutCubic,
  paintColumn,
  prefersReducedMotion
} from './dither-paint';

type Ref<T> = { readonly current: T };

type LoopArgs = {
  canvas: HTMLCanvasElement;
  bloomCanvas: HTMLCanvasElement | null;
  cols: number;
  rows: number;
  width: number;
  state: Ref<CartesianChartState>;
};

const STAGGER = 0.48;

function numberAt(row: Record<string, unknown>, key: string): number {
  return typeof row[key] === 'number' ? row[key] : 0;
}

/**
 * Paints the input total and its uncached range into one shared bar surface.
 * The cap is projected from cached → input, never stacked beside the total.
 */
export function startDailyTokenLoop({
  canvas,
  bloomCanvas,
  cols,
  rows,
  width,
  state
}: LoopArgs): (() => void) | undefined {
  const context = canvas.getContext('2d');
  if (!context || cols <= 0 || rows <= 0) return undefined;

  canvas.width = cols;
  canvas.height = rows;

  const bloomContext = bloomCanvas?.getContext('2d') ?? null;
  if (bloomCanvas) {
    bloomCanvas.width = cols;
    bloomCanvas.height = rows;
  }
  const syncBloom = bloomContext
    ? createBloomSync(bloomContext, canvas, cols, rows)
    : null;

  const reducedMotion = prefersReducedMotion();
  const animate = state.current.animate && !reducedMotion;
  const duration = state.current.animationDuration;
  const columnScale = cols / Math.max(width, 1);

  const progressFor = (index: number, length: number, progress: number) => {
    if (!animate) return 1;
    const start = length > 1 ? (index / (length - 1)) * STAGGER : 0;
    return easeOutCubic(clamp01((progress - start) / (1 - STAGGER)));
  };

  const paint = (progress: number, intensity: number) => {
    const chart = state.current;
    context.clearRect(0, 0, cols, rows);

    const base = rows - 1;
    const height = chart.plot.height || 1;
    const categoryWidth = width / Math.max(chart.dataLength, 1);
    const barWidth = categoryWidth * 0.68;
    const inputSeed = chart.seedOf('input');
    const uncachedSeed = chart.seedOf('uncachedInput');
    const outputSeed = chart.seedOf('output');
    const emphasis = chart.selectedDataKey ?? chart.focusDataKey;

    for (let index = 0; index < chart.dataLength; index += 1) {
      const row = chart.data[index] ?? {};
      const series: DailyTokenSeries = {
        input: numberAt(row, 'input'),
        cached: numberAt(row, 'cached'),
        uncachedInput: numberAt(row, 'uncachedInput'),
        cacheRate: null,
        output: numberAt(row, 'output')
      };
      const marks = dailyTokenMarks(series);
      const grow = progressFor(index, chart.dataLength, progress);
      const inputTarget = (chart.y(marks.inputRange[1]) / height) * (rows - 1);
      const cachedTarget = (chart.y(marks.uncachedRange[0]) / height) * (rows - 1);
      const inputTop = base + (inputTarget - base) * grow;
      const uncachedFloor = base + (cachedTarget - base) * grow;
      const outputMarkerDepth = dailyTokenOutputMarkerHeight(series.output);
      const slotX = chart.xCenter(index) - barWidth / 2;
      const firstColumn = Math.max(0, Math.round(slotX * columnScale));
      const lastColumn = Math.min(
        cols,
        Math.round((slotX + barWidth) * columnScale)
      );
      const active = chart.hoverIndex === index;
      const hoverDim =
        chart.hoverIndex != null && !active && chart.isMouseInChart ? 0.5 : 1;
      const dim = (emphasis === null ? 1 : 0.3) * hoverDim;

      for (let column = firstColumn; column < lastColumn; column += 1) {
        paintColumn(context, column, inputTop, base, inputSeed, {
          variant: 'gradient',
          intensity: intensity + (active ? 0.4 : 0),
          dim,
          stacked: false
        });
        // A zero uncached range is allowed to disappear. No minimum height is
        // introduced because that would invent magnitude at high coverage.
        if (uncachedFloor - inputTop > 0.5) {
          paintColumn(context, column, inputTop, uncachedFloor, uncachedSeed, {
            variant: 'hatched',
            intensity: intensity + (active ? 0.4 : 0),
            dim,
            stacked: false
          });
        }
        if (outputMarkerDepth > 0.5) {
          paintColumn(context, column, inputTop, inputTop + outputMarkerDepth, outputSeed, {
            variant: 'solid',
            intensity: intensity + (active ? 0.4 : 0),
            dim,
            stacked: false
          });
        }
      }
    }
  };

  let frame = 0;
  let animationStart = 0;
  let lastProgress = -1;
  let lastRevision: unknown;
  let intensity = 0;
  let needsPaint = true;
  let lastEmphasis: string | null | undefined = Symbol() as never;
  let lastHover: number | null | undefined = Symbol() as never;

  const draw = (now: number) => {
    frame = requestAnimationFrame(draw);
    const chart = state.current;
    if (!chart.ready) return;

    const bloomOn =
      chart.bloom !== 'off' &&
      (!chart.bloomOnHover || chart.isMouseInChart || chart.hovered);

    const revision = chart.revision;
    if (revision !== lastRevision) {
      lastRevision = revision;
      animationStart = 0;
      lastProgress = -1;
      needsPaint = true;
    }
    if (!animationStart) animationStart = now;

    const progress = animate
      ? Math.min(1, (now - animationStart) / duration)
      : 1;

    if (progress !== lastProgress) {
      lastProgress = progress;
      needsPaint = true;
    }

    const emphasis = chart.selectedDataKey ?? chart.focusDataKey;
    if (emphasis !== lastEmphasis) {
      lastEmphasis = emphasis;
      needsPaint = true;
    }
    if (chart.hoverIndex !== lastHover) {
      lastHover = chart.hoverIndex;
      needsPaint = true;
    }

    const targetIntensity = chart.isMouseInChart || chart.hovered ? 1 : 0;
    if (Math.abs(intensity - targetIntensity) > 0.001) {
      intensity += (targetIntensity - intensity) * (reducedMotion ? 1 : 0.16);
      needsPaint = true;
    } else {
      intensity = targetIntensity;
    }
    if (!needsPaint) {
      syncBloom?.(bloomOn, false);
      return;
    }

    paint(progress, intensity);
    syncBloom?.(bloomOn, true);
    needsPaint = false;
  };

  frame = requestAnimationFrame(draw);
  return () => cancelAnimationFrame(frame);
}
