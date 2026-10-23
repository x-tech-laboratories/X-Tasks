// ============================================================================
// Resize handle
// ============================================================================

interface ResizeHandleProps {
  // Which edge of the window the resized panel sits against.
  side: 'left' | 'right'
  width: number
  min_width: number
  max_width: number
  default_width: number
  on_resize: (width: number) => void
  on_resize_end: (width: number) => void
  label: string
  // Replaces the panel edge styling, for a handle placed somewhere else.
  class_name?: string
}

// A thin bar on a panel's inner edge; drag it to resize, double-click it to reset.
export function ResizeHandle({ side, width, min_width, max_width, default_width, on_resize, on_resize_end, label, class_name }: ResizeHandleProps) {
  const clamp = (value: number): number => Math.round(Math.min(max_width, Math.max(min_width, value)))

  function start_drag(event: PointerEvent): void {
    if (event.button !== 0) return
    event.preventDefault()
    const handle = event.currentTarget as HTMLElement
    const start_x = event.clientX
    const start_width = width
    let latest_width = width

    function follow_pointer(move: PointerEvent): void {
      const moved = move.clientX - start_x
      latest_width = clamp(side === 'left' ? start_width + moved : start_width - moved)
      on_resize(latest_width)
    }
    function stop_drag(): void {
      handle.removeEventListener('pointermove', follow_pointer)
      handle.removeEventListener('pointerup', stop_drag)
      handle.removeEventListener('pointercancel', stop_drag)
      handle.classList.remove('is_dragging')
      document.body.classList.remove('is_resizing')
      on_resize_end(latest_width)
    }

    handle.setPointerCapture(event.pointerId)
    handle.addEventListener('pointermove', follow_pointer)
    handle.addEventListener('pointerup', stop_drag)
    handle.addEventListener('pointercancel', stop_drag)
    handle.classList.add('is_dragging')
    document.body.classList.add('is_resizing')
  }

  // Arrow keys nudge the width, so the handle works without a mouse.
  function nudge(event: KeyboardEvent): void {
    const step = event.shiftKey ? 48 : 16
    const growth = { ArrowRight: step, ArrowLeft: -step }[event.key]
    if (growth === undefined) return
    event.preventDefault()
    on_resize_end(clamp(width + (side === 'left' ? growth : -growth)))
  }

  return (
    <div
      class={class_name ?? `resize_handle is_${side}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      aria-valuemin={min_width}
      aria-valuemax={max_width}
      tabIndex={0}
      onPointerDown={start_drag}
      onDblClick={() => on_resize_end(default_width)}
      onKeyDown={nudge}
    />
  )
}
