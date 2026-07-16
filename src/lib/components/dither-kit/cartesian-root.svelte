<script lang="ts" generics="TData extends object">
  import type { Component } from "svelte"
  import {
    CartesianChartState,
    type CartesianChartProps,
    type ChartType,
    type Margins,
    setChartContext,
  } from "./chart-context.svelte"
  import { ChartDimensions } from "./chart-dimensions.svelte"
  import { setCommonChart } from "./common-context"
  import LayerPass from "./layer-pass.svelte"
  import { cn } from "./lib"

  const DEFAULT_MARGINS: Margins = {
    top: 10,
    right: 12,
    bottom: 22,
    left: 36,
  }

  /**
   * Shared root for the cartesian dither charts (area, line, bar). Owns the
   * measured size, the shared context, and pointer interaction; every visual is
   * composed as children. Back chrome (grid) sits behind the dither canvas; the
   * canvas paints the fill/line/bars + stars; front chrome (axes, dots) and DOM
   * legend/tooltip layer on top. `chartType` drives the scales/interaction and
   * the `Canvas` prop supplies the family's painter (continuous for area/line,
   * bars for bar) - so each chart ships only its own canvas. The `children`
   * snippet is rendered once per layer; each part self-selects its pass (see
   * layer-context.ts).
   */
  let {
    chartType,
    Canvas,
    data,
    config,
    children,
    stackType = "default",
    margins: marginsProp,
    class: className,
    animate = true,
    animationDuration = 900,
    replayToken = 0,
    interactive = true,
    markerIndex = null,
    hovered = false,
    bloom = "off",
    bloomOnHover = false,
    onHoverChange,
    defaultSelectedDataKey = null,
    onSelectionChange,
  }: CartesianChartProps<TData> & {
    chartType: ChartType
    Canvas: Component
  } = $props()

  let el = $state<HTMLDivElement | null>(null)
  const dims = new ChartDimensions()
  const margins = $derived({ ...DEFAULT_MARGINS, ...marginsProp })

  const chart = new CartesianChartState(
    () => ({
      chartType,
      // Safe: the controller only reads row[key] for the configured series keys.
      data: data as Record<string, unknown>[],
      config,
      stackType,
      dimensions: { width: dims.width, height: dims.height },
      margins,
      animate,
      animationDuration,
      replayToken,
      markerIndex,
      hovered,
      bloom,
      bloomOnHover,
      onSelectionChange,
    }),
    // Initial value by design.
    // svelte-ignore state_referenced_locally
    defaultSelectedDataKey
  )
  setChartContext(chart)
  setCommonChart(chart.common)

  const onMove = (clientX: number) => {
    if (!el) return
    const rect = el.getBoundingClientRect()
    const px = clientX - rect.left - margins.left
    const index = chart.indexAtX(px)
    chart.setHoverIndex(index)
    chart.setCursorX(clientX - rect.left)
    onHoverChange?.(index)
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  bind:this={el}
  {@attach dims.attach}
  class={cn("relative h-full w-full", className)}
  onpointerenter={() => chart.setMouseInChart(true)}
  onpointermove={interactive ? (e) => onMove(e.clientX) : undefined}
  onpointerleave={() => {
    chart.setMouseInChart(false)
    chart.setHoverIndex(null)
    onHoverChange?.(null)
  }}
>
  {#if chart.ready}
    <svg
      width={dims.width}
      height={dims.height}
      class="absolute inset-0 overflow-visible"
      aria-hidden="true"
      role="presentation"
    >
      <g transform="translate({margins.left},{margins.top})">
        <LayerPass layer="back" {children} />
      </g>
    </svg>
  {/if}
  <Canvas />
  {#if chart.ready}
    <svg
      width={dims.width}
      height={dims.height}
      class="absolute inset-0 overflow-visible"
      role="img"
      aria-label="Chart"
    >
      <g transform="translate({margins.left},{margins.top})">
        <LayerPass layer="svg" {children} />
      </g>
    </svg>
  {/if}
  <LayerPass layer="dom" {children} />
</div>
