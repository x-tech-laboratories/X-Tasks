// ============================================================================
// recurrence-input
// ============================================================================

declare module 'recurrence-input' {
  export type RuleFormat = 'utc' | 'floating' | { time_mode: 'utc' | 'floating'; all_day: boolean }

  export function describe_rule(rule: string, format?: RuleFormat): string
  export function next_occurrence(rule: string, start_date: Date, format?: RuleFormat): { next_date: Date; rule: string } | null
  export function next_from_now(rule: string, format?: RuleFormat): Date | null

  export interface RecurrenceInputElement extends HTMLElement {
    value: string
  }
}
