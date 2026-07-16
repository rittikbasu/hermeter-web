<script lang="ts">
  import {
    type SeriesKind,
    type SeriesProps,
    useChartPart,
  } from "./chart-context.svelte"
  import { getChartLayer } from "./layer-context"
  import { setSeries } from "./series-context"

  /**
   * Shared implementation for the continuous series (`<Area>`, `<Line>`). The
   * dithered fill/line is painted on the canvas; this registers the series so
   * the canvas knows how to draw it, wires click-to-select via a transparent
   * band polygon, and exposes the series to child `<Dot>`/`<ActiveDot>`
   * markers. Renders (and registers) only in the front `svg` layer pass.
   */
  let {
    part,
    kind,
    dataKey,
    variant = "gradient",
    strokeVariant = "solid",
    isClickable = false,
    children,
  }: SeriesProps & { part: string; kind: SeriesKind } = $props()

  const layer = getChartLayer()
  // part/kind are static per instance - the boundary guard runs once at init.
  // svelte-ignore state_referenced_locally
  const ctx = useChartPart(part, kind === "line" ? "line" : "area")

  setSeries({
    get dataKey() {
      return dataKey
    },
    get seed() {
      return ctx.seedOf(dataKey)
    },
    get dimmed() {
      const emphasis = ctx.selectedDataKey ?? ctx.focusDataKey
      return emphasis !== null && emphasis !== dataKey
    },
  })

  // One-shot dev warning at init.
  // svelte-ignore state_referenced_locally
  if (import.meta.env.DEV && layer === "svg" && !ctx.config[dataKey]) {
    // svelte-ignore state_referenced_locally
    console.warn(
      `<${part} dataKey="${dataKey}" />: "${dataKey}" is not in the chart \`config\`. Add it so the series has a colour and label.`
    )
  }

  // Register only in the svg pass - the other passes render nothing, and a
  // register per pass would unregister the spec when its pass tears down.
  $effect(() => {
    if (layer !== "svg") return
    ctx.registerSeries({ dataKey, kind, variant, strokeVariant })
    return () => ctx.unregisterSeries(dataKey)
  })

  const band = $derived(ctx.bands[dataKey])

  // Transparent hit polygon tracing the series' own band, so clicking a series
  // selects *that* series. The Legend offers the same toggle accessibly.
  // One pass out along the top edge, one pass back along the floor.
  const hitPath = $derived.by(() => {
    if (!isClickable || !band) return null
    const parts: string[] = []
    band.forEach((b, i) => {
      parts.push(`${i === 0 ? "M" : "L"}${ctx.xCenter(i)},${ctx.y(b[1])}`)
    })
    for (let i = band.length - 1; i >= 0; i -= 1) {
      parts.push(`L${ctx.xCenter(i)},${ctx.y(band[i][0])}`)
    }
    return `${parts.join(" ")} Z`
  })

  const onclick = () =>
    ctx.selectDataKey(ctx.selectedDataKey === dataKey ? null : dataKey)
</script>

{#if layer === "svg" && ctx.ready && band}
  {#if hitPath}
    <!-- progressive enhancement; the Legend offers the same toggle accessibly -->
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <path d={hitPath} fill="transparent" style:cursor="pointer" {onclick} />
  {/if}
  {@render children?.()}
{/if}
