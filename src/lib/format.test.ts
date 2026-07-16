import { describe, expect, it } from 'vitest';
import { formatMoney, formatTokens } from './format';

describe('dashboard formatting', () => {
  it('formats exact nanodollar totals for display', () => {
    expect(formatMoney(1_597_370_000_000)).toBe('$1,597.37');
  });

  it('formats large token counts compactly', () => {
    expect(formatTokens(1_740_000_000)).toBe('1.74B');
    expect(formatTokens(254_790_000)).toBe('254.79M');
  });
});
