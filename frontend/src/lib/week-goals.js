// Weekly goals: how many days this week each muscle should be trained, set ahead of the week,
// and how the days you actually logged measure up.
//
// Stored per week, keyed by the iso date the week starts on, stamped like a day's note
// (lib/day-notes.js) so two devices editing different weeks keep both:
//
//   S.weekGoals = { '2026-10-19': { m: { chest: 2, quadriceps: 1, … }, _ts }, … }
//
// A muscle counts as trained on a day once that day's completed work sets give it at least one
// effective set (lib/muscles.js loadOf: a set counts 1 for the muscles it targets, half for
// the ones it only helps), so two sets of an exercise that merely assists a muscle count too,
// one does not.
import { MUSCLES, loadOfWorkouts } from './muscles.js'
import { isoOf } from './format.js'

const isMap = v => !!v && typeof v === 'object' && !Array.isArray(v)

/** Effective sets a muscle needs in one day for the day to count towards its goal. */
export const DAY_MIN_LOAD = 1
/** The most days a goal can ask for: the whole week. */
export const GOAL_DAYS_MAX = 7

const days = v => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) && n > 0 ? Math.min(n, GOAL_DAYS_MAX) : 0
}

/** A stored week read back: { muscle: days } with only real muscles and positive days, or null. */
export function readWeekGoal(entry) {
  if (!isMap(entry) || !isMap(entry.m)) return null
  const m = {}
  for (const slug of MUSCLES) { const n = days(entry.m[slug]); if (n) m[slug] = n }
  return Object.keys(m).length ? m : null
}

const shift = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoOf(d) }

/**
 * The goal set for the week starting `wk`. A week stored under the day next to it is the same
 * week seen from the other first weekday (Monday ↔ Sunday), so a changed setting keeps its goals.
 */
export function weekGoalOf(S, wk) {
  const map = isMap(S?.weekGoals) ? S.weekGoals : {}
  // Of the keys that still hold a goal, the one written last (withWeekGoal retires the others).
  let best = null, at = -1
  for (const k of [wk, shift(wk, -1), shift(wk, 1)]) {
    const g = readWeekGoal(map[k])
    const ts = Number(map[k]?._ts) || 0
    if (g && ts > at) { best = g; at = ts }
  }
  return best
}

/** The most recent goal set for a week before `wk`, to start a new week from. */
export function lastWeekGoalBefore(S, wk) {
  const map = isMap(S?.weekGoals) ? S.weekGoals : {}
  const keys = Object.keys(map).filter(k => k < shift(wk, -1)).sort().reverse()
  for (const k of keys) { const g = readWeekGoal(map[k]); if (g) return g }
  return null
}

/** S.weekGoals with week `wk` set to `goal` ({ muscle: days }), stamped `now`. Empty clears it. */
export function withWeekGoal(map, wk, goal, now = Date.now()) {
  const m = readWeekGoal({ m: goal })
  const out = { ...(isMap(map) ? map : {}) }
  // The same week stored under its neighbouring day (another first weekday) goes, or it would
  // keep answering for this week.
  for (const k of [shift(wk, -1), shift(wk, 1)]) if (k in out && readWeekGoal(out[k])) out[k] = { _ts: now }
  out[wk] = m ? { m, _ts: now } : { _ts: now }
  return out
}

/** Per muscle, the days in `isos` it was trained on: { muscle: [iso, …] }. */
export function muscleDays(workouts, isos) {
  const out = {}
  for (const iso of isos) {
    const load = loadOfWorkouts((workouts || []).filter(w => w?.d === iso))
    for (const slug of MUSCLES) {
      if ((load[slug] || 0) >= DAY_MIN_LOAD) (out[slug] ||= []).push(iso)
    }
  }
  return out
}

/** How a goal of `target` days stands at `done` days: 'short', 'met' or 'over'; 'none' with no goal. */
export function goalStatus(target, done) {
  if (!(target > 0)) return 'none'
  return done > target ? 'over' : done === target ? 'met' : 'short'
}

/**
 * The week's goals against what was trained, one row per muscle with a goal or with a trained
 * day, goals first: [{ muscle, target, done, status }]. `summary` is 'none' without goals,
 * 'over' when every goal is met and at least one exceeded, 'met' when every goal is met, and
 * 'short' otherwise; `met`/`total` count the goals reached.
 */
export function weekGoalRows(goal, trained) {
  const g = goal || {}
  const rows = MUSCLES
    .filter(m => g[m] > 0 || (trained[m] || []).length > 0)
    .map(m => {
      const target = g[m] || 0, done = (trained[m] || []).length
      return { muscle: m, target, done, status: goalStatus(target, done) }
    })
    .sort((a, b) => (b.target > 0) - (a.target > 0) || MUSCLES.indexOf(a.muscle) - MUSCLES.indexOf(b.muscle))
  const goals = rows.filter(r => r.target > 0)
  const met = goals.filter(r => r.status !== 'short').length
  const summary = !goals.length ? 'none'
    : met < goals.length ? 'short'
    : goals.some(r => r.status === 'over') ? 'over' : 'met'
  return { rows, met, total: goals.length, summary }
}
