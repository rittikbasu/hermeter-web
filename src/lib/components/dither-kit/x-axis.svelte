<script lang="ts">
  import { useChartPart } from "./chart-context.svelte"
  import { getChartLayer } from "./layer-context"

  let {
    dataKey,
    tickFormatter,
    tickMargin = 8,
    maxTicks = 8,
  }: {
    dataKey?: string
    tickFormatter?: (value: unknown, index: number) => string
    tickMargin?: number
    maxTicks?: number
  } = $props()

  const layer = getChartLayer()
  const ctx = useChartPart("XAxis")

  const step = $derived(Math.max(1, Math.ceil(ctx.dataLength / maxTicks)))
  const y = $derived(ctx.plot.height + tickMargin)
</script>

{#if layer === "svg" && ctx.ready}
  <g class="fill-current font-mono text-[10px] text-muted-foreground">
    {#each ctx.data as row, i}
      {#if i % step === 0}
        {@const raw = dataKey ? row[dataKey] : i}
        <text
          x={ctx.xCenter(i) ?? 0}
          {y}
          text-anchor="middle"
          dominant-baseline="hanging"
          fill="currentColor"
        >
          {tickFormatter ? tickFormatter(raw, i) : String(raw ?? "")}
        </text>
      {/if}
    {/each}
  </g>
{/if}
