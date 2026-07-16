<script module lang="ts">
  export type TooltipVariant = "default" | "frosted-glass"

  const VARIANT: Record<TooltipVariant, string> = {
    default: "bg-popover",
    "frosted-glass": "bg-popover/70 backdrop-blur-sm",
  }
</script>

<script lang="ts">
  import { Spring } from "svelte/motion"
  import { fade } from "svelte/transition"
  import { useCommonChart } from "./common-context"
  import { getChartLayer } from "./layer-context"
  import { cn } from "./lib"
  import { rgb } from "./palette"

  /**
   * Floating hover tooltip. Reads the shared common context so it works in
   * every chart family. It glides between points and fades in/out, and dims
   * unselected series/slices.
   */
  let {
    labelKey,
    valueFormatter,
    variant = "default",
  }: {
    labelKey?: string
    valueFormatter?: (value: number, name: string) => string
    variant?: TooltipVariant
  } = $props()

  const layer = getChartLayer()
  const chart = useCommonChart()
  const show = $derived(chart.ready && chart.hoverIndex != null)

  // Retain the last hovered index so the card keeps its content while fading out.
  let lastIndex = 0
  const index = $derived.by(() => {
    if (chart.hoverIndex != null) lastIndex = chart.hoverIndex
    return lastIndex
  })

  const heading = $derived(chart.heading(index, labelKey))
  const items = $derived(chart.itemsAt(index))

  // Gliding position: snaps into place on (re)entry, springs between points
  // while visible, and freezes while fading out.
  const pos = new Spring({ top: 0, left: 0 }, { stiffness: 0.3, damping: 0.8 })
  let wasShown = false
  $effect.pre(() => {
    if (layer !== "dom") return
    if (!show) {
      wasShown = false
      return
    }
    const target = { top: chart.tooltipTop, left: chart.tooltipLeft }
    if (wasShown) {
      pos.target = target
    } else {
      wasShown = true
      pos.set(target, { instant: true })
    }
  })
</script>

{#if layer === "dom" && show && items.length > 0}
  <div
    transition:fade={{ duration: 130 }}
    class={cn(
      "pointer-events-none absolute z-10 rounded-md border px-2 py-1 shadow-sm",
      VARIANT[variant]
    )}
    style:top="{pos.current.top}px"
    style:left="{pos.current.left}px"
    style:transform="translate(-50%, -115%)"
  >
    {#if heading}
      <div class="mb-0.5 font-mono text-[10px] text-muted-foreground">
        {heading}
      </div>
    {/if}
    <div class="flex flex-col gap-0.5">
      {#each items as item (item.name)}
        <div
          class="flex items-center gap-1.5 font-mono text-[11px] text-popover-foreground tabular-nums"
          style:opacity={item.dimmed ? 0.4 : 1}
        >
          <span
            class="size-2 rounded-[1px]"
            style:background-color={rgb(item.seed.fill)}
          ></span>
          <span class="text-muted-foreground">{item.label}</span>
          <span class="ml-auto pl-2 text-foreground">
            {valueFormatter
              ? valueFormatter(item.value, item.name)
              : item.value.toLocaleString()}
          </span>
        </div>
      {/each}
    </div>
  </div>
{/if}
