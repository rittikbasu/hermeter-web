import { describe, expect, it } from 'vitest';
import { presetForRange, rangeForPreset, presetRange, validateRange } from './date';

describe('date ranges', () => {
  it('makes last seven days inclusive of today', () => {
    expect(presetRange('7d', '2026-07-16')).toEqual({
      from: '2026-07-10',
      to: '2026-07-16'
    });
  });

  it('rejects reversed, malformed, or unbounded ranges', () => {
    expect(validateRange('2026-07-16', '2026-07-10')).toBeNull();
    expect(validateRange('not-a-date', '2026-07-16')).toBeNull();
    expect(validateRange('0000-01-01', '9999-12-31')).toBeNull();
  });

  it('keeps preset selection and the displayed range synchronized', () => {
    const bounds = { firstDay: '2026-06-01', lastDay: '2026-07-16' };

    expect(rangeForPreset('30d', bounds)).toEqual({ from: '2026-06-17', to: '2026-07-16' });
    expect(rangeForPreset('all', bounds)).toEqual({ from: '2026-06-01', to: '2026-07-16' });
    expect(presetForRange({ from: '2026-07-10', to: '2026-07-16' }, bounds)).toBe('7d');
    expect(presetForRange({ from: '2026-07-03', to: '2026-07-12' }, bounds)).toBe('custom');
  });
});
