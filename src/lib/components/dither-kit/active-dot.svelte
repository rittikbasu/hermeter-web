<script lang="ts">
  import { useChart } from "./chart-context.svelte"
  import { dotPaint, type DotVariant } from "./dot.svelte"
  import { getChartLayer } from "./layer-context"
  import { rgb } from "./palette"
  import { useSeries } from "./series-context"

  /** A single marker at the hovered point - keys off the shared hover index. */
  let {
    variant = "colored-border",
    r = 3,
  }: { variant?: DotVariant; r?: number } = $props()

  const layer = getChartLayer()
  const ctx = useChart()
  const series = useSeries("ActiveDot")

  const band = $derived(ctx.bands[series.dataKey])
  const b = $derived(ctx.hoverIndex != null ? band?.[ctx.hoverIndex] : null)
  const paint = $derived(dotPaint(variant, series.seed))
  const cx = $derived(ctx.hoverIndex != null ? ctx.xCenter(ctx.hoverIndex) : 0)
</script>

{#if layer === "svg" && ctx.ready && band && ctx.hoverIndex != null && ctx.entranceDone && b}
  {@const cy = ctx.y(b[1])}
  <g>
    <!-- Soft halo so the active point is unmistakable over the dither. -->
    <circle {cx} {cy} r={r + 3} fill={rgb(series.seed.line, 1, 0.18)} />
    <circle
      {cx}
      {cy}
      {r}
      fill={paint.fill}
      stroke={paint.stroke}
      stroke-width={2}
    />
  </g>
{/if}
