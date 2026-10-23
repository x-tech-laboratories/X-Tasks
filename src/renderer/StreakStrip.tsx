import type { HistoryMark } from '@shared/streaks'

// ============================================================================
// Streak strip
// ============================================================================

const STATE_LABELS: Record<HistoryMark['state'], string> = {
  on_time: 'Done',
  late: 'Done late',
  missed: 'Missed',
  pending: 'Not done yet'
}

interface StreakStripProps {
  history: HistoryMark[]
  limit: number
}

// The latest occurrences or rounds as dots, oldest on the left: filled when done, half filled when late, a hollow ring when missed.
export function StreakStrip({ history, limit }: StreakStripProps) {
  const marks = history.slice(-limit)
  const summary = (['on_time', 'late', 'missed', 'pending'] as const)
    .map((state) => `${marks.filter((mark) => mark.state === state).length} ${STATE_LABELS[state].toLowerCase()}`)
    .join(', ')

  return (
    <span class="streak_strip" role="img" aria-label={`Last ${marks.length}: ${summary}`}>
      {marks.map((mark) => {
        const day = new Date(mark.time).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
        return <span key={mark.time} class={`streak_dot is_${mark.state}`} title={`${STATE_LABELS[mark.state]} · ${day}`} />
      })}
    </span>
  )
}
