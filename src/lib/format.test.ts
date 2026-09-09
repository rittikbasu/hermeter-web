import { describe, expect, it } from 'vitest';
import {
  formatMobileSubtotal,
  formatMoney,
  formatExactTokens,
  formatTokens,
  formatTooltipDay,
  formatTooltipHour
} from './format';

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

  it('keeps token values exact for tooltip and table display', () => {
    expect(formatExactTokens(2_450)).toBe('2,450 tokens');
    expect(formatExactTokens(1_000_001)).toBe('1,000,001 tokens');
  });

  it('formats tooltip dates as dd-mm-yyyy', () => {
    expect(formatTooltipDay('2026-07-22')).toBe('22-07-2026');
  });

  it('formats tooltip hours in 12-hour time', () => {
    expect(formatTooltipHour(0)).toBe('12:00 am');
    expect(formatTooltipHour(9)).toBe('9:00 am');
    expect(formatTooltipHour(12)).toBe('12:00 pm');
    expect(formatTooltipHour(13)).toBe('1:00 pm');
    expect(formatTooltipHour(23)).toBe('11:00 pm');
  });
});
