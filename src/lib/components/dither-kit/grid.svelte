<script lang="ts">
  import { useChartPart } from "./chart-context.svelte"
  import { getChartLayer } from "./layer-context"

  let {
    horizontal = true,
    vertical = false,
    strokeDasharray = "3 3",
  }: {
    horizontal?: boolean
    vertical?: boolean
    strokeDasharray?: string
  } = $props()

  // Renders in the back layer pass, beneath the dither canvas.
  const layer = getChartLayer()
  const ctx = useChartPart("Grid")
</script>

{#if layer === "back" && ctx.ready}
  <g class="stroke-border" stroke-dasharray={strokeDasharray}>
    {#if horizontal}
      {#each ctx.y.ticks(4) as t (`h-${t}`)}
        <line x1={0} x2={ctx.plot.width} y1={ctx.y(t)} y2={ctx.y(t)} />
      {/each}
    {/if}
    {#if vertical}
      {#each ctx.data as _, i}
        <line
          x1={ctx.xCenter(i) ?? 0}
          x2={ctx.xCenter(i) ?? 0}
          y1={0}
          y2={ctx.plot.height}
        />
      {/each}
    {/if}
  </g>
{/if}
