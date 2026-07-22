const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const wholeMoney = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
});

export function formatMoney(nanodollars: number): string {
  return money.format(nanodollars / 1_000_000_000);
}

export function formatMobileSubtotal(nanodollars: number): string {
  const dollars = nanodollars / 1_000_000_000;
  return Math.abs(dollars) >= 10_000 ? wholeMoney.format(dollars) : money.format(dollars);
}

export function formatTokens(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function formatTooltipDay(day: string): string {
  return `${day.slice(8, 10)}-${day.slice(5, 7)}-${day.slice(0, 4)}`;
}

export function formatTooltipHour(hour: number): string {
  const period = hour < 12 ? 'am' : 'pm';
  return `${hour % 12 || 12}:00 ${period}`;
}

export function formatTimestamp(value: number): string {
  if (!value) return 'not synced';
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata'
  }).format(new Date(value));
}
