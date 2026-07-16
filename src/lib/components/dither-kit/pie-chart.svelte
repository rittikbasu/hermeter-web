<script lang="ts" generics="TData extends object">
  import PieCanvas from "./pie-canvas.svelte"
  import type { PieChartProps } from "./polar-context.svelte"
  import PolarRoot from "./polar-root.svelte"

  /** Composable dither **pie / donut** chart. Compose `<Pie>`, `<Legend>`, … inside. */
  let props: PieChartProps<TData> = $props()
</script>

<PolarRoot chartType="pie" Canvas={PieCanvas} {...props} />
