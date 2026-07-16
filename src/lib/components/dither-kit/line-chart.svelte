<script lang="ts" generics="TData extends object">
  import CartesianCanvas from "./cartesian-canvas.svelte"
  import CartesianRoot from "./cartesian-root.svelte"
  import type { CartesianChartProps } from "./chart-context.svelte"

  /** Composable dither **line** chart - `<Line>` series with a glow under the line. */
  let props: CartesianChartProps<TData> = $props()
</script>

<CartesianRoot chartType="line" Canvas={CartesianCanvas} {...props} />
