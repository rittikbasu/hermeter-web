export function createBloomSync(
  context: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  width: number,
  height: number
) {
  let active = false;

  return (isActive: boolean, sourceChanged: boolean) => {
    if (!isActive) {
      active = false;
      return;
    }
    if (active && !sourceChanged) return;

    context.clearRect(0, 0, width, height);
    context.drawImage(source, 0, 0);
    active = true;
  };
}
