<script module lang="ts">
  import { rgb, type Seed } from "./palette"

  export type DotVariant = "border" | "colored-border" | "filled"

  export function dotPaint(variant: DotVariant, seed: Seed) {
    switch (variant) {
      case "colored-border":
        return {
          fill: "var(--card, #0b0b0c)",
          stroke: rgb(seed.line),
          strokeWidth: 1.5,
        }
      case "filled":
        return { fill: rgb(seed.star), stroke: rgb(seed.line), strokeWidth: 1 }
      default:
        return {
          fill: "var(--card, #0b0b0c)",
          stroke: rgb(seed.star, 0.8),
          strokeWidth: 1,
        }
    }
  }
</script>

<script lang="ts">
  import { useChart } from "./chart-context.svelte"
  import { getChartLayer } from "./layer-context"
  import { useSeries } from "./series-context"

  /** A marker at every data point along the series' top line. */
  let { variant = "border", r = 2 }: { variant?: DotVariant; r?: number } =
    $props()

  const layer = getChartLayer()
  const ctx = useChart()
  const series = useSeries("Dot")

  const band = $derived(ctx.bands[series.dataKey])
  const paint = $derived(dotPaint(variant, series.seed))
</script>

{#if layer === "svg" && ctx.ready && band}
  <!-- Fade in once the fill has drawn so dots don't float over the entrance. -->
  <g
    style:opacity={ctx.entranceDone ? 1 : 0}
    style:transition="opacity 300ms ease"
  >
    {#each band as b, i}
      <circle
        cx={ctx.xCenter(i) ?? 0}
        cy={ctx.y(b[1])}
        {r}
        fill={paint.fill}
        stroke={paint.stroke}
        stroke-width={paint.strokeWidth}
      />
    {/each}
  </g>
{/if}
