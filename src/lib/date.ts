export type DateRange = { from: string; to: string };
export type Preset = 'today' | 'yesterday' | '7d' | '30d' | 'month';

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
export const MAX_RANGE_DAYS = 3_660;

function parseDay(value: string): Date | null {
  if (!ISO_DAY.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

function formatDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function shiftDay(day: string, amount: number): string {
  const date = parseDay(day);
  if (!date) throw new Error(`invalid day: ${day}`);
  date.setUTCDate(date.getUTCDate() + amount);
  return formatDay(date);
}

export function validateRange(from: string, to: string): DateRange | null {
  const start = parseDay(from);
  const end = parseDay(to);
  if (!start || !end || start > end) return null;
  if (((end.valueOf() - start.valueOf()) / DAY_MS) + 1 > MAX_RANGE_DAYS) return null;
  return { from, to };
}

export function presetRange(preset: Preset, today: string): DateRange {
  const current = parseDay(today);
  if (!current) throw new Error(`invalid day: ${today}`);

  if (preset === 'today') return { from: today, to: today };
  if (preset === 'yesterday') {
    const yesterday = shiftDay(today, -1);
    return { from: yesterday, to: yesterday };
  }
  if (preset === '7d') return { from: shiftDay(today, -6), to: today };
  if (preset === '30d') return { from: shiftDay(today, -29), to: today };
  return { from: `${today.slice(0, 7)}-01`, to: today };
}
