import { getContext, setContext, type Snippet } from "svelte"
import type {
  AreaVariant,
  ChartConfig,
  ChartType,
  Margins,
} from "./chart-context.svelte"
import type { Dimensions } from "./chart-dimensions.svelte"
import type { CommonChart } from "./common-context"
import type { BloomInput } from "./dither-paint"
import type { Seed } from "./palette"
import { seedOfColor } from "./palette"
import { type PieSlice, pieSlices, type RadarAxis, radarAxes } from "./polar"

type Row = Record<string, unknown>

const ROOT_OF: Record<string, string> = {
  pie: "<PieChart />",
  radar: "<RadarChart />",
}

/** Shared props for the polar chart roots (PieChart / RadarChart). */
export type PieChartProps<TData extends object = Row> = {
  data: TData[]
  config: ChartConfig
  children?: Snippet
  dataKey: string // value field
  nameKey: string // slice-name field (looked up in config for colour)
  innerRadius?: number // 0-1 ratio for a donut
  margins?: Partial<Margins>
  class?: string
  animate?: boolean
  animationDuration?: number
  replayToken?: number
  bloom?: BloomInput
  bloomOnHover?: boolean
  defaultSelectedDataKey?: string | null
  onSelectionChange?: (key: string | null) => void
}

export type RadarChartProps<TData extends object = Row> = Omit<
  PieChartProps<TData>,
  "dataKey" | "innerRadius"
> & {
  nameKey: string // axis-label field
}

/** The reactive inputs the polar root feeds the controller. */
export type PolarControllerInput = {
  chartType: "pie" | "radar"
  data: Row[]
  config: ChartConfig
  dataKey: string
  nameKey: string
  innerRadiusRatio: number
  dimensions: Dimensions
  margins: Margins
  animate: boolean
  animationDuration: number
  replayToken: number
  bloom: BloomInput
  bloomOnHover: boolean
  onSelectionChange?: (key: string | null) => void
}

/**
 * The polar chart controller. Resolves the plot rect and radii, computes the
 * pie slices / radar axes as `$derived`s, and owns the selection + hover
 * state every part reads.
 */
export class PolarChartState {
  #in: () => PolarControllerInput

  selectedDataKey = $state<string | null>(null)
  /** Legend-hover spotlight - dims every series but this one while set. */
  focusDataKey = $state<string | null>(null)
  hoverIndex = $state<number | null>(null)
  cursorX = $state(0)
  cursorY = $state(0)
  isMouseInChart = $state(false)
  /** "*" is the pie-wide variant set by <Pie>; radar registers per series key. */
  variants = $state<Record<string, AreaVariant>>({})

  readonly common: CommonChart

  constructor(
    input: () => PolarControllerInput,
    defaultSelectedDataKey: string | null = null
  ) {
    this.#in = input
    this.selectedDataKey = defaultSelectedDataKey

    const self = this
    this.common = {
      get names() {
        return self.chartType === "pie" && self.pie
          ? self.pie.map((s) => s.name)
          : self.configKeys
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
          Math.min(self.plot.width + self.margins.left - 48, self.cursorX)
        )
      },
      get tooltipTop() {
        return Math.max(self.margins.top + 44, self.cursorY)
      },
      heading: (i) =>
        self.chartType === "pie"
          ? (self.pie?.[i]?.name ?? null)
          : (self.radar?.axes[i]?.label ?? null),
      itemsAt: (i) => {
        const emphasis = self.selectedDataKey ?? self.focusDataKey
        if (self.chartType === "pie" && self.pie) {
          const s = self.pie[i]
          if (!s) return []
          return [
            {
              name: s.name,
              label: self.config[s.name]?.label ?? s.name,
              value: s.value,
              seed: self.seedOf(s.name),
              dimmed: emphasis !== null && emphasis !== s.name,
            },
          ]
        }
        // radar
        return self.configKeys.map((name) => {
          const raw = self.data[i]?.[name]
          return {
            name,
            label: self.config[name]?.label ?? name,
            value: typeof raw === "number" ? raw : 0,
            seed: self.seedOf(name),
            dimmed: emphasis !== null && emphasis !== name,
          }
        })
      },
    }
  }

  // Reactive pass-throughs of the root's props.
  get chartType(): ChartType {
    return this.#in().chartType
  }
  get config() {
    return this.#in().config
  }
  get data() {
    return this.#in().data
  }
  get dataLength() {
    return this.#in().data.length
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
  get bloom() {
    return this.#in().bloom
  }
  get bloomOnHover() {
    return this.#in().bloomOnHover
  }

  configKeys = $derived(Object.keys(this.config))
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
  plot = $derived({ width: this.#plotWidth, height: this.#plotHeight })
  ready = $derived(this.#plotWidth > 0 && this.#plotHeight > 0)
  #pad = $derived(this.chartType === "radar" ? 20 : 6)
  outerRadius = $derived(
    Math.max(0, Math.min(this.#plotWidth, this.#plotHeight) / 2 - this.#pad)
  )
  innerRadius = $derived.by(() =>
    this.chartType === "pie" ? this.outerRadius * this.#in().innerRadiusRatio : 0
  )
  center = $derived({ x: this.#plotWidth / 2, y: this.#plotHeight / 2 })

  /** Present for pie charts. */
  pie: PieSlice[] | null = $derived.by(() =>
    this.chartType === "pie"
      ? pieSlices(this.data, this.#in().dataKey, this.#in().nameKey)
      : null
  )

  /** Present for radar charts. */
  radar: { axes: RadarAxis[]; max: number } | null = $derived.by(() => {
    if (this.chartType !== "radar") return null
    let max = 0
    for (const row of this.data) {
      for (const key of this.configKeys) {
        const v = Number(row[key]) || 0
        if (v > max) max = v
      }
    }
    return { axes: radarAxes(this.data, this.#in().nameKey), max: max || 1 }
  })

  // Entrance replay counter, same pattern as CartesianChartState.revision.
  #rev: { data: unknown; token: number | undefined; value: number } = {
    data: undefined,
    token: undefined,
    value: -1,
  }
  revision = $derived.by(() => {
    const data = this.#in().data
    const token = this.#in().replayToken
    if (this.#rev.data !== data || this.#rev.token !== token) {
      this.#rev = { data, token, value: this.#rev.value + 1 }
    }
    return this.#rev.value
  })

  seedOf = (key: string): Seed => seedOfColor(this.config[key]?.color ?? "grey")
  variantOf = (key: string): AreaVariant =>
    this.variants[key] ?? this.variants["*"] ?? "gradient"

  registerVariant = (key: string, variant: AreaVariant) => {
    if (this.variants[key] === variant) return
    this.variants[key] = variant
  }
  unregisterVariant = (key: string) => {
    if (key in this.variants) delete this.variants[key]
  }

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
  setCursor = (px: number, py: number) => {
    this.cursorX = px
    this.cursorY = py
  }
  setMouseInChart = (over: boolean) => {
    this.isMouseInChart = over
  }
}

const POLAR_KEY = Symbol("dither-kit-polar")

/** Publish the controller to parts - called by the polar root. */
export function setPolarContext(state: PolarChartState) {
  setContext(POLAR_KEY, state)
}

export function usePolarChart(): PolarChartState {
  const ctx = getContext<PolarChartState | undefined>(POLAR_KEY)
  if (!ctx) {
    throw new Error("Polar chart parts must be used within a polar chart root.")
  }
  return ctx
}

/** Boundary guard for polar parts (`<Pie>`, `<Radar>`). */
export function usePolarPart(
  part: string,
  kind: "pie" | "radar"
): PolarChartState {
  const ctx = getContext<PolarChartState | undefined>(POLAR_KEY)
  if (!ctx) {
    throw new Error(`<${part} /> must be used within ${ROOT_OF[kind]}.`)
  }
  if (ctx.chartType !== kind) {
    throw new Error(
      `<${part} /> is not valid inside ${ROOT_OF[ctx.chartType]} - it belongs in ${ROOT_OF[kind]}.`
    )
  }
  return ctx
}
