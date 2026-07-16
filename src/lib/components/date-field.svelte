<script lang="ts">
  import { CalendarDays } from '@lucide/svelte';
  import { untrack } from 'svelte';
  import {
    DateFormatter,
    getLocalTimeZone,
    parseDate,
    type DateValue
  } from '@internationalized/date';
  import { Button } from '$lib/components/ui/button/index.js';
  import { Calendar } from '$lib/components/ui/calendar/index.js';
  import * as Popover from '$lib/components/ui/popover/index.js';

  let {
    name,
    label,
    value,
    min,
    max
  }: {
    name: string;
    label: string;
    value: string;
    min: string;
    max: string;
  } = $props();

  const formatter = new DateFormatter('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

  let open = $state(false);
  let sourceValue = $state(untrack(() => value));
  let selected = $state<DateValue>(parseDate(untrack(() => value)));
  const serialized = $derived(selected.toString());

  $effect(() => {
    if (value !== sourceValue) {
      sourceValue = value;
      selected = parseDate(value);
    }
  });

</script>

<div class="date-control">
  <span class="date-label" id={`${name}-date-label`}>{label}</span>
  <input type="hidden" {name} value={serialized} />
  <Popover.Root bind:open>
    <Popover.Trigger>
      {#snippet child({ props })}
        <Button
          {...props}
          type="button"
          variant="outline"
          class="date-trigger"
          aria-labelledby={`${name}-date-label ${name}-date-value`}
        >
          <span id={`${name}-date-value`}>{formatter.format(selected.toDate(getLocalTimeZone()))}</span>
          <CalendarDays aria-hidden="true" size={14} strokeWidth={1.65} />
        </Button>
      {/snippet}
    </Popover.Trigger>
    <Popover.Content align="start" sideOffset={6} class="date-popover">
      <Calendar
        type="single"
        bind:value={selected}
        minValue={parseDate(min)}
        maxValue={parseDate(max)}
        locale="en-GB"
        weekdayFormat="short"
        captionLayout="dropdown"
        onValueChange={() => { open = false; }}
        initialFocus
      />
    </Popover.Content>
  </Popover.Root>
</div>
