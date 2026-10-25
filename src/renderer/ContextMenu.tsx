import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'

// ============================================================================
// Context menu
// ============================================================================

export interface MenuItem {
  label: string
  on_select: () => void
  is_danger?: boolean
  // Set on an item that can be ticked on or off, and shows whether it is ticked now.
  is_chosen?: boolean
}

export interface OpenMenu {
  x: number
  y: number
  items: MenuItem[]
}

export type OpenContextMenu = (event: MouseEvent, items: MenuItem[]) => void

interface ContextMenuProps {
  menu: OpenMenu
  on_close: () => void
}

// Closes on any click outside it, Escape, scrolling anything but itself, or the window losing focus.
export function ContextMenu({ menu, on_close }: ContextMenuProps) {
  const menu_element = useRef<HTMLUListElement>(null)
  const [position, set_position] = useState({ left: menu.x, top: menu.y })

  // Shifts the menu back on screen when it would spill past the right or bottom edge.
  useLayoutEffect(() => {
    const size = menu_element.current!.getBoundingClientRect()
    set_position({
      left: Math.min(menu.x, window.innerWidth - size.width - 4),
      top: Math.min(menu.y, window.innerHeight - size.height - 4)
    })
  }, [menu])

  useEffect(() => {
    function close_on_outside_press(event: MouseEvent): void {
      if (!menu_element.current?.contains(event.target as Node)) on_close()
    }
    function close_on_escape(event: KeyboardEvent): void {
      if (event.key === 'Escape') on_close()
    }
    function close_on_outside_scroll(event: Event): void {
      if (!menu_element.current?.contains(event.target as Node)) on_close()
    }

    window.addEventListener('mousedown', close_on_outside_press)
    window.addEventListener('keydown', close_on_escape)
    window.addEventListener('blur', on_close)
    window.addEventListener('scroll', close_on_outside_scroll, true)
    return () => {
      window.removeEventListener('mousedown', close_on_outside_press)
      window.removeEventListener('keydown', close_on_escape)
      window.removeEventListener('blur', on_close)
      window.removeEventListener('scroll', close_on_outside_scroll, true)
    }
  }, [on_close])

  return (
    <ul ref={menu_element} class="context_menu" role="menu" style={{ left: `${position.left}px`, top: `${position.top}px` }}>
      {menu.items.map((item) => (
        <li key={item.label} role="none">
          <button
            role={item.is_chosen === undefined ? 'menuitem' : 'menuitemcheckbox'}
            aria-checked={item.is_chosen}
            class={['context_menu_item', item.is_danger && 'is_danger', item.is_chosen && 'is_chosen'].filter(Boolean).join(' ')}
            onClick={() => {
              on_close()
              item.on_select()
            }}
          >
            {item.label}
          </button>
        </li>
      ))}
    </ul>
  )
}
