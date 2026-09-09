<script lang="ts">
  import { useChartPart } from "./chart-context.svelte"
  import { getChartLayer } from "./layer-context"
  import { tickIndexes } from "./scales"

  let {
    dataKey,
    tickFormatter,
    tickMargin = 8,
    maxTicks = 8,
    minTickSpacing = 0,
  }: {
    dataKey?: string
    tickFormatter?: (value: unknown, index: number) => string
    tickMargin?: number
    maxTicks?: number
    minTickSpacing?: number
  } = $props()

  const layer = getChartLayer()
  const ctx = useChartPart("XAxis")

  const indexes = $derived.by(() => {
    let count = Math.min(ctx.dataLength, maxTicks)
    if (minTickSpacing > 0) {
      while (count > 2) {
        const candidate = tickIndexes(ctx.dataLength, count)
        const minimumGap = Math.min(
          ...candidate.slice(1).map((index, i) =>
            ctx.xCenter(index) - ctx.xCenter(candidate[i])
          )
        )
        if (minimumGap >= minTickSpacing) return candidate
        count -= 1
      }
    }
    return tickIndexes(ctx.dataLength, count)
  })
  const y = $derived(ctx.plot.height + tickMargin)
</script>

{#if layer === "svg" && ctx.ready}
  <g class="fill-current font-mono text-[10px] text-muted-foreground">
    {#each indexes as i}
      {@const row = ctx.data[i]}
      {@const raw = dataKey ? row?.[dataKey] : i}
      <text
        x={ctx.xCenter(i) ?? 0}
        {y}
        text-anchor="middle"
        dominant-baseline="hanging"
        fill="currentColor"
      >
        {tickFormatter ? tickFormatter(raw, i) : String(raw ?? "")}
      </text>
    {/each}
  </g>
{/if}
