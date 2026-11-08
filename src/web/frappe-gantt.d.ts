// ============================================================================
// frappe-gantt
// ============================================================================

declare module 'frappe-gantt' {
  export interface GanttTask {
    id: string
    // Read as HTML, so text from users must be escaped first.
    name: string
    start: string
    end: string
    progress: number
    // Task ids joined with commas.
    dependencies?: string
    // A single class name.
    custom_class?: string
  }

  export interface GanttViewMode {
    name: string
  }

  export interface GanttOptions {
    view_mode?: string
    view_mode_select?: boolean
    today_button?: boolean
    readonly_progress?: boolean
    popup?: false
    popup_on?: 'click' | 'hover'
    bar_height?: number
    padding?: number
    container_height?: number | 'auto'
    scroll_to?: string
    infinite_padding?: boolean
    move_dependencies?: boolean
    on_click?: (task: GanttTask) => void
    on_date_change?: (task: GanttTask, start: Date, end: Date) => void
    on_view_change?: (mode: GanttViewMode) => void
  }

  export default class Gantt {
    constructor(wrapper: HTMLElement | string, tasks: GanttTask[], options?: GanttOptions)
    refresh(tasks: GanttTask[]): void
    change_view_mode(mode?: string, maintain_position?: boolean): void
    clear(): void
  }
}
