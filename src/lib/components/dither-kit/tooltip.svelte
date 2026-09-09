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
    valueFormatter?: (value: number | null, name: string) => string
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
  const horizontalTransform = $derived(
    chart.tooltipAlign === "start"
      ? "0%"
      : chart.tooltipAlign === "end"
        ? "-100%"
        : "-50%"
  )

  // Gliding position: snaps into place on (re)entry, springs between points
  // while visible, and freezes while fading out.
  const pos = new Spring({ top: 0, left: 0 }, { stiffness: 0.3, damping: 0.8 })
  let wasShown = false
  let tooltipElement = $state<HTMLDivElement | null>(null)
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

  $effect(() => {
    const element = tooltipElement
    if (layer !== "dom" || !show || !element) return

    const anchor = chart.tooltipLeft
    const alignment = horizontalTransform
    const update = () => {
      const parent = element.parentElement
      if (!parent) return
      const width = element.offsetWidth
      const rawLeft =
        alignment === "0%"
          ? anchor
          : alignment === "-100%"
            ? anchor - width
            : anchor - width / 2
      const maxLeft = Math.max(8, parent.clientWidth - width - 8)
      const left = Math.min(maxLeft, Math.max(8, rawLeft))
      pos.target = { top: chart.tooltipTop, left }
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    if (element.parentElement) observer.observe(element.parentElement)
    return () => observer.disconnect()
  })
</script>

{#if layer === "dom" && show && items.length > 0}
  <div
    bind:this={tooltipElement}
    transition:fade={{ duration: 130 }}
    class={cn(
      "chart-tooltip pointer-events-none absolute z-10 rounded-md border px-2 py-1 shadow-sm",
      VARIANT[variant]
    )}
    style:top="{pos.current.top}px"
    style:left="{pos.current.left}px"
    style:transform={`translateY(${items.length > 1 ? "-50%" : "-115%"})`}
  >
    {#if heading}
      <div class="mb-0.5 font-mono text-[10px] text-muted-foreground">
        {heading}
      </div>
    {/if}
    <div class="flex flex-col gap-0.5">
      {#each items as item (item.name)}
        <div
          class="chart-tooltip-row flex min-w-0 items-center gap-1.5 font-mono text-[11px] text-popover-foreground tabular-nums"
          style:opacity={item.dimmed ? 0.4 : 1}
        >
          <span
            class="size-2 shrink-0 rounded-[1px]"
            style:background-color={rgb(item.seed.fill)}
          ></span>
          <span class="chart-tooltip-label min-w-0 flex-1 whitespace-normal break-words text-muted-foreground">{item.label}</span>
          <span class="chart-tooltip-value ml-auto shrink-0 whitespace-nowrap pl-2 text-foreground">
            {valueFormatter
              ? valueFormatter(item.value, item.name)
              : item.value?.toLocaleString() ?? "—"}
          </span>
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  :global(.chart-tooltip) {
    box-sizing: border-box;
    max-width: calc(100% - 16px);
    width: max-content;
  }

  :global(.chart-tooltip-row) {
    min-width: 0;
  }

  :global(.chart-tooltip-label) {
    overflow-wrap: anywhere;
  }

</style>
