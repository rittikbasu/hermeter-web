<script lang="ts" generics="TData extends object">
  import BarCanvas from "./bar-canvas.svelte"
  import CartesianRoot from "./cartesian-root.svelte"
  import type { CartesianChartProps } from "./chart-context.svelte"

  /** Composable dither **bar** chart - `<Bar>` series, grouped or stacked. */
  let props: CartesianChartProps<TData> = $props()
</script>

<CartesianRoot chartType="bar" Canvas={BarCanvas} {...props} />
