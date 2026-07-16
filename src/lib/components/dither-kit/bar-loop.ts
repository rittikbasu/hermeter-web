// requestAnimationFrame paint loop for the bar canvas.

import type { CartesianChartState } from "./chart-context.svelte"
import { createBloomSync } from "./bloom-sync"
import {
  clamp01,
  easeOutCubic,
  paintColumn,
  prefersReducedMotion,
} from "./dither-paint"

/** A live view of a value - the loop reads `.current` every frame. Declared
 * locally so this file has no dependency on the area-chart registry item. */
type Ref<T> = { readonly current: T }

export type Bars = { top: number[]; base: number[] } // per data index, in backing rows

// Fraction of the timeline spent staggering bar starts - the rest is each bar's
// own grow window, so the rise sweeps across the chart as a wave.
const STAGGER = 0.55

type LoopArgs = {
  canvas: HTMLCanvasElement
  bloomCanvas: HTMLCanvasElement | null
  cols: number
  rows: number
  width: number // plot css px - for slot→column mapping
  state: Ref<CartesianChartState>
  targets: Ref<Record<string, Bars>>
}

/**
 * Grows each category's bars up from their base in a staggered left-to-right
 * wave (eased); the hovered category lifts while the rest dim. Every bar is
 * filled with the shared {@link paintColumn} ordered dither. Returns a cleanup
 * that cancels the loop.
 */
export function startBarLoop({
  canvas,
  bloomCanvas,
  cols,
  rows,
  width,
  state,
  targets,
}: LoopArgs): (() => void) | undefined {
  const c = canvas.getContext("2d")
  if (!c || cols <= 0 || rows <= 0) return undefined
  canvas.width = cols
  canvas.height = rows

  const bloomCtx = bloomCanvas?.getContext("2d") ?? null
  if (bloomCanvas) {
    bloomCanvas.width = cols
    bloomCanvas.height = rows
  }
  const syncBloom = bloomCtx
    ? createBloomSync(bloomCtx, canvas, cols, rows)
    : null

  const reduce = prefersReducedMotion()
  const animate = state.current.animate && !reduce
  const duration = state.current.animationDuration
  const fx = cols / Math.max(width, 1)

  // Eased grow factor for bar `i` at global progress `prog`.
  const barProgress = (i: number, len: number, prog: number) => {
    if (!animate) return 1
    const start = len > 1 ? (i / (len - 1)) * STAGGER : 0
    return easeOutCubic(clamp01((prog - start) / (1 - STAGGER)))
  }

  const paint = (prog: number) => {
    const s = state.current
    c.clearRect(0, 0, cols, rows)
    const stacked = s.stackType === "stacked" || s.stackType === "percent"
    const keys = s.configKeys
    keys.forEach((key, si) => {
      const t = targets.current[key]
      if (!t) return
      const seed = s.seedOf(key)
      const variant = s.seriesSpecs[key]?.variant ?? "gradient"
      const emphasis = s.selectedDataKey ?? s.focusDataKey
      const selDim = emphasis !== null && emphasis !== key ? 0.3 : 1
      for (let i = 0; i < s.dataLength; i++) {
        const bp = barProgress(i, s.dataLength, prog)
        const base = t.base[i] ?? rows - 1
        const top = base + ((t.top[i] ?? base) - base) * bp
        const active = s.hoverIndex === i
        const hoverDim =
          s.hoverIndex != null && !active && s.isMouseInChart ? 0.5 : 1
        const slot = s.barSlot(i, si, keys.length)
        const c0 = Math.round(slot.x * fx)
        const c1 = Math.round((slot.x + slot.width) * fx)
        for (let x = c0; x < c1; x++) {
          paintColumn(c, x, top, base, seed, {
            variant,
            intensity: intensity + (active ? 0.4 : 0),
            dim: selDim * hoverDim,
            stacked,
          })
        }
      }
    })
  }

  let raf = 0
  let animStart = 0
  let lastProg = -1
  let lastRevision = state.current.revision
  let intensity = 0
  let needsFill = true
  let lastPaintSig = ""
  let lastSelected: string | null | undefined = Symbol() as never
  let lastHover: number | null | undefined = Symbol() as never

  const draw = (now: number) => {
    raf = requestAnimationFrame(draw)
    const s = state.current
    if (!s.ready) return
    const bloomOn =
      s.bloom !== "off" && (!s.bloomOnHover || s.isMouseInChart || s.hovered)
    if (s.revision !== lastRevision) {
      lastRevision = s.revision
      animStart = 0 // re-play the wave on data change / replay
      lastProg = -1
    }
    if (!animStart) animStart = now
    const prog = animate ? Math.min(1, (now - animStart) / duration) : 1

    if (prog !== lastProg) {
      lastProg = prog
      needsFill = true
    }
    const emphasisNow = s.selectedDataKey ?? s.focusDataKey
    if (emphasisNow !== lastSelected) {
      lastSelected = emphasisNow
      needsFill = true
    }
    if (s.hoverIndex !== lastHover) {
      lastHover = s.hoverIndex
      needsFill = true
    }
    const itTarget = s.isMouseInChart || s.hovered ? 1 : 0
    if (Math.abs(intensity - itTarget) > 0.001) {
      intensity += (itTarget - intensity) * (reduce ? 1 : 0.16)
      needsFill = true
    } else intensity = itTarget

    // Live tweak repaint (variant, stacking) without replaying the wave.
    const paintSig = `${s.stackType}|${s.configKeys
      .map((k) => s.seriesSpecs[k]?.variant ?? "")
      .join(",")}`
    if (paintSig !== lastPaintSig) {
      lastPaintSig = paintSig
      needsFill = true
    }

    if (!needsFill) {
      syncBloom?.(bloomOn, false)
      return
    }
    paint(prog)
    syncBloom?.(bloomOn, true)
    needsFill = false
  }

  raf = requestAnimationFrame(draw)
  return () => cancelAnimationFrame(raf)
}
