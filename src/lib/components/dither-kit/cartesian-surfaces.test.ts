import { describe, expect, it } from 'vitest';
import { surfaceForBand } from './cartesian-surfaces';

describe('cartesian series surfaces', () => {
  const y = (value: number) => 100 - value;

  it('keeps a positive line as a thin absolute trace', () => {
    expect(surfaceForBand([0, 50], 'line', y, 100, 101, 4)).toEqual({
      top: 50,
      floor: 54
    });
  });

  it('does not give a zero-valued line drawable depth', () => {
    expect(surfaceForBand([0, 0], 'line', y, 100, 101, 4)).toEqual({
      top: 100,
      floor: 100
    });
  });

  it('keeps area surfaces attached to their lower band edge', () => {
    expect(surfaceForBand([20, 50], 'area', y, 100, 101, 4)).toEqual({
      top: 50,
      floor: 80
    });
  });
});
