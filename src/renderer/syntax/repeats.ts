import { add_days, day_of, read_day, today_of, VALUE_DATE_OPTIONS, weekday_of } from './dates'

// ============================================================================
// Repeat phrases
// ============================================================================

const RULE_DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

const FREQUENCIES: Record<string, string> = { day: 'DAILY', week: 'WEEKLY', month: 'MONTHLY', year: 'YEARLY' }

const SINGLE_WORDS: Record<string, string> = {
  daily: 'FREQ=DAILY', weekly: 'FREQ=WEEKLY', monthly: 'FREQ=MONTHLY', yearly: 'FREQ=YEARLY', annually: 'FREQ=YEARLY'
}

export interface Repeat {
  // An RFC 5545 rule without the RRULE: prefix.
  rule: string
  // The first day it falls on from today, for a task given no date of its own.
  first_day: string
  // How many words the phrase took.
  length: number
}

function interval_part(interval: number): string {
  return interval > 1 ? `;INTERVAL=${interval}` : ''
}

// The first day from today, today included, whose weekday is one of these.
function first_weekday(weekdays: number[], now: Date): string {
  const today = today_of(now)
  for (let ahead = 0; ahead < 7; ahead += 1) {
    const day = add_days(today, ahead)
    if (weekdays.includes(day.getDay())) return day_of(day)
  }
  return day_of(today)
}

// The first coming of a day of the month, this month or the next, skipping months too short for it.
function first_month_day(day_number: number, now: Date): string {
  const today = today_of(now)
  for (let ahead = 0; ahead < 13; ahead += 1) {
    const day = new Date(today.getFullYear(), today.getMonth() + ahead, day_number)
    if (day.getDate() === day_number && day >= today) return day_of(day)
  }
  return day_of(today)
}

// Weekday names after "every", such as "mon, wed and fri", and how many words they took.
function read_weekday_list(words: string[]): { weekdays: number[]; length: number } {
  const weekdays: number[] = []
  let length = 0

  for (const word of words) {
    if (word === 'and' && weekdays.length > 0) {
      length += 1
      continue
    }
    const weekday = weekday_of(word.replace(/,$/, ''), true)
    if (weekday === null) break
    weekdays.push(weekday)
    length += 1
  }

  // A trailing "and" belongs to whatever follows, not to the list.
  if (words[length - 1] === 'and') length -= 1
  return { weekdays, length }
}

// A repeat at the front of the words, such as "every other week", "every mon, wed and fri", "every 27th" or "daily".
export function find_repeat(words: string[], start: number, now: Date): Repeat | null {
  const rest = words.slice(start)
  const [first = '', second = '', third = ''] = rest
  const today = day_of(today_of(now))

  const single = SINGLE_WORDS[first]
  if (single) return { rule: single, first_day: today, length: 1 }
  if (first !== 'every') return null

  // "every day", "every other week", "every 3 months".
  const interval = second === 'other' ? 2 : /^\d+$/.test(second) ? Number(second) : 1
  const unit_word = interval === 1 && second !== '1' ? second : third
  const unit = /^(day|week|month|year)s?$/.exec(unit_word)?.[1]
  if (unit && interval >= 1) {
    return { rule: `FREQ=${FREQUENCIES[unit]}${interval_part(interval)}`, first_day: today, length: unit_word === second ? 2 : 3 }
  }

  if (second === 'weekday' || second === 'weekdays') {
    return { rule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', first_day: first_weekday([1, 2, 3, 4, 5], now), length: 2 }
  }
  if (second === 'weekend' || second === 'weekends') {
    return { rule: 'FREQ=WEEKLY;BYDAY=SA,SU', first_day: first_weekday([0, 6], now), length: 2 }
  }

  // "every other monday" or "every mon, wed and fri".
  const is_every_other = second === 'other'
  const list = read_weekday_list(rest.slice(is_every_other ? 2 : 1))
  if (list.weekdays.length > 0) {
    const by_day = [...new Set(list.weekdays)].sort((a, b) => a - b).map((weekday) => RULE_DAYS[weekday]).join(',')
    return {
      rule: `FREQ=WEEKLY${interval_part(is_every_other ? 2 : 1)};BYDAY=${by_day}`,
      first_day: first_weekday(list.weekdays, now),
      length: list.length + (is_every_other ? 2 : 1)
    }
  }

  // "every 27th" repeats monthly on that day.
  const month_day = /^(\d{1,2})(st|nd|rd|th)$/.exec(second)
  if (month_day && Number(month_day[1]) >= 1 && Number(month_day[1]) <= 31) {
    const day_number = Number(month_day[1])
    return { rule: `FREQ=MONTHLY;BYMONTHDAY=${day_number}`, first_day: first_month_day(day_number, now), length: 2 }
  }

  return null
}

// A repeat written as a whole value, such as GTG's every:week, every:monday, every:27 or every:0401.
export function read_repeat_value(text: string, now: Date): Omit<Repeat, 'length'> | null {
  const words = text.toLowerCase().split(/[\s-]+/).filter(Boolean)
  if (words.length === 0) return null

  const with_every = words[0] === 'every' ? words : ['every', ...words]
  const repeat = find_repeat(with_every, 0, now)
  if (repeat && repeat.length === with_every.length) return { rule: repeat.rule, first_day: repeat.first_day }

  // A bare day number repeats monthly on it, and a full date yearly on its day.
  const day_number = /^\d{1,2}$/.test(words.join('')) ? Number(words.join('')) : null
  if (day_number !== null && day_number >= 1 && day_number <= 31) {
    return { rule: `FREQ=MONTHLY;BYMONTHDAY=${day_number}`, first_day: first_month_day(day_number, now) }
  }
  const date = read_day(words, VALUE_DATE_OPTIONS, now)
  if (!date) return null
  return { rule: `FREQ=YEARLY;BYMONTH=${date.getMonth() + 1};BYMONTHDAY=${date.getDate()}`, first_day: day_of(date) }
}
