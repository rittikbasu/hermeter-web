<script lang="ts" generics="TData extends object">
  import type { Component, Snippet } from "svelte"
  import type { Margins } from "./chart-context.svelte"
  import { ChartDimensions } from "./chart-dimensions.svelte"
  import { setCommonChart } from "./common-context"
  import LayerPass from "./layer-pass.svelte"
  import { cn } from "./lib"
  import { axisAtAngle, sliceAtAngle } from "./polar"
  import {
    type PieChartProps,
    PolarChartState,
    setPolarContext,
  } from "./polar-context.svelte"

  const DEFAULT_POLAR_MARGINS: Margins = {
    top: 22,
    right: 14,
    bottom: 14,
    left: 14,
  }

  /**
   * Shared root for the polar dither charts (pie, radar). Owns the measured
   * size, the polar context, and angular pointer interaction. Back chrome
   * (`backDecoration`, e.g. the radar frame) sits behind the dither canvas;
   * front chrome and the DOM legend/tooltip layer on top via the layer passes.
   */
  let {
    chartType,
    Canvas,
    backDecoration,
    data,
    config,
    children,
    dataKey,
    nameKey,
    innerRadius = 0,
    margins: marginsProp,
    class: className,
    animate = true,
    animationDuration = 900,
    replayToken = 0,
    bloom = "off",
    bloomOnHover = false,
    defaultSelectedDataKey = null,
    onSelectionChange,
  }: PieChartProps<TData> & {
    chartType: "pie" | "radar"
    /** Family painter - `PieCanvas` or `RadarCanvas`; ships with each chart. */
    Canvas: Component
    /** Extra back-layer SVG content (e.g. the radar frame). */
    backDecoration?: Snippet
  } = $props()

  let el = $state<HTMLDivElement | null>(null)
  const dims = new ChartDimensions()
  const margins = $derived({ ...DEFAULT_POLAR_MARGINS, ...marginsProp })

  const chart = new PolarChartState(
    () => ({
      chartType,
      // Safe: the controller only reads row[key] for the configured keys.
      data: data as Record<string, unknown>[],
      config,
      dataKey,
      nameKey,
      innerRadiusRatio: innerRadius,
      dimensions: { width: dims.width, height: dims.height },
      margins,
      animate,
      animationDuration,
      replayToken,
      bloom,
      bloomOnHover,
      onSelectionChange,
    }),
    // Initial value by design.
    // svelte-ignore state_referenced_locally
    defaultSelectedDataKey
  )
  setPolarContext(chart)
  setCommonChart(chart.common)

  const onMove = (clientX: number, clientY: number) => {
    if (!el) return
    const rect = el.getBoundingClientRect()
    const dx = clientX - rect.left - margins.left - chart.center.x
    const dy = clientY - rect.top - margins.top - chart.center.y
    const angle = Math.atan2(dy, dx)
    const r = Math.hypot(dx, dy)
    if (chartType === "pie" && chart.pie) {
      const inside = r <= chart.outerRadius && r >= chart.innerRadius
      const i = inside ? sliceAtAngle(chart.pie, angle) : -1
      chart.setHoverIndex(i >= 0 ? i : null)
    } else if (chart.radar) {
      chart.setHoverIndex(axisAtAngle(chart.radar.axes, angle))
    }
    chart.setCursor(clientX - rect.left, clientY - rect.top)
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  bind:this={el}
  {@attach dims.attach}
  class={cn("relative h-full w-full", className)}
  onpointerenter={() => chart.setMouseInChart(true)}
  onpointermove={(e) => onMove(e.clientX, e.clientY)}
  onpointerleave={() => {
    chart.setMouseInChart(false)
    chart.setHoverIndex(null)
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
        <LayerPass layer="back" children={backDecoration} />
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
