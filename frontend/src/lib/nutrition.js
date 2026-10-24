// Nutrition: what you ate and the supplements you took, against a daily goal for calories,
// protein and saturated fat.
//
// Everything is a map of stamped entries, merged per key across devices the way a day's note is
// (lib/day-notes.js, lib/sync-merge.js mergeStampedMap). Removing one writes a stamped empty
// entry (`{ _ts }`), never a deleted key, which the other device's copy would bring back:
//
//   S.meals   = { [id]: { d: '2026-10-22', t, name, items: [{ name, food?, g?, kcal, p, sf }], _ts } }
//   S.foods   = { [id]: { name, g, kcal, p, sf, _ts } }      // a saved food: its values per `g` grams
//   S.supps   = { [id]: { name, dose, _ts } }                // a supplement you take
//   S.suppLog = { 'iso|id': { n, name, _ts } }               // taken `n` times that day
//   S.nutriGoal = { kcal, p, sf }                            // a plain setting; null = no goal
//
// A food added to a meal is copied into it at the amount eaten (scaleFood), so changing the saved
// food later leaves the days already logged as they were. Protein and saturated fat are grams,
// kept to one decimal; calories are whole kcal.
import { isoOf } from './format.js'

const isMap = v => !!v && typeof v === 'object' && !Array.isArray(v)
const ISO = /^\d{4}-\d{2}-\d{2}$/

export const KCAL_MAX = 20000
export const GRAM_MAX = 5000
export const NAME_MAX = 80
/** Quick picks for a meal's name, in the order the sheet shows them (English source strings). */
export const MEAL_NAMES = ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Pre-workout', 'Post-workout']

const round1 = n => Math.round(n * 10) / 10
/** A non-negative number up to `max`, rounded to `step` (1 or 0.1); junk reads as 0. */
const amount = (v, max, whole = false) => {
  const n = Number(String(v ?? '').replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0) return 0
  const c = Math.min(n, max)
  return whole ? Math.round(c) : round1(c)
}
const name = v => (typeof v === 'string' ? v.trim().slice(0, NAME_MAX) : '')

/** The three numbers of anything edible, cleaned: { kcal, p, sf }. */
export const macros = v => ({ kcal: amount(v?.kcal, KCAL_MAX, true), p: amount(v?.p, GRAM_MAX), sf: amount(v?.sf, GRAM_MAX) })

const add = (a, b) => ({ kcal: a.kcal + b.kcal, p: round1(a.p + b.p), sf: round1(a.sf + b.sf) })
const ZERO = { kcal: 0, p: 0, sf: 0 }

/* ---------------- saved foods ---------------- */

/** A stored food read back, or null for none or a removed one. Needs a name and a positive serving. */
export function readFood(entry) {
  if (!isMap(entry)) return null
  const n = name(entry.name), g = amount(entry.g, GRAM_MAX)
  return n && g > 0 ? { name: n, g, ...macros(entry) } : null
}

/** The saved foods, by name: [{ id, name, g, kcal, p, sf }]. */
export const foodsOf = S => Object.entries(isMap(S?.foods) ? S.foods : {})
  .map(([id, e]) => { const f = readFood(e); return f && { id, ...f } })
  .filter(Boolean)
  .sort((a, b) => a.name.localeCompare(b.name))

/** S.foods with `id` set to `food`, stamped `now`; null removes it. */
export function withFood(map, id, food, now = Date.now()) {
  const f = food && readFood(food)
  return { ...(isMap(map) ? map : {}), [id]: f ? { ...f, _ts: now } : { _ts: now } }
}

/** A food's values for `grams` eaten, scaled from its serving (140 g → 100 g is × 100/140). */
export function scaleFood(food, grams) {
  const f = readFood(food), g = amount(grams, GRAM_MAX)
  if (!f || !g) return { ...ZERO }
  const k = g / f.g
  return { kcal: Math.round(f.kcal * k), p: round1(f.p * k), sf: round1(f.sf * k) }
}

/** A meal item made from a saved food: its name, the grams eaten and the scaled values. */
export const foodItem = (food, id, grams) => ({ name: readFood(food)?.name || '', food: id, g: amount(grams, GRAM_MAX), ...scaleFood(food, grams) })

/* ---------------- meals ---------------- */

const readItem = it => {
  if (!isMap(it)) return null
  const m = macros(it)
  const out = { name: name(it.name), ...m }
  if (typeof it.food === 'string' && it.food) out.food = it.food
  const g = amount(it.g, GRAM_MAX)
  if (g) out.g = g
  return out.name || m.kcal || m.p || m.sf ? out : null
}

/** A stored meal read back: { d, t, name, items } or null for none or a removed one. */
export function readMeal(entry) {
  if (!isMap(entry) || !ISO.test(String(entry.d))) return null
  const items = (Array.isArray(entry.items) ? entry.items : []).map(readItem).filter(Boolean)
  if (!items.length) return null
  return { d: entry.d, t: Number(entry.t) || 0, name: name(entry.name), items }
}

/** A meal's totals. */
export const mealTotals = meal => (meal?.items || []).reduce((s, it) => add(s, macros(it)), { ...ZERO })

/** The meals of `iso` in the order they were eaten: [{ id, d, t, name, items, total }]. */
export const mealsOn = (S, iso) => Object.entries(isMap(S?.meals) ? S.meals : {})
  .map(([id, e]) => { const m = readMeal(e); return m && m.d === iso && { id, ...m, total: mealTotals(m) } })
  .filter(Boolean)
  .sort((a, b) => a.t - b.t || a.id.localeCompare(b.id))

/** S.meals with `id` set to `meal`, stamped `now`; null (or a meal with nothing in it) removes it. */
export function withMeal(map, id, meal, now = Date.now()) {
  const m = meal && readMeal(meal)
  return { ...(isMap(map) ? map : {}), [id]: m ? { ...m, _ts: now } : { _ts: now } }
}

/** What `iso` added up to: { kcal, p, sf, meals }. */
export function dayIntake(S, iso) {
  const meals = mealsOn(S, iso)
  return { ...meals.reduce((s, m) => add(s, m.total), { ...ZERO }), meals: meals.length }
}

/** Whether Home and the Report show nutrition: your own choice, or log mode's when you never made one. */
export const showsNutrition = S => (typeof S?.showNutrition === 'boolean' ? S.showNutrition : S?.logMode === true)

/* ---------------- the goal ---------------- */

/** The daily goal: { kcal, p, sf }, each null when not set. */
export function goalOf(S) {
  const g = isMap(S?.nutriGoal) ? S.nutriGoal : {}
  const m = macros(g)
  return { kcal: m.kcal || null, p: m.p || null, sf: m.sf || null }
}

// How each number is read against its goal: calories are a target to land near, protein a
// minimum to reach, saturated fat a limit to stay under.
export const GOAL_KIND = { kcal: 'target', p: 'min', sf: 'max' }
/** Calories within this share of the goal count as on target. */
export const KCAL_TOLERANCE = 0.1

/**
 * A number against its goal: { ratio, status }. Status is 'none' without a goal; otherwise
 * 'short' or 'met' for calories ('over' past the tolerance) and protein, 'ok' or 'over' for
 * saturated fat.
 */
export function standing(key, value, goal) {
  if (!(goal > 0)) return { ratio: null, status: 'none' }
  const ratio = (value || 0) / goal
  const kind = GOAL_KIND[key]
  const status = kind === 'max' ? (ratio > 1 ? 'over' : 'ok')
    : kind === 'min' ? (ratio >= 1 ? 'met' : 'short')
    : ratio > 1 + KCAL_TOLERANCE ? 'over' : ratio >= 1 - KCAL_TOLERANCE ? 'met' : 'short'
  return { ratio, status }
}

/* ---------------- supplements ---------------- */

/** A stored supplement read back: { name, dose } or null. */
export function readSupp(entry) {
  if (!isMap(entry)) return null
  const n = name(entry.name)
  return n ? { name: n, dose: name(entry.dose) } : null
}

/** Your supplements in the order they were added: [{ id, name, dose }]. */
export const suppsOf = S => Object.entries(isMap(S?.supps) ? S.supps : {})
  .map(([id, e]) => { const s = readSupp(e); return s && { id, ...s, at: Number(e.at) || Number(e._ts) || 0 } })
  .filter(Boolean)
  .sort((a, b) => a.at - b.at || a.name.localeCompare(b.name))
  .map(({ at, ...s }) => s)

/** S.supps with `id` set to `supp`, stamped `now`; null removes it. `at` keeps the list order. */
export function withSupp(map, id, supp, now = Date.now()) {
  const m = isMap(map) ? map : {}
  const s = supp && readSupp(supp)
  return { ...m, [id]: s ? { ...s, at: Number(m[id]?.at) || now, _ts: now } : { _ts: now } }
}

const logKey = (iso, id) => iso + '|' + id

/** How many times supplement `id` was taken on `iso`. */
export function suppCount(S, iso, id) {
  const e = isMap(S?.suppLog) ? S.suppLog[logKey(iso, id)] : null
  const n = Math.round(Number(e?.n))
  return Number.isFinite(n) && n > 0 ? Math.min(n, 99) : 0
}

/** S.suppLog with supplement `id` taken `n` times on `iso`, stamped `now`. The name is kept with it. */
export function withSuppCount(map, iso, id, n, supp, now = Date.now()) {
  const c = Math.max(0, Math.min(99, Math.round(Number(n) || 0)))
  const label = readSupp(supp)
  return { ...(isMap(map) ? map : {}), [logKey(iso, id)]: c ? { n: c, ...(label ? { name: label.name } : {}), _ts: now } : { _ts: now } }
}

/**
 * The supplements of `iso`: every one you keep, with how often it was taken that day, then any
 * taken that day whose entry has since been removed (under the name it had): [{ id, name, dose, n, gone? }].
 */
export function suppsOn(S, iso) {
  const kept = suppsOf(S).map(s => ({ ...s, n: suppCount(S, iso, s.id) }))
  const ids = new Set(kept.map(s => s.id))
  const gone = Object.entries(isMap(S?.suppLog) ? S.suppLog : {})
    .filter(([k]) => k.startsWith(iso + '|') && !ids.has(k.slice(iso.length + 1)))
    .map(([k, e]) => ({ id: k.slice(iso.length + 1), name: name(e?.name) || '?', dose: '', n: suppCount(S, iso, k.slice(iso.length + 1)), gone: true }))
    .filter(s => s.n > 0)
  return [...kept, ...gone]
}

/* ---------------- a week ---------------- */

const daysFrom = from => {
  const d = new Date(from + 'T12:00:00')
  return Array.from({ length: 7 }, (_, i) => { const x = new Date(d); x.setDate(d.getDate() + i); return isoOf(x) })
}

/**
 * The week starting `from`: { days: [{ iso, kcal, p, sf, meals }], logged, avg, onGoal, supps }.
 * `avg` is over the days with a meal logged, `onGoal` per number how many of those days met it
 * (lib standing: 'met' or 'ok'), `supps` per supplement the days it was taken on.
 */
export function weekNutrition(S, from) {
  const isos = daysFrom(from)
  const days = isos.map(iso => ({ iso, ...dayIntake(S, iso) }))
  const logged = days.filter(d => d.meals > 0)
  const goal = goalOf(S)
  const avg = { ...ZERO }, onGoal = { kcal: 0, p: 0, sf: 0 }
  for (const k of ['kcal', 'p', 'sf']) {
    avg[k] = logged.length ? (k === 'kcal' ? Math.round : round1)(logged.reduce((s, d) => s + d[k], 0) / logged.length) : 0
    onGoal[k] = logged.filter(d => ['met', 'ok'].includes(standing(k, d[k], goal[k]).status)).length
  }
  const supps = suppsOf(S).map(s => ({ ...s, days: isos.filter(iso => suppCount(S, iso, s.id) > 0) }))
  return { from, days, logged: logged.length, avg, onGoal, goal, supps }
}
