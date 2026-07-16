import type { Attachment } from "svelte/attachments"

export type Dimensions = { width: number; height: number }

/**
 * Tracks an element's CSS pixel size via ResizeObserver. Uses clientWidth/
 * clientHeight (the layout size) rather than getBoundingClientRect() so a
 * transform-scaled parent can't trick the chart into measuring a scaled size.
 * Attach to the measured element with `{@attach dims.attach}`.
 */
export class ChartDimensions {
  width = $state(0)
  height = $state(0)

  readonly attach: Attachment<HTMLElement> = (el) => {
    const measure = () => {
      this.width = Math.max(0, el.clientWidth)
      this.height = Math.max(0, el.clientHeight)
    }
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    measure()
    return () => ro.disconnect()
  }
}
