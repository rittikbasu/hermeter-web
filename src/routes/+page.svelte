<script lang="ts">
  import { onMount } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import { presetRange, type Preset } from '$lib/date';
  import { formatMoney, formatNumber, formatPercent, formatTimestamp, formatTokens } from '$lib/format';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  type Daily = { day: string; calls: number; knownCostNanos: number };
  type Hourly = { day: string; hour: number; calls: number; knownCostNanos: number };
  type Breakdown = { source?: string; provider?: string; model?: string; calls: number; processedTokens: number; knownCostNanos: number };
  type Session = { sessionKey: string; title: string | null; source: string; calls: number; knownCostNanos: number };

  const summary = $derived(data.dashboard.summary);
  const daily = $derived(data.dashboard.daily as Daily[]);
  const hourly = $derived(data.dashboard.hourly as Hourly[]);
  const models = $derived(data.dashboard.models as Breakdown[]);
  const sources = $derived(data.dashboard.sources as Breakdown[]);
  const sessions = $derived(data.dashboard.sessions as Session[]);
  const status = $derived(data.dashboard.status);
  const coverage = $derived(data.dashboard.coverage);
  const stale = $derived(status.checkedThroughMs > 0 && Date.now() - status.checkedThroughMs > 30 * 60 * 1000);

  const trend = $derived.by(() => {
    if (!daily.length) return { line: '', area: '', points: [] as Array<readonly [number, number]>, max: 0 };
    const width = 1000;
    const floor = 260;
    const max = Math.max(...daily.map((item) => item.knownCostNanos), 1);
    const points = daily.map((item, index) => {
      const x = daily.length === 1 ? width / 2 : (index / (daily.length - 1)) * width;
      const y = floor - (item.knownCostNanos / max) * 220;
      return [x, y] as const;
    });
    const line = points.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
    return { line, area: `${line} L${points.at(-1)?.[0] ?? 0} ${floor} L${points[0][0]} ${floor} Z`, points, max };
  });

  const hours = $derived.by(() => Array.from({ length: 24 }, (_, hour) => ({
    hour,
    calls: hourly.filter((item) => item.hour === hour).reduce((sum, item) => sum + item.calls, 0)
  })));
  const maxHour = $derived(Math.max(...hours.map((item) => item.calls), 1));
  const maxModel = $derived(Math.max(...models.map((item) => item.knownCostNanos), 1));
  const maxSource = $derived(Math.max(...sources.map((item) => item.knownCostNanos), 1));

  function hrefFor(preset: Preset | 'all'): string {
    if (preset === 'all') return `/?from=${data.bounds.firstDay}&to=${data.bounds.lastDay}`;
    const range = presetRange(preset, data.bounds.lastDay);
    return `/?from=${range.from}&to=${range.to}`;
  }

  function selected(preset: Preset | 'all'): boolean {
    const href = new URL(hrefFor(preset), 'https://local');
    return href.searchParams.get('from') === data.dashboard.range.from
      && href.searchParams.get('to') === data.dashboard.range.to;
  }

  onMount(() => {
    let revision = status.dataRevision;
    const timer = window.setInterval(async () => {
      const response = await fetch('/api/status');
      if (!response.ok) return;
      const current = await response.json() as { dataRevision: number };
      if (current.dataRevision !== revision) {
        revision = current.dataRevision;
        await invalidateAll();
      }
    }, 60_000);
    return () => window.clearInterval(timer);
  });
</script>

<svelte:head>
  <title>hermeter / usage pulse</title>
  <meta name="description" content="private hermes usage and cost dashboard" />
</svelte:head>

<div class="shell">
  <header class="topbar">
    <a class="brand" href="/" aria-label="hermeter home">
      <span class="brand-mark" aria-hidden="true"></span>
      <span>hermeter</span>
      <span class="brand-view">usage pulse</span>
    </a>
    <div class="freshness" title={`checked through ${formatTimestamp(status.checkedThroughMs)}`}>
      <span class="status-dot" class:live={status.checkedThroughMs > 0 && !stale} class:stale></span>
      <span>{status.checkedThroughMs ? `${stale ? 'stale · ' : 'checked '}${formatTimestamp(status.checkedThroughMs)}` : 'waiting for first sync'}</span>
      {#if status.checkedThroughMs}<b class:warning={coverage.state !== 'complete'}>{coverage.state}</b>{/if}
    </div>
  </header>

  <main>
    <h1 class="sr-only">hermeter usage pulse</h1>
    <section class="rangebar" aria-label="date range">
      <nav class="presets" aria-label="date presets">
        {#each [['today', 'today'], ['yesterday', 'yesterday'], ['7d', '7 days'], ['30d', '30 days'], ['month', 'this month'], ['all', 'all tracked']] as [key, label]}
          <a href={hrefFor(key as Preset | 'all')} class:active={selected(key as Preset | 'all')}>{label}</a>
        {/each}
      </nav>
      <form method="GET" class="custom-range">
        <label><span>from</span><input type="date" name="from" value={data.dashboard.range.from} min={data.bounds.firstDay} max={data.bounds.lastDay} /></label>
        <span class="range-arrow">→</span>
        <label><span>to</span><input type="date" name="to" value={data.dashboard.range.to} min={data.bounds.firstDay} max={data.bounds.lastDay} /></label>
        <button type="submit">apply</button>
      </form>
    </section>

    {#if summary.calls === 0}
      <section class="empty-state">
        {#if coverage.state === 'unavailable'}
          <p class="eyebrow">range not covered</p>
          <h2>no data yet.</h2>
          <p>the publisher has only checked through {coverage.throughDay ?? 'no date yet'}; this range is unknown, not zero.</p>
        {:else}
          <p class="eyebrow">measured zero usage</p>
          <h2>this range is quiet.</h2>
          <p>the publisher covered this range and found no usage events between {data.dashboard.range.from} and {data.dashboard.range.to}.</p>
        {/if}
      </section>
    {:else}
      <section class="metrics" aria-label="usage summary">
        <article>
          <p>{summary.incompleteEvents ? 'known subtotal' : 'spend'}</p>
          <strong>{formatMoney(summary.knownCostNanos)}</strong>
          <small>{summary.incompleteEvents ? `${summary.incompleteEvents} incomplete pricing events` : 'priced from captured usage'}</small>
        </article>
        <article>
          <p>api calls</p>
          <strong>{formatNumber(summary.calls)}</strong>
          <small>{formatNumber(Math.round(summary.calls / Math.max(daily.length, 1)))} per active day</small>
        </article>
        <article>
          <p>processed</p>
          <strong>{formatTokens(summary.processedTokens)}</strong>
          <small>{formatTokens(summary.outputTokens)} output</small>
        </article>
        <article>
          <p>cache coverage</p>
          <strong>{formatPercent(summary.cacheRate)}</strong>
          <small>{formatTokens(summary.cachedInputTokens)} cached input</small>
        </article>
      </section>

      {#if summary.incompleteEvents}
        <aside class="pricing-notice" aria-label="incomplete pricing warning">
          <strong>known subtotal only</strong>
          <span>{summary.incompleteEvents} events have incomplete pricing. the displayed spend is a lower bound, not a total.</span>
        </aside>
      {/if}

      <section class="primary-grid">
        <article class="panel trend-panel">
          <div class="panel-head">
            <div><p class="eyebrow">daily known spend</p><h2>cost pulse</h2></div>
            <p>{data.dashboard.range.from}<span>→</span>{data.dashboard.range.to}</p>
          </div>
          <div class="trend-chart">
            <div class="trend-scale" aria-hidden="true"><span>{formatMoney(trend.max)}</span><span>{formatMoney(trend.max / 2)}</span><span>$0</span></div>
            <svg viewBox="0 0 1000 280" preserveAspectRatio="none" role="img" aria-label="daily known spend trend">
              <defs>
                <pattern id="dither" width="12" height="12" patternUnits="userSpaceOnUse">
                  <circle cx="2" cy="2" r="1.15" fill="var(--accent)" />
                </pattern>
              </defs>
              <line x1="0" y1="260" x2="1000" y2="260" class="axis" />
              <path d={trend.area} fill="url(#dither)" class="area" />
              <path d={trend.line} class="line" />
              {#each trend.points as [x, y], index}
                <circle class="point" cx={x} cy={y} r="4"><title>{daily[index].day}: {formatMoney(daily[index].knownCostNanos)}</title></circle>
              {/each}
            </svg>
          </div>
          <div class="trend-labels">
            {#each daily as item, index}
              <div style={`left: ${daily.length === 1 ? 50 : (index / (daily.length - 1)) * 100}%`} title={`${item.day}: ${formatMoney(item.knownCostNanos)}`}>
                <span></span><small>{item.day.slice(5)}</small>
              </div>
            {/each}
          </div>
        </article>

        <article class="panel hourly-panel">
          <div class="panel-head"><div><p class="eyebrow">local time · ist</p><h2>hourly rhythm</h2></div></div>
          <div class="hour-bars" aria-label="calls by hour">
            {#each hours as item}
              <div class="hour" title={`${String(item.hour).padStart(2, '0')}:00 · ${formatNumber(item.calls)} calls`}>
                <span style={`height: ${Math.max((item.calls / maxHour) * 100, item.calls ? 4 : 1)}%`}></span>
                {#if item.hour % 6 === 0}<small>{String(item.hour).padStart(2, '0')}</small>{/if}
              </div>
            {/each}
          </div>
          <p class="hour-note">activity is aggregated across the selected days</p>
        </article>
      </section>

      <section class="breakdown-grid">
        <article class="panel list-panel">
          <div class="panel-head"><div><p class="eyebrow">what ran</p><h2>models</h2></div></div>
          <div class="bars">
            {#each models as item}
              <div class="bar-row">
                <div class="bar-label"><span>{item.model}</span><small>{formatNumber(item.calls)} {item.calls === 1 ? 'call' : 'calls'}</small></div>
                <div class="bar-track"><span style={`width: ${(item.knownCostNanos / maxModel) * 100}%`}></span></div>
                <strong>{formatMoney(item.knownCostNanos)}</strong>
              </div>
            {/each}
          </div>
        </article>

        <article class="panel list-panel">
          <div class="panel-head"><div><p class="eyebrow">where it ran</p><h2>sources</h2></div></div>
          <div class="bars">
            {#each sources as item}
              <div class="bar-row">
                <div class="bar-label"><span>{item.source}</span><small>{formatNumber(item.calls)} {item.calls === 1 ? 'call' : 'calls'}</small></div>
                <div class="bar-track"><span style={`width: ${(item.knownCostNanos / maxSource) * 100}%`}></span></div>
                <strong>{formatMoney(item.knownCostNanos)}</strong>
              </div>
            {/each}
          </div>
        </article>
      </section>

      <section class="panel sessions-panel">
        <div class="panel-head">
          <div><p class="eyebrow">top twenty by known spend</p><h2>expensive sessions</h2></div>
          <p>{sessions.length} shown</p>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>session</th><th>source</th><th>calls</th><th>known spend</th></tr></thead>
            <tbody>
              {#each sessions as item}
                <tr>
                  <td><span class="session-title">{item.title ?? 'untitled session'}</span><small>{item.sessionKey}</small></td>
                  <td><span class="source-tag">{item.source}</span></td>
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

  <footer>
    <span>local usage facts · calculated pricing</span>
    <span>latest ingest {formatTimestamp(status.generatedAtMs)}</span>
  </footer>
</div>
