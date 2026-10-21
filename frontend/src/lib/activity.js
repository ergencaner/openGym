// Daily activity beside the workouts: the steps you walked and the calories a day burned.
//
// Both are stored per day, stamped the way a day's note is (lib/day-notes.js), so two devices
// that each logged a different day keep both and the same day keeps the later entry
// (lib/sync-merge.js mergeStampedMap). Clearing a day writes a stamped empty entry, never a
// deleted key, which the other device's copy would bring straight back:
//
//   S.steps   = { '2026-10-21': { n: 8400, _ts }, … }
//   S.dayKcal = { '2026-10-21': { kcal: 520, _ts }, … }   // your own number, over the estimate
//
// The calories are an estimate unless you typed the day's number yourself. The estimate is the
// usual MET formula — kcal = MET × body weight (kg) × hours — over how long each workout took,
// with its cardio minutes at a MET read from their speed and the rest at a resistance-training
// MET. Steps add their own, at roughly 0.04 kcal a step for a 70 kg walker, scaled by weight.
import { isoOf } from './format.js'
import { hasCompletedWork, isWarmupRow } from './workout-model.js'

const isMap = v => !!v && typeof v === 'object' && !Array.isArray(v)
const ISO = /^\d{4}-\d{2}-\d{2}$/
const LB_PER_KG = 2.2046226218

/** The most steps one day can hold; anything above is a typo. */
export const STEPS_MAX = 200000
/** The most calories one day can be given by hand. */
export const KCAL_MAX = 20000
/** Body weight assumed for an estimate when none has been logged yet. */
export const DEFAULT_KG = 75
/** Resistance training, vigorous effort with rests between sets (Compendium of Physical Activities 02054). */
export const MET_STRENGTH = 5
/** A cardio set logged without a speed: moderate machine work. */
export const MET_CARDIO = 7
/** kcal per step per kg of body weight (≈ 0.04 kcal a step at 70 kg). */
export const KCAL_PER_STEP_KG = 0.00057
/** Minutes credited per completed set when a workout carries no usable length. */
export const MIN_PER_SET = 2.5
/** A workout longer than this is a session left open, not one trained through. */
export const MAX_WORKOUT_MIN = 240

const intIn = (v, max) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : null
}

/* ---------------- steps ---------------- */

/** A stored day read back: the step count, or null for none or a cleared day. */
export const readSteps = entry => (isMap(entry) ? intIn(entry.n, STEPS_MAX) : null)

/** Steps logged on `iso`, or null. */
export const stepsOn = (S, iso) => readSteps(isMap(S?.steps) ? S.steps[iso] : null)

/** S.steps with `iso` set to `n`, stamped `now`. Nothing or 0 clears the day. */
export function withSteps(map, iso, n, now = Date.now()) {
  const v = intIn(n, STEPS_MAX)
  return { ...(isMap(map) ? map : {}), [iso]: v ? { n: v, _ts: now } : { _ts: now } }
}

/** The daily step goal, or null when switched off. */
export const stepGoalOf = S => intIn(S?.stepGoal, STEPS_MAX)

/* ---------------- a day's own calorie number ---------------- */

export const readDayKcal = entry => (isMap(entry) ? intIn(entry.kcal, KCAL_MAX) : null)
export const dayKcalOverride = (S, iso) => readDayKcal(isMap(S?.dayKcal) ? S.dayKcal[iso] : null)

/** S.dayKcal with `iso` set to `kcal`, stamped `now`. Nothing clears it back to the estimate. */
export function withDayKcal(map, iso, kcal, now = Date.now()) {
  const v = intIn(kcal, KCAL_MAX)
  return { ...(isMap(map) ? map : {}), [iso]: v ? { kcal: v, _ts: now } : { _ts: now } }
}

/* ---------------- body weight ---------------- */

const toKg = (w, unit) => (unit === 'lb' ? w / LB_PER_KG : w)

/**
 * Body weight in kg for a day: the workout's own weigh-in if it has one, otherwise the last
 * weigh-in on or before the day, otherwise the first one after it. `assumed` says none existed
 * and DEFAULT_KG stood in.
 */
export function bodyKgOn(S, iso, workout = null) {
  const unit = S?.unit === 'lb' ? 'lb' : 'kg'
  const own = Number(workout?.bw)
  if (own > 0) return { kg: toKg(own, unit), assumed: false }
  const list = (Array.isArray(S?.bodyweight) ? S.bodyweight : []).filter(b => b && ISO.test(String(b.d)) && Number(b.w) > 0)
  let before = null, after = null
  for (const b of list) {
    if (b.d <= iso) { if (!before || b.d > before.d || (b.d === before.d && (b.t || 0) >= (before.t || 0))) before = b }
    else if (!after || b.d < after.d) after = b
  }
  const hit = before || after
  return hit ? { kg: toKg(Number(hit.w), unit), assumed: false } : { kg: DEFAULT_KG, assumed: true }
}

/* ---------------- a workout's estimate ---------------- */

/** Completed sets that count (warm-ups left out), and the cardio ones among them. */
function setsOf(w) {
  const all = [], cardio = []
  for (const e of Array.isArray(w?.entries) ? w.entries : []) {
    for (const s of Array.isArray(e?.sets) ? e.sets : []) {
      if (!s || !hasCompletedWork(s) || isWarmupRow(s)) continue
      all.push(s)
      if (Number(s.min) > 0) cardio.push(s)
    }
  }
  return { all, cardio }
}

/** How long a workout took, in minutes: its own clock, or a fair guess from its sets. */
export function workoutMinutes(w) {
  const start = Number(w?.start), end = Number(w?.end)
  if (Number.isFinite(start) && Number.isFinite(end) && end > start) return Math.min(MAX_WORKOUT_MIN, (end - start) / 60000)
  const { all, cardio } = setsOf(w)
  const cardioMin = cardio.reduce((n, s) => n + Number(s.min), 0)
  return Math.min(MAX_WORKOUT_MIN, cardioMin + (all.length - cardio.length) * MIN_PER_SET)
}

/**
 * MET of a cardio set from its speed (km/h), after the ACSM walking and running equations
 * (VO2 = 3.5 + 0.1·v or 0.2·v ml/kg/min, v in m/min). Walking pace below 8 km/h.
 */
export function metOfSpeed(kmh) {
  const v = Number(kmh)
  if (!(v > 0)) return MET_CARDIO
  const mPerMin = v * 1000 / 60
  const vo2 = 3.5 + (v < 8 ? 0.1 : 0.2) * mPerMin
  return Math.min(20, vo2 / 3.5)
}

/** Estimated kcal of one workout for a body of `kg`. */
export function workoutKcal(w, kg) {
  if (!(kg > 0)) return 0
  const total = workoutMinutes(w)
  const { cardio } = setsOf(w)
  let kcal = 0, cardioMin = 0
  for (const s of cardio) {
    const min = Number(s.min)
    cardioMin += min
    kcal += metOfSpeed(s.speed) * kg * min / 60
  }
  const rest = Math.max(0, total - cardioMin)
  kcal += MET_STRENGTH * kg * rest / 60
  return Math.round(kcal)
}

/** Estimated kcal of `steps` steps for a body of `kg`. */
export const stepsKcal = (steps, kg) => (steps > 0 && kg > 0 ? Math.round(steps * KCAL_PER_STEP_KG * kg) : 0)

/**
 * Everything a day burned:
 *   { workout, steps, estimate, override, total, assumedKg, minutes }
 * `workout` and `steps` are the estimates, `override` the number you typed for the day, which
 * replaces the workout estimate when there is one (a watch counts the training, not the walk to
 * the gym), and `total` what the day reads as.
 */
export function dayKcal(S, iso) {
  const workouts = (Array.isArray(S?.workouts) ? S.workouts : []).filter(w => w?.d === iso)
  let workout = 0, minutes = 0, assumedKg = false
  for (const w of workouts) {
    const { kg, assumed } = bodyKgOn(S, iso, w)
    if (assumed) assumedKg = true
    workout += workoutKcal(w, kg)
    minutes += workoutMinutes(w)
  }
  const n = stepsOn(S, iso)
  const body = bodyKgOn(S, iso)
  if (n && body.assumed) assumedKg = true
  const steps = n ? stepsKcal(n, body.kg) : 0
  const override = dayKcalOverride(S, iso)
  return {
    workout, steps, minutes: Math.round(minutes),
    estimate: workout + steps,
    override,
    total: (override ?? workout) + steps,
    assumedKg,
  }
}

/** The seven iso dates of the week that starts on `from` (an iso date). */
export function weekDays(from) {
  const d = new Date(from + 'T12:00:00')
  return Array.from({ length: 7 }, (_, i) => { const x = new Date(d); x.setDate(d.getDate() + i); return isoOf(x) })
}
