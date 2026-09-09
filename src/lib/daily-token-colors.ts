import type { DitherColor } from './components/dither-kit/palette';

export type DailyTokenColors = {
  uncached: DitherColor;
  cacheRate: DitherColor;
  output: DitherColor;
};

const CACHE_RATE_COLOR_ORDER: readonly DitherColor[] = [
  'pink',
  'green',
  'blue',
  'red',
  'orange',
  'purple'
];

export function dailyTokenColors(primary: DitherColor): DailyTokenColors {
  const uncached = primary === 'purple' ? 'blue' : 'purple';
  const output = primary === 'orange' ? 'blue' : 'orange';
  const used = new Set<DitherColor>([primary, uncached, output]);
  const cacheRate = CACHE_RATE_COLOR_ORDER.find((color) => !used.has(color)) ?? 'grey';

  return { uncached, cacheRate, output };
}
