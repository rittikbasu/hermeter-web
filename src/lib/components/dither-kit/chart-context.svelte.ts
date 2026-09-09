import type { ScaleLinear } from "d3-scale"
import { getContext, setContext, type Snippet } from "svelte"
import type { Dimensions } from "./chart-dimensions.svelte"
import type { CommonChart } from "./common-context"
import type { BloomInput } from "./dither-paint"
import type { DitherColor, Seed } from "./palette"
import { seedOfColor } from "./palette"
import {
  buildBandScale,
  buildXScale,
  buildYScale,
  computeBands,
  indexAtBand,
  nearestIndex,
  type StackType,
} from "./scales"

/** Which chart root a part is composed under - drives the boundary guards. */
export type ChartType = "area" | "bar" | "line" | "pie" | "radar"

export type ChartConfig = Record<string, {
  label?: string
  color: DitherColor
}>

export type Margins = {
  top: number
  right: number
  bottom: number
  left: number
}

type Row = Record<string, unknown>

type ChartRevision = {
  data: Row[]
  token: number
}

export type AreaVariant = "gradient" | "dotted" | "hatched" | "solid"
export type StrokeVariant = "solid" | "dashed"
export type SeriesKind = "area" | "line" | "bar"

/** What each series part (<Area />, <Line />, <Bar />) registers so the canvas
 * knows which series to paint and how. */
export type SeriesSpec = {
  dataKey: string
  kind: SeriesKind
  variant: AreaVariant
  strokeVariant: StrokeVariant
}

/** Shared props for the cartesian chart roots (AreaChart / LineChart / BarChart). */
export type CartesianChartProps<TData extends object = Row> = {
  data: TData[]
  config: ChartConfig
  tooltipConfig?: ChartConfig
  domainMax?: number
  children?: Snippet
  stackType?: StackType
  margins?: Partial<Margins>
  class?: string
  animate?: boolean
  animationDuration?: number
  replayToken?: number // change to re-play the entrance without remounting
  /** Set false for a decorative sparkline: keeps the hover lift but no scrub
   * crosshair / tooltip. */
  interactive?: boolean
  /** Controlled crosshair position (e.g. a committed point) - overrides the
   * internal hover when set. */
  markerIndex?: number | null
  /** Parent-driven hover (e.g. the whole card/row) - lifts the fill. */
  hovered?: boolean
  /** Glow on the dither fill. */
  bloom?: BloomInput
  /** Only bloom while the chart is hovered. */
  bloomOnHover?: boolean
  /** Fires with the scrubbed index as the pointer moves (null on leave). */
  onHoverChange?: (index: number | null) => void
  defaultSelectedDataKey?: string | null
  onSelectionChange?: (key: string | null) => void
}

/** Shared props for the continuous series parts (<Area />, <Line />). */
export type SeriesProps = {
  dataKey: string
  variant?: AreaVariant
  strokeVariant?: StrokeVariant
  isClickable?: boolean
  children?: Snippet
}

/** The reactive inputs the root feeds the controller - read through a closure
 * so prop changes flow into the class's deriveds. */
export type CartesianControllerInput = {
  chartType: ChartType
  data: Row[]
  config: ChartConfig
  tooltipConfig?: ChartConfig
  domainMax?: number
  stackType: StackType
  dimensions: Dimensions
  margins: Margins
  animate: boolean
  animationDuration: number
  replayToken: number
  markerIndex: number | null
  hovered: boolean
  bloom: BloomInput
  bloomOnHover: boolean
  onSelectionChange?: (key: string | null) => void
}

/**
 * The shared chart controller. Resolves the plot rect from the measured size
 * minus margins, computes the x/y scales and the per-series stack bands as
 * `$derived`s, and owns the selection + hover state every part reads.
 */
export class CartesianChartState {
  #in: () => CartesianControllerInput

  // Interaction state, shared by every part.
  selectedDataKey = $state<string | null>(null)
  /** Legend-hover spotlight - dims every series but this one while set. */
  focusDataKey = $state<string | null>(null)
  hoverIndex = $state<number | null>(null)
  cursorX = $state(0)
  isMouseInChart = $state(false)

  // Series register themselves so the canvas knows what (and how) to paint.
  seriesSpecs = $state<Record<string, SeriesSpec>>({})

  /** Shared surface for <Legend> / <Tooltip> - getters into this state. */
  readonly common: CommonChart

  constructor(
    input: () => CartesianControllerInput,
    defaultSelectedDataKey: string | null = null
  ) {
    this.#in = input
    this.selectedDataKey = defaultSelectedDataKey

    const self = this
    this.common = {
      get names() {
        return self.configKeys
      },
      labelOf: (n) => self.config[n]?.label ?? n,
      seedOf: (n) => self.seedOf(n),
      get selectedDataKey() {
        return self.selectedDataKey
      },
      selectDataKey: self.selectDataKey,
      get focusDataKey() {
        return self.focusDataKey
      },
      setFocusDataKey: self.setFocusDataKey,
      get hoverIndex() {
        return self.hoverIndex
      },
      get ready() {
        return self.ready
      },
      get tooltipLeft() {
        return Math.max(
          48,
          Math.min(self.plot.width + self.margins.left, self.cursorX)
        )
      },
      get tooltipAlign() {
        const edge = self.plot.width + self.margins.left
        if (self.cursorX < 96) return "start"
        if (self.cursorX > edge - 96) return "end"
        return "center"
      },
      // Follow the highest hovered node so the card rides the data path, but
      // keep enough headroom that the upward-lifted card never clips the top.
      get tooltipTop() {
        const floor = self.margins.top + 44
        if (self.hoverIndex == null) return floor
        let minY = Number.POSITIVE_INFINITY
        for (const key of self.configKeys) {
          const b = self.bands[key]?.[self.hoverIndex]
          if (b) minY = Math.min(minY, self.y(b[1]))
        }
        if (!Number.isFinite(minY)) return floor
        return Math.max(floor, self.margins.top + minY)
      },
      heading: (i, labelKey) =>
        labelKey ? String(self.data[i]?.[labelKey] ?? "") : null,
      itemsAt: (i) =>
        Object.entries(self.tooltipConfig).map(([name, config]) => {
          const raw = self.data[i]?.[name]
          const emphasis = self.selectedDataKey ?? self.focusDataKey
          return {
            name,
            label: config?.label ?? name,
            value: raw === null ? null : typeof raw === "number" ? raw : 0,
            seed: self.seedOf(name),
            dimmed: emphasis !== null && emphasis !== name,
          }
        }),
    }
  }

  // Reactive pass-throughs of the root's props.
  get chartType() {
    return this.#in().chartType
  }
  get config() {
    return this.#in().config
  }
  get data() {
    return this.#in().data
  }
  get tooltipConfig() {
    return this.#in().tooltipConfig ?? this.config
  }
  get domainMax() {
    return this.#in().domainMax
  }
  get dataLength() {
    return this.#in().data.length
  }
  get stackType() {
    return this.#in().stackType
  }
  get margins() {
    return this.#in().margins
  }
  get animate() {
    return this.#in().animate
  }
  get animationDuration() {
    return this.#in().animationDuration
  }
  get markerIndex() {
    return this.#in().markerIndex
  }
  get hovered() {
    return this.#in().hovered
  }
  get bloom() {
    return this.#in().bloom
  }
  get bloomOnHover() {
    return this.#in().bloomOnHover
  }

  // Geometry - the plot rect, scales and stack bands, all lazily derived.
  configKeys = $derived(Object.keys(this.config)) // series order - stacking + legend
  // $derived.by so `this.#in` sits in a closure - it's assigned in the
  // constructor, after field initializers run.
  #plotWidth = $derived.by(() =>
    Math.max(
      0,
      this.#in().dimensions.width - this.margins.left - this.margins.right
    )
  )
  #plotHeight = $derived.by(() =>
    Math.max(
      0,
      this.#in().dimensions.height - this.margins.top - this.margins.bottom
    )
  )
  /** Inner drawing area. */
  plot = $derived({ width: this.#plotWidth, height: this.#plotHeight })
  /** True once measured (width > 0). */
  ready = $derived(this.#plotWidth > 0 && this.#plotHeight > 0)

  #stack = $derived(computeBands(this.data, this.configKeys, this.stackType))
  /** Per-series [y0, y1] per row. */
  get bands() {
    return this.#stack.bands
  }
  get max() {
    return Math.max(this.#stack.max, this.domainMax ?? 0)
  }

  #isBar = $derived(this.chartType === "bar")
  #xPoint = $derived(buildXScale(this.dataLength, this.#plotWidth))
  #xBand = $derived(buildBandScale(this.dataLength, this.#plotWidth))
  /** Category slot width (0 for point/area scales). */
  bandwidth = $derived(this.#isBar ? this.#xBand.bandwidth() : 0)
  /** value → px within the plot. */
  y: ScaleLinear<number, number> = $derived(
    buildYScale(this.max, this.#plotHeight)
  )

  /** Category centre px within the plot. */
  xCenter = (i: number) =>
    this.#isBar
      ? (this.#xBand(i) ?? 0) + this.#xBand.bandwidth() / 2
      : (this.#xPoint(i) ?? 0)

  /** Nearest category for a pointer x. */
  indexAtX = (px: number) =>
    this.#isBar
      ? indexAtBand(px, this.dataLength, this.#plotWidth)
      : nearestIndex(px, this.dataLength, this.#plotWidth)

  /** Bar geometry in plot px - one source of truth for the canvas + click rects. */
  barSlot = (i: number, si: number, n: number) => {
    const center = this.xCenter(i)
    const stacked = this.stackType === "stacked" || this.stackType === "percent"
    if (stacked) {
      const w = this.bandwidth * 0.9
      return { x: center - w / 2, width: w }
    }
    const slot = this.bandwidth / Math.max(n, 1)
    return {
      x: center - this.bandwidth / 2 + si * slot + slot * 0.08,
      width: slot * 0.84,
    }
  }

  seedOf = (key: string): Seed =>
    seedOfColor(this.config[key]?.color ?? this.tooltipConfig[key]?.color ?? "grey")

  // A new data array is the chart's immutable update boundary; replayToken
  // handles replays when the data itself is unchanged. Keeping both in one
  // derived object avoids serializing every row during canvas animation.
  revision = $derived.by((): ChartRevision => ({
    data: this.#in().data,
    token: this.#in().replayToken,
  }))


  // Interaction setters - arrow fields so they can be handed to parts/loops.
  selectDataKey = (key: string | null) => {
    this.selectedDataKey = key
    this.#in().onSelectionChange?.(key)
  }
  setFocusDataKey = (key: string | null) => {
    this.focusDataKey = key
  }
  setHoverIndex = (index: number | null) => {
    this.hoverIndex = index
  }
  setCursorX = (px: number) => {
    this.cursorX = px
  }
  setMouseInChart = (over: boolean) => {
    this.isMouseInChart = over
  }

  registerSeries = (spec: SeriesSpec) => {
    const cur = this.seriesSpecs[spec.dataKey]
    if (
      cur &&
      cur.kind === spec.kind &&
      cur.variant === spec.variant &&
      cur.strokeVariant === spec.strokeVariant
    ) {
      return
    }
    this.seriesSpecs[spec.dataKey] = spec
  }
  unregisterSeries = (dataKey: string) => {
    if (dataKey in this.seriesSpecs) delete this.seriesSpecs[dataKey]
  }
}

const CHART_KEY = Symbol("dither-kit-chart")

const ROOT_OF: Record<ChartType, string> = {
  area: "<AreaChart />",
  bar: "<BarChart />",
  line: "<LineChart />",
  pie: "<PieChart />",
  radar: "<RadarChart />",
}

/** Publish the controller to parts - called by the cartesian roots. */
export function setChartContext(state: CartesianChartState) {
  setContext(CHART_KEY, state)
}

/** Generic accessor for internal layers (canvas/overlay) that work for any root. */
export function useChart(): CartesianChartState {
  const ctx = getContext<CartesianChartState | undefined>(CHART_KEY)
  if (!ctx) {
    throw new Error(
      "Chart parts must be used within a chart root (e.g. <AreaChart />)."
    )
  }
  return ctx
}

/**
 * Boundary guard for a composable part. Throws a precise error when used outside
 * a root, or inside the wrong chart type - e.g. `<Bar />` placed in an area
 * chart. `kind` omitted means the part works under any root (grid, axes, …).
 */
export function useChartPart(
  part: string,
  kind?: ChartType | ChartType[]
): CartesianChartState {
  const ctx = getContext<CartesianChartState | undefined>(CHART_KEY)
  if (!ctx) {
    const where = kind
      ? ROOT_OF[Array.isArray(kind) ? kind[0] : kind]
      : "a chart root"
    throw new Error(`<${part} /> must be used within ${where}.`)
  }
  if (kind) {
    const allowed = Array.isArray(kind) ? kind : [kind]
    if (!allowed.includes(ctx.chartType)) {
      throw new Error(
        `<${part} /> is not valid inside ${ROOT_OF[ctx.chartType]} - it belongs in ${allowed
          .map((k) => ROOT_OF[k])
          .join(" or ")}.`
      )
    }
  }
  return ctx
}
