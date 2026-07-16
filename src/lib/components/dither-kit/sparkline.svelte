<script lang="ts">
  import AreaChart from "./area-chart.svelte"
  import Area from "./area.svelte"
  import type { AreaVariant, ChartConfig } from "./chart-context.svelte"
  import type { BloomInput } from "./dither-paint"
  import type { DitherColor } from "./palette"

  /**
   * Thin wrapper over {@link AreaChart} for the decorative-sparkline case: a
   * single `number[]` series, no axes/grid/tooltip, no scrub crosshair (unless
   * a `markerIndex` is supplied). Keeps the hover brightness lift.
   */
  let {
    data,
    color,
    variant = "gradient",
    markerIndex = null,
    hovered = false,
    bloom = "off",
    bloomOnHover = false,
    animate = false,
    class: className,
  }: {
    /** Plain numeric series - the common sparkline case. */
    data: number[]
    color: DitherColor
    variant?: AreaVariant
    /** Controlled crosshair position (e.g. a committed point). */
    markerIndex?: number | null
    /** Parent-driven hover (e.g. the whole card/row) - lifts the fill. */
    hovered?: boolean
    /** Glow on the dither fill. */
    bloom?: BloomInput
    /** Only bloom while hovered. */
    bloomOnHover?: boolean
    /** Play the entrance sweep - off by default for a calm spark. */
    animate?: boolean
    class?: string
  } = $props()

  // `rows` identity drives the entrance-replay revision, so it's derived from
  // `data` - it only recreates when the input array itself changes.
  const rows = $derived(data.map((v) => ({ v })))
  const config: ChartConfig = $derived({ v: { color } })
</script>

<AreaChart
  data={rows}
  {config}
  interactive={false}
  {animate}
  {markerIndex}
  {hovered}
  {bloom}
  {bloomOnHover}
  margins={{ top: 0, right: 0, bottom: 0, left: 0 }}
  class={className}
>
  <Area dataKey="v" {variant} />
</AreaChart>
