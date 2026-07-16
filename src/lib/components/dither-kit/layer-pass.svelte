<script lang="ts">
  import type { Snippet } from "svelte"
  import { type ChartLayer, setChartLayer } from "./layer-context"

  let { layer, children }: { layer: ChartLayer; children?: Snippet } = $props()

  // The layer is fixed per pass instance - capturing the initial value is the point.
  // svelte-ignore state_referenced_locally
  setChartLayer(layer)
</script>

{@render children?.()}
