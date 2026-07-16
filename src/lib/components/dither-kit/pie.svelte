<script lang="ts">
  import type { AreaVariant } from "./chart-context.svelte"
  import { getChartLayer } from "./layer-context"
  import { usePolarPart } from "./polar-context.svelte"

  /**
   * The pie/donut ring. Slices come from the chart `data` (one per row); this
   * part sets the shared fill variant. The dithered wedges are painted on the
   * canvas - this part renders nothing itself.
   */
  let { variant = "gradient" }: { variant?: AreaVariant } = $props()

  const layer = getChartLayer()
  const ctx = usePolarPart("Pie", "pie")

  // Register in the svg pass only, so the other passes don't thrash the spec.
  $effect(() => {
    if (layer !== "svg") return
    ctx.registerVariant("*", variant)
    return () => ctx.unregisterVariant("*")
  })
</script>
