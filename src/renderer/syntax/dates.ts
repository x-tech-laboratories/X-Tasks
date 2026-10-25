import { format_task_date } from '@shared/schedule'

// ============================================================================
// Words
// ============================================================================

export const WEEKDAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

const WEEKDAY_ABBREVIATIONS: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6
}

const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

const MONTH_ABBREVIATIONS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11
}

const UNIT_PATTERN = /^(day|week|month|year)s?$/

// The weekday a word names, 0 for Sunday, or null; short forms such as "fri" count only when allowed.
export function weekday_of(word: string, allows_short_forms: boolean): number | null {
  const full = WEEKDAY_NAMES.indexOf(word)
  if (full >= 0) return full
  return allows_short_forms ? (WEEKDAY_ABBREVIATIONS[word] ?? null) : null
}

function month_of(word: string): number | null {
  const full = MONTH_NAMES.indexOf(word)
  if (full >= 0) return full
  return MONTH_ABBREVIATIONS[word] ?? null
}

// A day of the month such as 27 or 27th.
function day_number_of(word: string): number | null {
  const match = /^(\d{1,2})(st|nd|rd|th)?,?$/.exec(word)
  if (!match) return null
  const day = Number(match[1])
  return day >= 1 && day <= 31 ? day : null
}

// ============================================================================
// Days
// ============================================================================

function day_at(year: number, month: number, day: number): Date {
  return new Date(year, month, day)
}

export function today_of(now: Date): Date {
  return day_at(now.getFullYear(), now.getMonth(), now.getDate())
}

export function add_days(date: Date, days: number): Date {
  return day_at(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

// Adding a month to the 31st lands on the last day of a shorter month rather than spilling into the next.
function add_months(date: Date, months: number): Date {
  const target = day_at(date.getFullYear(), date.getMonth() + months, 1)
  const last_day = day_at(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  return day_at(target.getFullYear(), target.getMonth(), Math.min(date.getDate(), last_day))
}

export function add_units(date: Date, amount: number, unit: string): Date {
  if (unit.startsWith('day')) return add_days(date, amount)
  if (unit.startsWith('week')) return add_days(date, amount * 7)
  if (unit.startsWith('month')) return add_months(date, amount)
  return add_months(date, amount * 12)
}

// The next day after today falling on the weekday.
export function next_weekday(weekday: number, now: Date): Date {
  const today = today_of(now)
  const ahead = (weekday - today.getDay() + 7) % 7 || 7
  return add_days(today, ahead)
}

// A day given without a year is the next time it comes round, today included.
function next_month_day(month: number, day: number, now: Date): Date {
  const today = today_of(now)
  const this_year = day_at(today.getFullYear(), month, day)
  return this_year < today ? day_at(today.getFullYear() + 1, month, day) : this_year
}

// A day of the month alone, such as "27", is its next coming, this month or the next.
function next_day_of_month(day: number, now: Date): Date {
  const today = today_of(now)
  const this_month = day_at(today.getFullYear(), today.getMonth(), day)
  return this_month < today ? day_at(today.getFullYear(), today.getMonth() + 1, day) : this_month
}

function is_real_date(date: Date, year: number, month: number, day: number): boolean {
  return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day
}

// ============================================================================
// Day phrases
// ============================================================================

export interface DateOptions {
  // Whether bare numbers count: "27" as a day of the month and "0401" as April 1st, safe only in a value nobody writes as words.
  allows_bare_numbers: boolean
  // Whether short weekday names such as "sat" count, which in a title are as likely to be ordinary words.
  allows_short_forms: boolean
}

export const VALUE_DATE_OPTIONS: DateOptions = { allows_bare_numbers: true, allows_short_forms: true }
export const TITLE_DATE_OPTIONS: DateOptions = { allows_bare_numbers: false, allows_short_forms: false }

function read_numeric_day(word: string, options: DateOptions, now: Date): Date | null {
  const full = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(word) ?? (options.allows_bare_numbers ? /^(\d{4})(\d{2})(\d{2})$/.exec(word) : null)
  if (full) {
    const [year, month, day] = [Number(full[1]), Number(full[2]) - 1, Number(full[3])]
    const date = day_at(year, month, day)
    return is_real_date(date, year, month, day) ? date : null
  }
  if (!options.allows_bare_numbers) return null

  const month_and_day = /^(\d{2})(\d{2})$/.exec(word)
  if (month_and_day) {
    const [month, day] = [Number(month_and_day[1]) - 1, Number(month_and_day[2])]
    const date = next_month_day(month, day, now)
    return is_real_date(date, date.getFullYear(), month, day) ? date : null
  }
  const day = day_number_of(word)
  return day === null ? null : next_day_of_month(day, now)
}

// A day named by the words, all of them, such as "tomorrow", "next friday", "in 3 weeks" or "march 30 2027"; null when they name none.
export function read_day(words: string[], options: DateOptions, now: Date): Date | null {
  const [first = '', second = '', third = ''] = words
  const today = today_of(now)

  if (words.length === 1) {
    if (first === 'today' || first === 'tod') return today
    if (first === 'tomorrow' || first === 'tmr' || first === 'tom') return add_days(today, 1)
    if (first === 'yesterday') return add_days(today, -1)
    if (first === 'eom') return day_at(today.getFullYear(), today.getMonth() + 1, 0)
    const weekday = weekday_of(first, options.allows_short_forms)
    if (weekday !== null) return next_weekday(weekday, now)
    return read_numeric_day(first, options, now)
  }

  if (words.length === 2 && (first === 'next' || first === 'this')) {
    if (UNIT_PATTERN.test(second) && first === 'next') return add_units(today, 1, second)
    const weekday = weekday_of(second, true)
    if (weekday !== null) return next_weekday(weekday, now)
    return null
  }

  if (words.length === 3 && first === 'in' && /^\d+$/.test(second) && UNIT_PATTERN.test(third)) return add_units(today, Number(second), third)
  if (words.join(' ') === 'end of month') return day_at(today.getFullYear(), today.getMonth() + 1, 0)

  // "march 30", "30 march", either with a year after it.
  if (words.length === 2 || words.length === 3) {
    const year_word = words.length === 3 ? third : null
    const year = year_word === null ? null : /^\d{4}$/.test(year_word) ? Number(year_word) : NaN
    if (Number.isNaN(year)) return null

    const month_first = month_of(first.replace(/\.$/, ''))
    const day_first = day_number_of(first)
    const [month, day] = month_first !== null ? [month_first, day_number_of(second)] : day_first !== null ? [month_of(second), day_first] : [null, null]
    if (month === null || day === null) return null
    const date = year === null ? next_month_day(month, day, now) : day_at(year, month, day)
    return is_real_date(date, date.getFullYear(), month, day) ? date : null
  }

  return null
}

// ============================================================================
// Times
// ============================================================================

export interface ClockTime {
  hours: number
  minutes: number
}

// A time such as "5pm", "5:30pm", "17:00" or "noon"; a plain number is not taken for one.
export function read_time(word: string): ClockTime | null {
  if (word === 'noon') return { hours: 12, minutes: 0 }
  if (word === 'midnight') return { hours: 0, minutes: 0 }

  const twelve_hour = /^(\d{1,2})(?::(\d{2}))?(am|pm)$/.exec(word)
  if (twelve_hour) {
    const hours = Number(twelve_hour[1])
    const minutes = Number(twelve_hour[2] ?? 0)
    if (hours < 1 || hours > 12 || minutes > 59) return null
    return { hours: (hours % 12) + (twelve_hour[3] === 'pm' ? 12 : 0), minutes }
  }

  const twenty_four_hour = /^(\d{1,2}):(\d{2})$/.exec(word)
  if (!twenty_four_hour) return null
  const hours = Number(twenty_four_hour[1])
  const minutes = Number(twenty_four_hour[2])
  return hours <= 23 && minutes <= 59 ? { hours, minutes } : null
}

// "at 5pm" or "5pm" at the front of the words, and how many words it took.
function read_time_at(words: string[]): { time: ClockTime; length: number } | null {
  const has_at = words[0] === 'at'
  const time = read_time(words[has_at ? 1 : 0] ?? '')
  return time ? { time, length: has_at ? 2 : 1 } : null
}

function with_time(day: Date, time: ClockTime): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), time.hours, time.minutes)
}

// ============================================================================
// Task dates
// ============================================================================

// The longest a day phrase runs, as in "in 3 weeks" or "march 30 2027".
const LONGEST_DAY_PHRASE = 3

// A task date, as YYYY-MM-DD or with a time, written as the whole text, such as "friday", "tomorrow at 9am" or "2026-03-30 17:00".
export function read_task_date(text: string, options: DateOptions, now: Date): string | null {
  const stamp = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})$/i.exec(text.trim())
  if (stamp && read_day([stamp[1]!], options, now) && read_time(stamp[2]!)) return `${stamp[1]}T${stamp[2]}`

  const words = split_words(text)
  if (words.length === 0) return null
  const found = find_task_date(words, 0, options, now)
  return found && found.length === words.length ? found.date : null
}

// The task date starting at a word, such as "next friday at 5pm", with the number of words it takes; a time alone means today.
export function find_task_date(words: string[], start: number, options: DateOptions, now: Date): { date: string; length: number } | null {
  for (let length = Math.min(LONGEST_DAY_PHRASE, words.length - start); length >= 1; length -= 1) {
    const day = read_day(words.slice(start, start + length), options, now)
    if (!day) continue

    const time = read_time_at(words.slice(start + length))
    if (!time) return { date: format_task_date(day, false), length }
    return { date: format_task_date(with_time(day, time.time), true), length: length + time.length }
  }

  const time = read_time_at(words.slice(start))
  if (!time) return null
  return { date: format_task_date(with_time(today_of(now), time.time), true), length: time.length }
}

export function split_words(text: string): string[] {
  return text.toLowerCase().split(/\s+/).filter(Boolean)
}

export function day_of(date: Date): string {
  return format_task_date(date, false)
}
