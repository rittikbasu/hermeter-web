<script lang="ts">
  import { untrack } from "svelte"
  import { backingSize, bloomLayerStyle } from "./dither-paint"
  import { startPieLoop } from "./pie-loop"
  import { usePolarChart } from "./polar-context.svelte"

  /** Dither canvas for pie / donut charts - see pie-loop.ts for the painter. */
  const ctx = usePolarChart()

  let canvasEl = $state<HTMLCanvasElement | null>(null)
  let bloomEl = $state<HTMLCanvasElement | null>(null)

  const backing = $derived(backingSize(ctx.plot.width, ctx.plot.height))
  const cols = $derived(backing.cols)
  const rows = $derived(backing.rows)

  const stateRef = { current: ctx }

  $effect(() => {
    const canvas = canvasEl
    const bloomCanvas = bloomEl
    const c = cols
    const r = rows
    const w = ctx.plot.width
    const h = ctx.plot.height
    if (!canvas) return
    return untrack(() =>
      startPieLoop({
        canvas,
        bloomCanvas,
        cols: c,
        rows: r,
        width: w,
        height: h,
        state: stateRef,
      })
    )
  })

  const bloom = $derived(
    bloomLayerStyle(ctx.bloom, ctx.bloomOnHover ? ctx.isMouseInChart : true)
  )
</script>

<canvas
  bind:this={canvasEl}
  class="pointer-events-none absolute"
  style:left="{ctx.margins.left}px"
  style:top="{ctx.margins.top}px"
  style:width="{ctx.plot.width}px"
  style:height="{ctx.plot.height}px"
  style:image-rendering="pixelated"
></canvas>
<canvas
  bind:this={bloomEl}
  class="pointer-events-none absolute"
  style:left="{ctx.margins.left}px"
  style:top="{ctx.margins.top}px"
  style:width="{ctx.plot.width}px"
  style:height="{ctx.plot.height}px"
  style:transition="opacity 220ms ease"
  style:filter={bloom?.filter}
  style:opacity={bloom?.opacity ?? 0}
  style:mix-blend-mode={bloom?.mixBlendMode}
  style:image-rendering={bloom?.imageRendering}
></canvas>
