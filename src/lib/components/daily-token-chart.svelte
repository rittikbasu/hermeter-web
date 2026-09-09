<script lang="ts">
  import CartesianRoot from '$lib/components/dither-kit/cartesian-root.svelte';
  import DailyTokenCanvas from '$lib/components/dither-kit/daily-token-canvas.svelte';
  import Grid from '$lib/components/dither-kit/grid.svelte';
  import Tooltip from '$lib/components/dither-kit/tooltip.svelte';
  import XAxis from '$lib/components/dither-kit/x-axis.svelte';
  import YAxis from '$lib/components/dither-kit/y-axis.svelte';
  import type { ChartConfig } from '$lib/components/dither-kit/chart-context.svelte';
  import type { DitherColor } from '$lib/components/dither-kit/palette';
  import { formatDailyTokenTick, type DailyTokenSeries } from '$lib/daily-chart';
  import { formatExactTokens, formatPercent } from '$lib/format';

  export type DailyTokenChartPoint = DailyTokenSeries & {
    day: string;
    label: string;
    tooltipLabel: string;
  };

  type Props = {
    data: DailyTokenChartPoint[];
    primaryColor: DitherColor;
    uncachedColor: DitherColor;
    cacheRateColor: DitherColor;
    outputColor: DitherColor;
  };

  let { data, primaryColor, uncachedColor, cacheRateColor, outputColor }: Props = $props();

  const dailyTokenMargins = {
    top: 24,
    right: 20,
    bottom: 30,
    left: 54
  };
  const inputMaximum = $derived(Math.max(1, ...data.map((point) => point.input)));
  const chartConfig = $derived<ChartConfig>({
    input: { label: 'input total', color: primaryColor },
    uncachedInput: { label: 'uncached input cap', color: uncachedColor }
  });
  const tooltipConfig = $derived<ChartConfig>({
    input: { label: 'input total', color: primaryColor },
    uncachedInput: { label: 'uncached input', color: uncachedColor },
    cacheRate: { label: 'cache coverage', color: cacheRateColor },
    output: { label: 'output tokens', color: outputColor }
  });

  function formatTooltipValue(value: number | null, name: string): string {
    if (value === null) return '—';
    return name === 'cacheRate' ? formatPercent(value * 100) : formatExactTokens(value);
  }
</script>

<div class="daily-token-visual">
  <div class="daily-token-plot">
    <CartesianRoot
      chartType="bar"
      Canvas={DailyTokenCanvas}
      data={data}
      config={chartConfig}
      tooltipConfig={tooltipConfig}
      domainMax={inputMaximum}
      margins={dailyTokenMargins}
      bloom="low"
      animationDuration={650}
    >
      <Grid strokeDasharray="2 5" />
      <YAxis tickCount={4} tickFormatter={formatDailyTokenTick} />
      <XAxis dataKey="label" maxTicks={7} minTickSpacing={36} />
      <Tooltip labelKey="tooltipLabel" valueFormatter={formatTooltipValue} />
    </CartesianRoot>
  </div>
</div>

<style>
  .daily-token-visual {
    height: 100%;
    min-width: 0;
  }

  .daily-token-plot {
    position: relative;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }
</style>
