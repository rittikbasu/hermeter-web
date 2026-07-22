<script lang="ts">
  import { onMount } from 'svelte';
  import { goto, invalidateAll } from '$app/navigation';
  import DateRangeField from '$lib/components/date-range-field.svelte';
  import Avatar from '$lib/components/dither-kit/avatar.svelte';
  import AreaChart from '$lib/components/dither-kit/area-chart.svelte';
  import Area from '$lib/components/dither-kit/area.svelte';
  import BarChart from '$lib/components/dither-kit/bar-chart.svelte';
  import Bar from '$lib/components/dither-kit/bar.svelte';
  import Grid from '$lib/components/dither-kit/grid.svelte';
  import ProgressLine from '$lib/components/dither-kit/progress-line.svelte';
  import PieChart from '$lib/components/dither-kit/pie-chart.svelte';
  import Pie from '$lib/components/dither-kit/pie.svelte';
  import Tooltip from '$lib/components/dither-kit/tooltip.svelte';
  import XAxis from '$lib/components/dither-kit/x-axis.svelte';
  import YAxis from '$lib/components/dither-kit/y-axis.svelte';
  import { PALETTE, rgb, type DitherColor, type Rgb } from '$lib/components/dither-kit/palette';
  import * as Select from '$lib/components/ui/select/index.js';
  import { presetForRange, rangeForPreset, type DateRange, type RangePreset } from '$lib/date';
  import {
    formatMobileSubtotal,
    formatMoney,
    formatNumber,
    formatPercent,
    formatTimestamp,
    formatTokens,
    formatTooltipDay,
    formatTooltipHour
  } from '$lib/format';
  import { fetchStatusVersion } from '$lib/status';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  type Daily = { day: string; calls: number; knownCostNanos: number };
  type Hourly = { hour: number; calls: number; knownCostNanos: number };
  type Breakdown = { source?: string; provider?: string; model?: string; calls: number; processedTokens: number; knownCostNanos: number };
  type Session = { label: string; source: string; calls: number; knownCostNanos: number };

  const summary = $derived(data.dashboard.summary);
  const daily = $derived(data.dashboard.daily as Daily[]);
  const hourly = $derived(data.dashboard.hourly as Hourly[]);
  const models = $derived(data.dashboard.models as Breakdown[]);
  const sources = $derived(data.dashboard.sources as Breakdown[]);
  const sessions = $derived(data.dashboard.sessions as Session[]);
  const status = $derived(data.dashboard.status);
  const coverage = $derived(data.dashboard.coverage);

  function updatedTime(value: number): string {
    if (!value) return 'waiting for sync';
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit'
    }).format(value);
  }

  function hexColor([red, green, blue]: Rgb): string {
    return `#${[red, green, blue].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
  }

  // Keep the request theme stable when dashboard data invalidates.
  // svelte-ignore state_referenced_locally
  let primaryColor = $state<DitherColor>(data.theme.primaryColor);

  const spendSeries = $derived(daily.map((item) => ({
    day: item.day,
    label: `${item.day.slice(8, 10)}/${item.day.slice(5, 7)}`,
    tooltipLabel: formatTooltipDay(item.day),
    spend: item.knownCostNanos / 1_000_000_000
  })));
  const spendConfig = $derived({ spend: { label: 'spend', color: primaryColor } });

  const hourlyByHour = $derived(new Map(hourly.map((item) => [item.hour, item])));
  const hours = $derived.by(() => Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: String(hour).padStart(2, '0'),
    tooltipLabel: formatTooltipHour(hour),
    calls: hourlyByHour.get(hour)?.calls ?? 0
  })));
  const modelSeries = $derived(models.slice(0, 8).map((item) => ({
    model: item.model ?? 'unknown',
    calls: item.calls,
    knownCostNanos: item.knownCostNanos,
    spend: item.knownCostNanos / 1_000_000_000
  })));
  const modelMaximum = $derived(Math.max(1, ...modelSeries.map((item) => item.spend)));
  const sourceSeries = $derived(sources.map((item) => ({
    label: item.source ?? 'unknown',
    source: item.source ?? 'unknown',
    calls: item.calls,
    knownCostNanos: item.knownCostNanos,
    spend: item.knownCostNanos / 1_000_000_000
  })));
  const primaryHues: Record<DitherColor, number> = {
    green: 138, blue: 212, purple: 256, pink: 322, orange: 31, red: 0, grey: 0
  };
  const sourceColorMap: Record<string, DitherColor> = {
    desktop: 'blue', cli: 'green', subagent: 'purple', telegram: 'orange', unknown: 'grey'
  };
  const primarySeed = $derived(PALETTE[primaryColor]);
  const primaryHex = $derived(hexColor(primarySeed.fill));
  const primaryStyle = $derived(
    `--signal:${rgb(primarySeed.fill)};--signal-soft:${rgb(primarySeed.fill, 1, 0.14)};--primary:${rgb(primarySeed.fill)};--ring:${rgb(primarySeed.fill)}`
  );
  const faviconHref = $derived(`data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="5" fill="#0d0f12"/><path fill="${primaryHex}" d="M7 7h4v4H7zm7 0h4v4h-4zm7 0h4v4h-4zM7 14h4v4H7zm7 0h4v4h-4zm7 0h4v4h-4zM7 21h4v4H7zm7 0h4v4h-4zm7 0h4v4h-4z"/></svg>`
  )}`);
  const callsConfig = $derived({ calls: { label: 'calls', color: primaryColor } });
  const sourceColor = (source: string): DitherColor => sourceColorMap[source] ?? 'grey';
  const sourceConfig = $derived.by(() => Object.fromEntries(sourceSeries.map((item) => [
    item.source,
    { label: item.source, color: sourceColor(item.source) }
  ])));
  const filterOptions: Array<{ value: RangePreset; label: string }> = [
    { value: 'today', label: 'today' },
    { value: 'yesterday', label: 'yesterday' },
    { value: '7d', label: '7 days' },
    { value: '30d', label: '30 days' },
    { value: 'month', label: 'this month' },
    { value: 'all', label: 'all time' }
  ];
  const activePreset = $derived(presetForRange(data.dashboard.range, data.bounds));
  const activePresetLabel = $derived(
    activePreset === 'custom'
      ? 'custom'
      : filterOptions.find((option) => option.value === activePreset)?.label ?? 'custom'
  );
  // svelte-ignore state_referenced_locally
  let avatarSeed = $state(data.theme.avatarSeed);

  function formatChartMoney(value: number): string {
    if (value === 0) return '$0';
    if (Math.abs(value) < 1) return `$${value.toFixed(2)}`;
    if (Math.abs(value) < 10) return `$${value.toFixed(1)}`;
    return `$${Math.round(value).toLocaleString('en-US')}`;
  }

  function formatChartCalls(value: number): string {
    return Number.isInteger(value) ? formatNumber(value) : '';
  }


  async function applyRange(range: DateRange): Promise<void> {
    await goto(`/?from=${range.from}&to=${range.to}`, { noScroll: true, keepFocus: true });
  }

  async function changePreset(value: string): Promise<void> {
    if (!filterOptions.some((option) => option.value === value)) return;
    await applyRange(rangeForPreset(value as RangePreset, data.bounds));
  }

  onMount(() => {
    let version = `${status.dataRevision}:${status.checkedThroughMs}`;
    const timer = window.setInterval(async () => {
      const current = await fetchStatusVersion();
      if (current !== null && current !== version) {
        version = current;
        await invalidateAll();
      }
    }, 60_000);
    return () => window.clearInterval(timer);
  });
</script>

<svelte:head>
  <title>hermeter</title>
  <meta name="description" content="hermes usage and cost dashboard" />
  <link rel="preload" href="/fonts/geist-pixel/GeistPixel-Square.woff2" as="font" type="font/woff2" crossorigin="anonymous" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="icon" type="image/svg+xml" href={faviconHref} />
  <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
</svelte:head>

<div class="shell" style={primaryStyle}>
  <header class="topbar">
    <a class="brand" href="/" aria-label="hermeter home">
      <span class="brand-avatar" aria-hidden="true"><Avatar name={avatarSeed} hue={primaryHues[primaryColor]} mirror="vertical" size={28} animate bloom="off" /></span>
      <strong>hermeter</strong>
    </a>
    <div class="freshness" title={`checked through ${formatTimestamp(status.checkedThroughMs)}`}>
      <span>{status.checkedThroughMs ? `last updated ${updatedTime(status.checkedThroughMs)}` : 'waiting for sync'}</span>
    </div>
  </header>

  <main>
    <h1 class="sr-only">hermeter dashboard</h1>
    <section class="rangebar" aria-label="date range filters">
      <DateRangeField
        from={data.dashboard.range.from}
        to={data.dashboard.range.to}
        min={data.bounds.firstDay}
        max={data.bounds.lastDay}
        accent={rgb(primarySeed.fill)}
        onSelect={applyRange}
      />
      <Select.Root type="single" value={activePreset} onValueChange={changePreset}>
        <Select.Trigger class="filter-trigger" aria-label="date preset">
          <span>{activePresetLabel}</span>
        </Select.Trigger>
        <Select.Content class="filter-content" align="end">
          {#each filterOptions as option}
            <Select.Item value={option.value}>{option.label}</Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    </section>

    {#if summary.calls === 0}
      <section class="empty-state">
        {#if coverage.state === 'unavailable'}
          <p class="eyebrow">not measured</p>
          <h2>no coverage here yet.</h2>
          <p>hermeter has not measured this selected range, so it cannot be treated as zero.</p>
        {:else if coverage.state === 'partial'}
          <p class="eyebrow">partial coverage</p>
          <h2>nothing measured so far.</h2>
          <p>no usage was found in the measured part of this range. activity outside that window is still unknown.</p>
        {:else}
          <p class="eyebrow">fully measured</p>
          <h2>this range is quiet.</h2>
          <p>hermeter measured the full selected range and found no usage events.</p>
        {/if}
      </section>
    {:else}
      <section class="metrics" aria-label="usage summary">
        <article>
          <p>subtotal</p>
          <strong><span class="desktop-subtotal">{formatMoney(summary.knownCostNanos)}</span><span class="mobile-subtotal">{formatMobileSubtotal(summary.knownCostNanos)}</span></strong>
          <small>{summary.incompleteEvents ? `${summary.incompleteEvents} incomplete pricing events` : 'priced from captured usage'}</small>
        </article>
        <article>
          <p>api calls</p>
          <strong>{formatNumber(summary.calls)}</strong>
          <small>{formatNumber(Math.round(summary.calls / Math.max(daily.length, 1)))} per active day</small>
        </article>
        <article>
          <p>tokens processed</p>
          <strong>{formatTokens(summary.processedTokens)}</strong>
          <small>{formatTokens(summary.outputTokens)} output</small>
        </article>
        <article>
          <p>cache coverage</p>
          <strong>{formatPercent(summary.cacheRate)}</strong>
          <small>{formatTokens(summary.cachedInputTokens)} cached input</small>
        </article>
      </section>

      <section class="primary-grid">
        <article class="panel trend-panel">
          <div class="panel-head">
            <div><h2>daily spend</h2></div>
            <p>{formatTooltipDay(data.dashboard.range.from)}<span>→</span>{formatTooltipDay(data.dashboard.range.to)}</p>
          </div>
          <div class="trend-chart" aria-hidden="true">
            <AreaChart
              data={spendSeries}
              config={spendConfig}
              margins={{ top: 18, right: 18, bottom: 28, left: 54 }}
              bloom="low"
              animationDuration={650}
            >
              <Grid strokeDasharray="2 5" />
              <XAxis dataKey="label" maxTicks={7} />
              <YAxis tickCount={4} tickFormatter={formatChartMoney} />
              <Area dataKey="spend" variant="dotted" />
              <Tooltip labelKey="tooltipLabel" valueFormatter={(value) => formatMoney(value * 1_000_000_000)} />
            </AreaChart>
          </div>
          <table class="sr-only">
            <caption>spend by day</caption>
            <thead><tr><th>day</th><th>spend</th></tr></thead>
            <tbody>{#each daily as item}<tr><td>{item.day}</td><td>{formatMoney(item.knownCostNanos)}</td></tr>{/each}</tbody>
          </table>
        </article>

        <article class="panel hourly-panel">
          <div class="panel-head"><div><h2>hourly activity</h2></div><p>api calls · ist</p></div>
          <div class="bar-chart hourly-chart" aria-hidden="true">
            <BarChart data={hours} config={callsConfig} margins={{ top: 18, right: 12, bottom: 28, left: 45 }} bloom="low">
              <Grid strokeDasharray="2 5" />
              <XAxis dataKey="label" maxTicks={6} />
              <YAxis tickCount={4} tickFormatter={formatChartCalls} />
              <Bar dataKey="calls" variant="dotted" />
              <Tooltip labelKey="tooltipLabel" valueFormatter={(value) => `${formatNumber(value)} calls`} />
            </BarChart>
          </div>
          <table class="sr-only">
            <caption>calls by local hour in ist</caption>
            <thead><tr><th>hour</th><th>calls</th></tr></thead>
            <tbody>{#each hours as item}<tr><td>{item.label}:00</td><td>{formatNumber(item.calls)}</td></tr>{/each}</tbody>
          </table>

        </article>
      </section>

      <section class="breakdown-grid">
        <article class="panel list-panel model-panel">
          <div class="panel-head"><div><h2>models</h2></div></div>
          <ul class="model-lines" aria-label="top model totals">
            {#each modelSeries as item}
              <li>
                <span class="model-label"><strong>{item.model}</strong><small>{formatNumber(item.calls)} calls</small></span>
                <ProgressLine value={item.spend} maximum={modelMaximum} color={primaryColor} />
                <span class="model-value">{formatMoney(item.knownCostNanos)}</span>
              </li>
            {/each}
          </ul>
        </article>

        <article class="panel list-panel source-panel">
          <div class="panel-head"><div><h2>sources</h2></div></div>
          <div class="source-content">
            <div class="breakdown-chart source-pie-chart" aria-hidden="true">
              <PieChart
                data={sourceSeries}
                config={sourceConfig}
                dataKey="spend"
                nameKey="source"
                innerRadius={0.56}
                margins={{ top: 8, right: 8, bottom: 8, left: 8 }}
                bloom="low"
              >
                <Pie variant="dotted" />
                <Tooltip valueFormatter={(value) => formatMoney(value * 1_000_000_000)} />
              </PieChart>
            </div>
            <ul class="breakdown-key source-key" aria-label="source totals">
              {#each sourceSeries as item}
                <li><span class={`source-label source-${sourceColor(item.source)}`}><i aria-hidden="true"></i>{item.source}</span><small>{formatNumber(item.calls)} calls · {formatMoney(item.knownCostNanos)}</small></li>
              {/each}
            </ul>
          </div>
        </article>
      </section>

      <section class="panel sessions-panel">
        <div class="panel-head">
          <div><h2>top sessions</h2></div>
          <p>{sessions.length} shown</p>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>session</th><th>calls</th><th>known spend</th></tr></thead>
            <tbody>
              {#each sessions as item}
                <tr>
                  <td>
                    <span class="session-title">{item.label}</span>
                    <small class={`source-label source-${sourceColor(item.source)}`}><i aria-hidden="true"></i>{item.source}</small>
                  </td>
                  <td>{formatNumber(item.calls)}</td>
                  <td>{formatMoney(item.knownCostNanos)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>
    {/if}
  </main>
</div>
