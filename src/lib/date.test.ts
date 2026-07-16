import { describe, expect, it } from 'vitest';
import { presetRange, validateRange } from './date';

describe('date ranges', () => {
  it('makes last seven days inclusive of today', () => {
    expect(presetRange('7d', '2026-07-16')).toEqual({
      from: '2026-07-10',
      to: '2026-07-16'
    });
  });

  it('rejects reversed or malformed ranges', () => {
    expect(validateRange('2026-07-16', '2026-07-10')).toBeNull();
    expect(validateRange('not-a-date', '2026-07-16')).toBeNull();
  });
});
