<script module lang="ts">
  import { paintColumn } from './dither-paint';
  import { PALETTE, type DitherColor } from './palette';

  const ROWS = 4;
  const CELL_WIDTH = 2;

  function paint(canvas: HTMLCanvasElement, value: number, maximum: number, color: DitherColor): void {
    const width = canvas.getBoundingClientRect().width;
    if (!width) return;
    const columns = Math.max(1, Math.floor(width / CELL_WIDTH));
    const ratio = maximum > 0 ? Math.max(0, Math.min(1, value / maximum)) : 0;
    const filled = value > 0 ? Math.max(1, Math.round(columns * ratio)) : 0;
    canvas.width = columns;
    canvas.height = ROWS;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, columns, ROWS);
    const seed = PALETTE[color];
    for (let x = 0; x < filled; x += 1) {
      paintColumn(context, x, 0, ROWS, seed, {
        variant: 'gradient',
        intensity: 0,
        dim: 1,
        stacked: false
      });
    }
  }
</script>

<script lang="ts">
  import { cn } from './lib';

  let {
    value,
    maximum,
    color,
    class: className
  }: {
    value: number;
    maximum: number;
    color: DitherColor;
    class?: string;
  } = $props();

  let canvas = $state<HTMLCanvasElement | null>(null);

  $effect(() => {
    const element = canvas;
    if (!element) return;
    const draw = () => paint(element, value, maximum, color);
    const observer = new ResizeObserver(draw);
    observer.observe(element);
    draw();
    return () => observer.disconnect();
  });
</script>

<div class={cn('dither-progress-line', className)} aria-hidden="true">
  <canvas bind:this={canvas}></canvas>
</div>

<style>
  .dither-progress-line {
    position: relative;
    width: 100%;
    height: 8px;
    overflow: hidden;
    background: rgba(116, 123, 135, 0.14);
  }

  canvas {
    display: block;
    width: 100%;
    height: 100%;
    image-rendering: pixelated;
  }
</style>
