import { getContext, setContext } from "svelte"
import type { Seed } from "./palette"

/** Getters into the owning series' state, so reads stay reactive. */
export type SeriesContextValue = {
  readonly dataKey: string
  readonly seed: Seed
  readonly dimmed: boolean
}

const SERIES_KEY = Symbol("dither-kit-series")

export function setSeries(value: SeriesContextValue) {
  setContext(SERIES_KEY, value)
}

/** Boundary guard for series-scoped markers (`<Dot>`, `<ActiveDot>`). */
export function useSeries(part: string): SeriesContextValue {
  const ctx = getContext<SeriesContextValue | undefined>(SERIES_KEY)
  if (!ctx) {
    throw new Error(
      `<${part} /> must be rendered inside a series (e.g. <Area />).`
    )
  }
  return ctx
}
