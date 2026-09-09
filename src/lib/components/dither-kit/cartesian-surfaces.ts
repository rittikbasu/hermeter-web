export type ContinuousSeriesKind = 'area' | 'line';

export type SurfaceBand = {
  top: number;
  floor: number;
};

/** Project one absolute chart band into backing-canvas coordinates. */
export function surfaceForBand(
  band: [number, number],
  kind: ContinuousSeriesKind,
  y: (value: number) => number,
  plotHeight: number,
  rows: number,
  lineGlow: number
): SurfaceBand {
  const height = plotHeight || 1;
  const top = (y(band[1]) / height) * (rows - 1);
  const floor =
    kind === 'line'
      ? band[1] > band[0]
        ? Math.min(rows - 1, top + lineGlow)
        : top
      : (y(band[0]) / height) * (rows - 1);

  return { top, floor };
}
