// The task map report card, drawn with force-graph: linked tasks pull together and push apart until the map settles.
import { useEffect, useRef } from 'react'
import type ForceGraph from 'force-graph'

import type { Task } from '@shared/tasks'
import type { TaskMapLink, TaskMapNode } from './reports'

// ============================================================================
// Drawing
// ============================================================================

const BASE_RADIUS = 4
const LABEL_WIDTH = 140
const ARROW_LENGTH = 5
const FIT_MARGIN = 24
const LINK_LENGTH = 60
const FONT_SIZE = 11
const LABEL_GAP = 2
// Room kept between two tasks' dots and labels.
const BOX_PADDING = 6
// How hard every task is drawn to the middle, so separate groups of tasks stay near each other.
const CENTRE_PULL = 0.04

// The simulation's copies: force-graph adds positions to nodes and swaps link ends for the node objects.
type SimNode = TaskMapNode & { x?: number; y?: number; vx?: number; vy?: number; label_width?: number }
type SimLink = Omit<TaskMapLink, 'source' | 'target'> & { source: string | SimNode; target: string | SimNode }

interface Palette {
  label: string
  open: string
  done: string
  subtask: string
  relationship: string
  font: string
}

function palette(): Palette {
  const style = getComputedStyle(document.documentElement)
  const colour = (name: string) => style.getPropertyValue(name).trim()
  return {
    label: colour('--text-body'),
    open: colour('--accent'),
    done: colour('--text-tertiary'),
    subtask: colour('--border-control'),
    relationship: colour('--accent'),
    font: getComputedStyle(document.body).fontFamily
  }
}

function radius_of(node: SimNode): number {
  return BASE_RADIUS + Math.sqrt(node.degree) * 2
}

// Shortens text with an ellipsis until it fits the given width.
function fitted(context: CanvasRenderingContext2D, text: string, width: number): string {
  if (context.measureText(text).width <= width) return text
  let length = text.length
  while (length > 0 && context.measureText(`${text.slice(0, length)}…`).width > width) length--
  return `${text.slice(0, length)}…`
}

function draw_node(node: SimNode, context: CanvasRenderingContext2D, colours: Palette): void {
  const x = node.x ?? 0
  const y = node.y ?? 0
  const radius = radius_of(node)
  context.beginPath()
  context.arc(x, y, radius, 0, 2 * Math.PI)
  context.fillStyle = node.task.is_done ? colours.done : colours.open
  context.fill()

  context.font = `${FONT_SIZE}px ${colours.font}`
  context.textAlign = 'center'
  context.textBaseline = 'top'
  context.fillStyle = node.task.is_done ? colours.done : colours.label
  const label = fitted(context, node.task.title, LABEL_WIDTH)
  node.label_width = context.measureText(label).width
  context.fillText(label, x, y + radius + LABEL_GAP)
}

// The space a task's dot and label take, from its centre: half its width, and how far it reaches up and down.
function box_of(node: SimNode): { half_width: number; top: number; bottom: number } {
  const radius = radius_of(node)
  return { half_width: Math.max(node.label_width ?? LABEL_WIDTH, radius * 2) / 2 + BOX_PADDING, top: radius + BOX_PADDING, bottom: radius + LABEL_GAP + FONT_SIZE + BOX_PADDING }
}

// Pushes apart any two tasks whose dots or labels overlap, along whichever way they overlap least.
function separate_boxes(nodes: SimNode[]): void {
  for (let first_index = 0; first_index < nodes.length; first_index++) {
    for (let second_index = first_index + 1; second_index < nodes.length; second_index++) {
      const first = nodes[first_index]!
      const second = nodes[second_index]!
      const first_box = box_of(first)
      const second_box = box_of(second)
      const gap_x = (second.x ?? 0) - (first.x ?? 0)
      const gap_y = (second.y ?? 0) - (first.y ?? 0)
      const overlap_x = first_box.half_width + second_box.half_width - Math.abs(gap_x)
      const overlap_y = (gap_y >= 0 ? first_box.bottom + second_box.top : first_box.top + second_box.bottom) - Math.abs(gap_y)
      if (overlap_x <= 0 || overlap_y <= 0) continue
      if (overlap_x < overlap_y) {
        const push = (overlap_x / 2) * (gap_x >= 0 ? 1 : -1)
        first.x = (first.x ?? 0) - push
        second.x = (second.x ?? 0) + push
      } else {
        const push = (overlap_y / 2) * (gap_y >= 0 ? 1 : -1)
        first.y = (first.y ?? 0) - push
        second.y = (second.y ?? 0) + push
      }
    }
  }
}

// A force-graph force: a function run each step, with initialize handed the nodes.
function custom_force(step: (nodes: SimNode[], alpha: number) => void) {
  let nodes: SimNode[] = []
  return Object.assign((alpha: number) => step(nodes, alpha), { initialize: (given: SimNode[]) => (nodes = given) })
}

// ============================================================================
// Card
// ============================================================================

interface TaskMapProps {
  nodes: TaskMapNode[]
  links: TaskMapLink[]
  on_select_task: (task: Task) => void
}

export function TaskMap(props: TaskMapProps) {
  if (props.nodes.length === 0) return <p className="report_empty">No subtasks or linked tasks here.</p>
  return <TaskMapCanvas {...props} />
}

function TaskMapCanvas({ nodes, links, on_select_task }: TaskMapProps) {
  const container_ref = useRef<HTMLDivElement>(null)
  const graph_ref = useRef<ForceGraph<SimNode, SimLink> | null>(null)
  const select_ref = useRef(on_select_task)
  select_ref.current = on_select_task
  const data_ref = useRef({ nodes, links })
  data_ref.current = { nodes, links }
  const is_fit_pending = useRef(true)
  // The page draws again on every change in the app, so the map only takes new data when its tasks or lines change.
  const signature = JSON.stringify([
    nodes.map(({ id, task, degree }) => [id, task.title, task.is_done, degree]),
    links.map(({ source, target, description }) => [source, target, description])
  ])

  useEffect(() => {
    const container = container_ref.current!
    let colours = palette()
    let is_closed = false
    let graph: ForceGraph<SimNode, SimLink> | null = null
    const repaint = () => {
      colours = palette()
      graph?.nodeRelSize(graph.nodeRelSize())
    }
    const resize = new ResizeObserver(() => graph?.width(container.clientWidth).height(container.clientHeight))
    const theme = new MutationObserver(repaint)
    const dark_scheme = window.matchMedia('(prefers-color-scheme: dark)')

    // Loaded only when a map card shows, since the library needs a real canvas.
    void import('force-graph').then(({ default: ForceGraphClass }) => {
      if (is_closed) return
      graph = new ForceGraphClass<SimNode, SimLink>(container)
        .width(container.clientWidth)
        .height(container.clientHeight)
        .nodeId('id')
        .nodeLabel(() => '')
        .nodeCanvasObject((node, context) => draw_node(node, context, colours))
        .nodePointerAreaPaint((node, colour, context) => {
          context.beginPath()
          context.arc(node.x ?? 0, node.y ?? 0, radius_of(node) + 2, 0, 2 * Math.PI)
          context.fillStyle = colour
          context.fill()
        })
        .linkColor((link) => (link.kind === 'subtask' ? colours.subtask : colours.relationship))
        .linkWidth((link) => (link.kind === 'subtask' ? 1.2 : 1))
        .linkLineDash((link) => (link.kind === 'subtask' ? null : [4, 3]))
        .linkDirectionalArrowLength((link) => (link.is_directed ? ARROW_LENGTH : 0))
        .linkDirectionalArrowRelPos(1)
        .linkDirectionalArrowColor(() => colours.relationship)
        .linkLabel(() => '')
        .onNodeHover((node) => {
          // Long titles are shortened on the map, so the full title shows as the pointer's tooltip.
          container.title = node?.task.title ?? ''
          container.style.cursor = node ? 'pointer' : ''
        })
        .onLinkHover((link) => (container.title = link?.description ?? ''))
        .onNodeClick((node) => select_ref.current(node.task))
        // Scrolling moves the page; holding Ctrl while scrolling zooms the map.
        .enableZoomInteraction((event) => event.ctrlKey || event.metaKey)
        .cooldownTime(3000)
        .onEngineStop(() => {
          if (!is_fit_pending.current) return
          is_fit_pending.current = false
          graph?.zoomToFit(400, FIT_MARGIN)
        })
      graph.d3Force('charge')?.strength?.(-120)
      graph.d3Force('link')?.distance?.(LINK_LENGTH)
      graph.d3Force('boxes', custom_force(separate_boxes))
      graph.d3Force('centre_pull', custom_force((nodes, alpha) => {
        for (const node of nodes) {
          node.vx = (node.vx ?? 0) - (node.x ?? 0) * CENTRE_PULL * alpha
          node.vy = (node.vy ?? 0) - (node.y ?? 0) * CENTRE_PULL * alpha
        }
      }))
      graph_ref.current = graph
      graph.graphData(structuredClone(data_ref.current))
      resize.observe(container)
      theme.observe(document.documentElement, { attributes: true })
      dark_scheme.addEventListener('change', repaint)
    })

    return () => {
      is_closed = true
      resize.disconnect()
      theme.disconnect()
      dark_scheme.removeEventListener('change', repaint)
      graph?._destructor()
      graph_ref.current = null
    }
  }, [])

  // Hands the map its new tasks and lines, keeping each task that stays where it was.
  useEffect(() => {
    const graph = graph_ref.current
    if (!graph) return
    is_fit_pending.current = true
    const old_nodes = new Map(graph.graphData().nodes.map((node) => [node.id, node]))
    graph.graphData({
      nodes: data_ref.current.nodes.map((node) => Object.assign(old_nodes.get(node.id) ?? {}, node)),
      links: data_ref.current.links.map((link) => ({ ...link }))
    })
  }, [signature])

  return <div ref={container_ref} className="report_task_map" />
}
