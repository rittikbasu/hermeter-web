import { describe, expect, it } from 'vitest';
import { formatMobileSubtotal, formatMoney, formatTokens } from './format';

describe('dashboard formatting', () => {
  it('formats exact nanodollar totals for display', () => {
    expect(formatMoney(1_597_370_000_000)).toBe('$1,597.37');
  });

  it('drops subtotal decimals on mobile at five figures', () => {
    expect(formatMobileSubtotal(9_999_990_000_000)).toBe('$9,999.99');
    expect(formatMobileSubtotal(10_000_490_000_000)).toBe('$10,000');
  });

  it('formats large token counts compactly', () => {
    expect(formatTokens(1_740_000_000)).toBe('1.74B');
    expect(formatTokens(254_790_000)).toBe('254.79M');
  });
});
