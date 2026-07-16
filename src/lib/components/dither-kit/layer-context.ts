import { getContext, setContext } from "svelte"

/**
 * Which render layer a composed part targets. Snippets can't be introspected,
 * so the roots render their `children` snippet once per layer (back SVG,
 * canvas, front SVG, DOM) with this context marking the current pass, and each
 * part renders itself only in its own pass (default: the front `svg` pass).
 */
export type ChartLayer = "back" | "svg" | "dom"

const LAYER_KEY = Symbol("dither-kit-layer")

export function setChartLayer(layer: ChartLayer) {
  setContext(LAYER_KEY, layer)
}

export function getChartLayer(): ChartLayer {
  return getContext<ChartLayer | undefined>(LAYER_KEY) ?? "svg"
}
