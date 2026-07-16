<script lang="ts" generics="TData extends object">
  import CartesianCanvas from "./cartesian-canvas.svelte"
  import CartesianRoot from "./cartesian-root.svelte"
  import type { CartesianChartProps } from "./chart-context.svelte"

  /** Composable dither **area** chart. Compose `<Area>`, `<Grid>`, axes, … inside. */
  let props: CartesianChartProps<TData> = $props()
</script>

<CartesianRoot chartType="area" Canvas={CartesianCanvas} {...props} />
