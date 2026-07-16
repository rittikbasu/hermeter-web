<script lang="ts">
  import { CalendarRange } from '@lucide/svelte';
  import {
    DateFormatter,
    getLocalTimeZone,
    parseDate,
    type DateValue
  } from '@internationalized/date';
  import { untrack } from 'svelte';
  import { Button } from '$lib/components/ui/button/index.js';
  import * as Popover from '$lib/components/ui/popover/index.js';
  import { RangeCalendar } from '$lib/components/ui/range-calendar/index.js';
  import { validateRange, type DateRange } from '$lib/date';

  type CalendarValue = { start: DateValue | undefined; end: DateValue | undefined };

  let {
    from,
    to,
    min,
    max,
    accent,
    onSelect
  }: {
    from: string;
    to: string;
    min: string;
    max: string;
    accent: string;
    onSelect: (range: DateRange) => void | Promise<void>;
  } = $props();

  const formatter = new DateFormatter('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

  let open = $state(false);
  let sourceRange = $state(untrack(() => `${from}:${to}`));
  let selected = $state<CalendarValue>({
    start: parseDate(untrack(() => from)),
    end: parseDate(untrack(() => to))
  });

  const displayRange = $derived(
    `${formatter.format(parseDate(from).toDate(getLocalTimeZone()))} — ${formatter.format(parseDate(to).toDate(getLocalTimeZone()))}`
  );

  $effect(() => {
    const nextSource = `${from}:${to}`;
    if (nextSource !== sourceRange || !open) {
      sourceRange = nextSource;
      selected = { start: parseDate(from), end: parseDate(to) };
    }
  });

  async function selectRange(value: CalendarValue): Promise<void> {
    selected = value;
    if (!value.start || !value.end) return;
    const range = validateRange(value.start.toString(), value.end.toString());
    if (!range) return;
    open = false;
    await onSelect(range);
  }
</script>

<Popover.Root bind:open>
  <Popover.Trigger>
    {#snippet child({ props })}
      <Button
        {...props}
        type="button"
        variant="outline"
        class="date-range-trigger"
        aria-label={`date range: ${displayRange}`}
      >
        <CalendarRange aria-hidden="true" size={16} strokeWidth={1.65} />
        <span>{displayRange}</span>
      </Button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content
    align="start"
    sideOffset={7}
    class="date-popover range-popover"
    style={`--primary:${accent};--ring:${accent}`}
  >
    <RangeCalendar
      value={selected}
      onValueChange={selectRange}
      minValue={parseDate(min)}
      maxValue={parseDate(max)}
      maxDays={3660}
      locale="en-GB"
      weekdayFormat="short"
      captionLayout="dropdown"
      calendarLabel="usage date range"
    />
  </Popover.Content>
</Popover.Root>
