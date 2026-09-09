import { describe, expect, it } from 'vitest';
import { PALETTE } from './palette';
import { paintColumn } from './dither-paint';

describe('dither painting', () => {
  it('does not paint a zero-height band', () => {
    const operations: string[] = [];
    const context = {
      set fillStyle(_value: string) {
        operations.push('fillStyle');
      },
      fillRect() {
        operations.push('fillRect');
      }
    } as unknown as CanvasRenderingContext2D;

    paintColumn(context, 0, 10, 10, PALETTE.blue, {
      variant: 'hatched',
      intensity: 0,
      dim: 1,
      stacked: true
    });

    expect(operations).toEqual([]);
  });
});
