import { describe, expect, it, vi } from 'vitest';
import { createBloomSync } from './bloom-sync';

describe('createBloomSync', () => {
  it('copies only for source changes or a fresh activation', () => {
    const context = {
      clearRect: vi.fn(),
      drawImage: vi.fn()
    };
    const source = {} as HTMLCanvasElement;
    const sync = createBloomSync(
      context as unknown as CanvasRenderingContext2D,
      source,
      120,
      80
    );

    sync(true, false);
    sync(true, false);
    sync(true, true);
    sync(false, false);
    sync(true, false);

    expect(context.clearRect).toHaveBeenCalledTimes(3);
    expect(context.drawImage).toHaveBeenCalledTimes(3);
    expect(context.clearRect).toHaveBeenLastCalledWith(0, 0, 120, 80);
    expect(context.drawImage).toHaveBeenLastCalledWith(source, 0, 0);
  });
});
