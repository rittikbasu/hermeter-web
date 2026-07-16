<script lang="ts">
  import CartesianSeries from "./cartesian-series.svelte"
  import type { SeriesProps } from "./chart-context.svelte"

  /** One line series - bright line with a thin dither glow hugging it. */
  let props: SeriesProps = $props()
</script>

<CartesianSeries part="Line" kind="line" {...props} />
