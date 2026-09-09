import { describe, expect, it } from 'vitest';
import { dailyTokenColors } from './daily-token-colors';
import type { DitherColor } from './components/dither-kit/palette';

describe('daily token colors', () => {
  it('keeps cache coverage distinct from every other token role', () => {
    const primaryColors: DitherColor[] = [
      'green',
      'blue',
      'purple',
      'pink',
      'orange',
      'red',
      'grey'
    ];

    for (const primary of primaryColors) {
      const roles = dailyTokenColors(primary);
      expect(new Set([primary, roles.uncached, roles.cacheRate, roles.output])).toHaveLength(4);
    }
  });
});
