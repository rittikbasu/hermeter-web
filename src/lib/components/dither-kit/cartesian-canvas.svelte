<script lang="ts">
  import { untrack } from "svelte"
  import { startCartesianLoop, type Star, type Surface } from "./cartesian-loop"
  import { useChart } from "./chart-context.svelte"
  import { backingSize, bloomLayerStyle, resample } from "./dither-paint"

  /**
   * Continuous dither canvas for area and line charts. Each series is reduced
   * to a `[top, floor]` band per backing column: areas fill from their value
   * line down to their floor; lines fill only a thin glow band hugging the
   * line. The shared `paintColumn` renders the ordered-dither scatter, capped
   * by the bright series line, with winking stars + scrub crosshair on top.
   */
  const ctx = useChart()

  let canvasEl = $state<HTMLCanvasElement | null>(null)
  let bloomEl = $state<HTMLCanvasElement | null>(null)

  const backing = $derived(backingSize(ctx.plot.width, ctx.plot.height))
  const cols = $derived(backing.cols)
  const rows = $derived(backing.rows)

  // Per-series target [top, floor] rows, resampled to `cols`.
  const targets = $derived.by(() => {
    const out: Record<string, Surface> = {}
    if (!ctx.ready) return out
    const h = ctx.plot.height || 1
    const glow = Math.max(6, Math.round(rows * 0.16))
    const defaultKind = ctx.chartType === "line" ? "line" : "area"
    for (const key of ctx.configKeys) {
      const band = ctx.bands[key]
      if (!band) continue
      const line = (ctx.seriesSpecs[key]?.kind ?? defaultKind) === "line"
      const top = band.map((b) => (ctx.y(b[1]) / h) * (rows - 1))
      const floor = band.map((b, i) =>
        line
          ? Math.min(rows - 1, top[i] + glow)
          : (ctx.y(b[0]) / h) * (rows - 1)
      )
      out[key] = { top: resample(top, cols), floor: resample(floor, cols) }
    }
    return out
  })

  const stars = $derived.by(() => {
    const out: Star[] = []
    const per = Math.max(4, Math.round(cols / 14))
    ctx.configKeys.forEach((key, k) => {
      for (let i = 0; i < per; i++) {
        const seed = i * 67 + 13 + k * 131
        out.push({
          key,
          xi: seed % Math.max(ctx.dataLength, 1),
          depth: ((seed * 53 + 7) % 100) / 100,
          phase: (seed * 41) % 360,
        })
      }
    })
    return out
  })

  // Live views for the rAF loop.
  const stateRef = { current: ctx }
  const targetsRef = {
    get current() {
      return targets
    },
  }
  const starsRef = {
    get current() {
      return stars
    },
  }

  // Restart the loop when the backing resolution changes. untrack keeps the
  // loop's synchronous state reads out of the effect deps.
  $effect(() => {
    const canvas = canvasEl
    const bloomCanvas = bloomEl
    const c = cols
    const r = rows
    if (!canvas) return
    return untrack(() =>
      startCartesianLoop({
        canvas,
        bloomCanvas,
        cols: c,
        rows: r,
        state: stateRef,
        targets: targetsRef,
        stars: starsRef,
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
