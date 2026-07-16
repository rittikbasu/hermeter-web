<script lang="ts">
  import { useChartPart } from "./chart-context.svelte"
  import { getChartLayer } from "./layer-context"

  let {
    tickFormatter,
    tickCount = 4,
    tickMargin = 8,
  }: {
    tickFormatter?: (value: number) => string
    tickCount?: number
    tickMargin?: number
  } = $props()

  const layer = getChartLayer()
  const ctx = useChartPart("YAxis")
</script>

{#if layer === "svg" && ctx.ready}
  <g class="fill-current font-mono text-[10px] text-muted-foreground">
    {#each ctx.y.ticks(tickCount) as t (t)}
      <text
        x={-tickMargin}
        y={ctx.y(t)}
        text-anchor="end"
        dominant-baseline="central"
        fill="currentColor"
      >
        {tickFormatter ? tickFormatter(t) : t}
      </text>
    {/each}
  </g>
{/if}
