import { describe, expect, it } from 'vitest';
import { tickIndexes } from './scales';

describe('cartesian axis ticks', () => {
  it('keeps both endpoints when a series is longer than the tick budget', () => {
    const indexes = tickIndexes(30, 8);

    expect(indexes[0]).toBe(0);
    expect(indexes.at(-1)).toBe(29);
    expect(indexes).toHaveLength(8);
  });

  it('uses every index when the data fits within the tick budget', () => {
    expect(tickIndexes(4, 8)).toEqual([0, 1, 2, 3]);
  });
});
