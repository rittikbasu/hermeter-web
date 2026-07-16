<script lang="ts">
  import { type SeriesProps, useChartPart } from "./chart-context.svelte"
  import { getChartLayer } from "./layer-context"
  import { setSeries } from "./series-context"

  /**
   * One bar series. The dithered bars are painted on the canvas; this registers
   * the series and (when `isClickable`) lays transparent hit rects over each bar
   * - using the shared `barSlot` geometry so clicks line up with the pixels - to
   * select the series. The Legend offers the same toggle accessibly.
   */
  let {
    dataKey,
    variant = "gradient",
    strokeVariant = "solid",
    isClickable = false,
    children,
  }: SeriesProps = $props()

  const layer = getChartLayer()
  const ctx = useChartPart("Bar", "bar")

  setSeries({
    get dataKey() {
      return dataKey
    },
    get seed() {
      return ctx.seedOf(dataKey)
    },
    get dimmed() {
      return ctx.selectedDataKey !== null && ctx.selectedDataKey !== dataKey
    },
  })

  // One-shot dev warning at init.
  // svelte-ignore state_referenced_locally
  if (import.meta.env.DEV && layer === "svg" && !ctx.config[dataKey]) {
    // svelte-ignore state_referenced_locally
    console.warn(
      `<Bar dataKey="${dataKey}" />: "${dataKey}" is not in the chart \`config\`. Add it so the series has a colour and label.`
    )
  }

  $effect(() => {
    if (layer !== "svg") return
    ctx.registerSeries({ dataKey, kind: "bar", variant, strokeVariant })
    return () => ctx.unregisterSeries(dataKey)
  })

  const band = $derived(ctx.bands[dataKey])
  const si = $derived(ctx.configKeys.indexOf(dataKey))
  const n = $derived(ctx.configKeys.length)

  const onclick = () =>
    ctx.selectDataKey(ctx.selectedDataKey === dataKey ? null : dataKey)
</script>

{#if layer === "svg" && ctx.ready && band}
  {#if isClickable}
    {#each band as b, i}
      {@const slot = ctx.barSlot(i, si, n)}
      {@const top = ctx.y(b[1])}
      {@const base = ctx.y(b[0])}
      <!-- progressive enhancement; the Legend offers the same toggle accessibly -->
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <rect
        x={slot.x}
        y={Math.min(top, base)}
        width={slot.width}
        height={Math.abs(base - top)}
        fill="transparent"
        style:cursor="pointer"
        {onclick}
      />
    {/each}
  {/if}
  {@render children?.()}
{/if}
