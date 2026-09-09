<script lang="ts">
  import { untrack } from 'svelte';
  import { useChart } from './chart-context.svelte';
  import { startDailyTokenLoop } from './daily-token-loop';
  import { backingSize, bloomLayerStyle } from './dither-paint';

  const chart = useChart();

  let canvasElement = $state<HTMLCanvasElement | null>(null);
  let bloomElement = $state<HTMLCanvasElement | null>(null);

  const backing = $derived(backingSize(chart.plot.width, chart.plot.height));
  const stateRef = { current: chart };

  $effect(() => {
    const canvas = canvasElement;
    const bloomCanvas = bloomElement;
    const { cols, rows } = backing;
    const width = chart.plot.width;
    if (!canvas) return;

    return untrack(() =>
      startDailyTokenLoop({
        canvas,
        bloomCanvas,
        cols,
        rows,
        width,
        state: stateRef
      })
    );
  });

  const bloomActive = $derived(
    chart.bloomOnHover ? chart.isMouseInChart || chart.hovered : true
  );
  const bloom = $derived(bloomLayerStyle(chart.bloom, bloomActive));
</script>

<canvas
  bind:this={canvasElement}
  class="pointer-events-none absolute"
  style:left="{chart.margins.left}px"
  style:top="{chart.margins.top}px"
  style:width="{chart.plot.width}px"
  style:height="{chart.plot.height}px"
  style:image-rendering="pixelated"
></canvas>
<canvas
  bind:this={bloomElement}
  class="pointer-events-none absolute"
  style:left="{chart.margins.left}px"
  style:top="{chart.margins.top}px"
  style:width="{chart.plot.width}px"
  style:height="{chart.plot.height}px"
  style:transition="opacity 220ms ease"
  style:filter={bloom?.filter}
  style:opacity={bloom?.opacity ?? 0}
  style:mix-blend-mode={bloom?.mixBlendMode}
  style:image-rendering={bloom?.imageRendering}
></canvas>
