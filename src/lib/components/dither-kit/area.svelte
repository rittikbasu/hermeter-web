<script lang="ts">
  import CartesianSeries from "./cartesian-series.svelte"
  import type { SeriesProps } from "./chart-context.svelte"

  /** One area series - dithered fill from the value line down to its floor. */
  let props: SeriesProps = $props()
</script>

<CartesianSeries part="Area" kind="area" {...props} />
