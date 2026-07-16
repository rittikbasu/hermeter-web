<script lang="ts">
  import { untrack } from "svelte"
  import { startBarLoop, type Bars } from "./bar-loop"
  import { useChart } from "./chart-context.svelte"
  import { backingSize, bloomLayerStyle } from "./dither-paint"

  /**
   * Dither canvas for bar charts. Each category owns a band; grouped series
   * split it into side-by-side bars, stacked series share its full width and
   * pile in y. Bars grow up from their base in a staggered left-to-right wave.
   */
  const ctx = useChart()

  let canvasEl = $state<HTMLCanvasElement | null>(null)
  let bloomEl = $state<HTMLCanvasElement | null>(null)

  const backing = $derived(backingSize(ctx.plot.width, ctx.plot.height))
  const cols = $derived(backing.cols)
  const rows = $derived(backing.rows)

  // Per-series target bar tops/bases (backing rows) over the data indices.
  const targets = $derived.by(() => {
    const out: Record<string, Bars> = {}
    if (!ctx.ready) return out
    const h = ctx.plot.height || 1
    for (const key of ctx.configKeys) {
      const band = ctx.bands[key]
      if (!band) continue
      out[key] = {
        top: band.map((b) => (ctx.y(b[1]) / h) * (rows - 1)),
        base: band.map((b) => (ctx.y(b[0]) / h) * (rows - 1)),
      }
    }
    return out
  })

  const stateRef = { current: ctx }
  const targetsRef = {
    get current() {
      return targets
    },
  }

  $effect(() => {
    const canvas = canvasEl
    const bloomCanvas = bloomEl
    const c = cols
    const r = rows
    const w = ctx.plot.width
    if (!canvas) return
    return untrack(() =>
      startBarLoop({
        canvas,
        bloomCanvas,
        cols: c,
        rows: r,
        width: w,
        state: stateRef,
        targets: targetsRef,
      })
    )
  })

  const bloomActive = $derived(
    ctx.bloomOnHover ? ctx.isMouseInChart || ctx.hovered : true
  )
  const bloom = $derived(bloomLayerStyle(ctx.bloom, bloomActive))
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
