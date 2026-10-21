// The daily and weekly report: what you trained, which muscles it reached, what it burned, how
// many steps you walked, and — for a week — how it measures up to the goals and to the week before.
// Pure: everything comes from the state handed in, so the numbers can be tested without the UI.
import { loadOfWorkouts, MUSCLES } from './muscles.js'
import { workoutVolume } from './history.js'
import { bestSetOf, formulaOf } from './onerm.js'
import { isWarmupRow, hasCompletedWork } from './workout-model.js'
import { isoOf, weekKey } from './format.js'
import { dayKcal, stepsOn, stepGoalOf, weekDays } from './activity.js'
import { muscleDays, weekGoalOf, weekGoalRows } from './week-goals.js'

const list = v => (Array.isArray(v) ? v : [])
const shift = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoOf(d) }
const onlyMuscles = load => Object.fromEntries(MUSCLES.filter(m => load[m] > 0).map(m => [m, load[m]]))

/** Completed work sets in a list of workouts (warm-ups left out). */
export const workSets = workouts => list(workouts).reduce((n, w) =>
  n + list(w?.entries).reduce((k, e) => k + list(e?.sets).filter(s => s && hasCompletedWork(s) && !isWarmupRow(s)).length, 0), 0)

/** One day: { iso, workouts, load, sets, volume, prs, kcal, steps, stepGoal }. */
export function dayReport(S, iso) {
  const workouts = list(S?.workouts).filter(w => w?.d === iso)
  return {
    iso,
    workouts,
    load: onlyMuscles(loadOfWorkouts(workouts)),
    sets: workSets(workouts),
    volume: Math.round(workouts.reduce((v, w) => v + workoutVolume(w), 0)),
    prs: workouts.reduce((n, w) => n + list(w.prs).length, 0),
    kcal: dayKcal(S, iso),
    steps: stepsOn(S, iso),
    stepGoal: stepGoalOf(S),
  }
}

/** Totals of a run of days, for one week. */
function totalsOf(S, isos) {
  const set = new Set(isos)
  const workouts = list(S?.workouts).filter(w => set.has(w?.d))
  let kcal = 0, steps = 0, stepDays = 0
  for (const iso of isos) {
    kcal += dayKcal(S, iso).total
    const n = stepsOn(S, iso)
    if (n) { steps += n; stepDays++ }
  }
  return {
    workouts: workouts.length,
    days: new Set(workouts.map(w => w.d)).size,
    sets: workSets(workouts),
    volume: Math.round(workouts.reduce((v, w) => v + workoutVolume(w), 0)),
    prs: workouts.reduce((n, w) => n + list(w.prs).length, 0),
    kcal, steps, stepDays,
  }
}

/** Change from `before` to `now` as a fraction (0.1 = +10%), or null when there is nothing to compare with. */
export const changeOf = (now, before) => (before > 0 ? (now - before) / before : null)

/**
 * Exercises whose best estimated one-rep max this week beat everything logged before the week:
 * [{ id, before, now, gain }] largest gain first. An exercise new this week has no `before` and is
 * left out — there is nothing to have improved on.
 */
export function strengthGains(S, from, to) {
  const formula = formulaOf(S)
  const prior = new Map(), week = new Map()
  for (const w of list(S?.workouts)) {
    if (!w?.d || w.d > to) continue
    const into = w.d < from ? prior : week
    for (const e of list(w.entries)) {
      const best = bestSetOf(e, formula)
      if (best && (!into.has(e.id) || best.est > into.get(e.id))) into.set(e.id, best.est)
    }
  }
  const out = []
  for (const [id, now] of week) {
    const before = prior.get(id)
    if (before > 0 && now > before) out.push({ id, before, now, gain: (now - before) / before })
  }
  return out.sort((a, b) => b.gain - a.gain)
}

/**
 * The week that `iso` falls in, `ws` being the first weekday:
 *   { from, to, days: [dayReport…], load, trained, goal, goals, totals, prev, change, gains, stepGoal }
 * `trained` is per muscle the days it was trained on, `goals` the goal rows (lib/week-goals.js),
 * `prev` the week before's totals and `change` this week against it.
 */
export function weekReport(S, iso, ws = 1) {
  const from = weekKey(iso, ws)
  const isos = weekDays(from)
  const to = isos[6]
  const set = new Set(isos)
  const workouts = list(S?.workouts).filter(w => set.has(w?.d))
  const trained = muscleDays(workouts, isos)
  const goal = weekGoalOf(S, from)
  const totals = totalsOf(S, isos)
  const prev = totalsOf(S, weekDays(shift(from, -7)))
  return {
    from, to,
    days: isos.map(d => dayReport(S, d)),
    load: onlyMuscles(loadOfWorkouts(workouts)),
    trained,
    goal,
    goals: weekGoalRows(goal, trained),
    totals,
    prev,
    change: {
      volume: changeOf(totals.volume, prev.volume),
      sets: changeOf(totals.sets, prev.sets),
      kcal: changeOf(totals.kcal, prev.kcal),
      steps: changeOf(totals.steps, prev.steps),
    },
    gains: strengthGains(S, from, to),
    stepGoal: stepGoalOf(S),
  }
}
