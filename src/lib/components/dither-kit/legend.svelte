<script lang="ts">
  import { useCommonChart } from "./common-context"
  import { getChartLayer } from "./layer-context"
  import { cn } from "./lib"
  import { rgb } from "./palette"

  /** Series/slice legend. With `isClickable`, each entry toggles its selection.
   * Works in every chart family via the shared common context. */
  let {
    isClickable = false,
    align = "right",
  }: {
    isClickable?: boolean
    align?: "left" | "center" | "right"
  } = $props()

  // Renders in the DOM layer pass, above the SVG chrome.
  const layer = getChartLayer()
  const chart = useCommonChart()
</script>

{#if layer === "dom"}
  <div
    class={cn(
      "pointer-events-none absolute inset-x-0 top-0 flex flex-wrap gap-3 px-1",
      align === "right" && "justify-end",
      align === "center" && "justify-center",
      align === "left" && "justify-start"
    )}
  >
    {#each chart.names as name (name)}
      {@const seed = chart.seedOf(name)}
      {@const emphasis = chart.selectedDataKey ?? chart.focusDataKey}
      {@const dimmed = emphasis !== null && emphasis !== name}
      <!-- Hovering an entry spotlights its series so overlapping layers
           (e.g. two meshed radar polygons) can be told apart at a glance. -->
      <button
        type="button"
        disabled={!isClickable}
        onclick={() =>
          chart.selectDataKey(chart.selectedDataKey === name ? null : name)}
        onpointerenter={() => chart.setFocusDataKey(name)}
        onpointerleave={() => chart.setFocusDataKey(null)}
        onfocus={() => chart.setFocusDataKey(name)}
        onblur={() => chart.setFocusDataKey(null)}
        class={cn(
          "flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground transition-opacity",
          isClickable &&
            "pointer-events-auto cursor-pointer hover:text-foreground",
          dimmed && "opacity-40"
        )}
      >
        <span
          class="size-2 rounded-[1px]"
          style:background-color={rgb(seed.fill)}
        ></span>
        {chart.labelOf(name)}
      </button>
    {/each}
  </div>
{/if}
