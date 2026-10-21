// The daily and weekly report (lib/report.js).
import { describe, expect, it } from 'vitest'
import { dayReport, weekReport, strengthGains, changeOf, workSets } from './report.js'
import { withSteps } from './activity.js'
import { withWeekGoal } from './week-goals.js'

const PRESS = { muscleWeights: { chest: 1, triceps: 0.5 } }
const H = 3600000
const at = iso => new Date(iso + 'T18:00:00').getTime()
const w = (d, sets, over = {}) => ({
  id: d + (over.id || ''), d, start: at(d), end: at(d) + H,
  entries: [{ id: 'bench', exercise: PRESS, sets: sets.map(([kg, r]) => ({ w: kg, r, done: true })) }],
  ...over,
})
const S0 = over => ({ unit: 'kg', weekStart: 1, bodyweight: [{ d: '2026-10-01', w: 80 }], workouts: [], ...over })

describe('a day', () => {
  it('sums the day’s sets, volume, muscles, calories and steps', () => {
    const S = S0({ workouts: [w('2026-10-21', [[60, 10], [60, 8]], { prs: [{}] })], steps: withSteps({}, '2026-10-21', 6000, 1), stepGoal: 8000 })
    const r = dayReport(S, '2026-10-21')
    expect(r.sets).toBe(2)
    expect(r.volume).toBe(1080)
    expect(r.load).toEqual({ chest: 2, triceps: 1 })
    expect(r.prs).toBe(1)
    expect(r.kcal.workout).toBe(400)
    expect(r.steps).toBe(6000)
    expect(r.stepGoal).toBe(8000)
  })
  it('an empty day is all zeros', () => {
    expect(dayReport(S0(), '2026-10-21')).toMatchObject({ sets: 0, volume: 0, load: {}, steps: null })
  })
})

describe('changes and gains', () => {
  it('reads a change as a fraction, none without a week before', () => {
    expect(changeOf(110, 100)).toBeCloseTo(0.1)
    expect(changeOf(5, 0)).toBe(null)
  })
  it('names the lifts that beat their best from before the week', () => {
    const S = S0({ workouts: [w('2026-10-12', [[100, 5]]), w('2026-10-20', [[105, 5]])] })
    const gains = strengthGains(S, '2026-10-19', '2026-10-25')
    expect(gains).toHaveLength(1)
    expect(gains[0].id).toBe('bench')
    expect(gains[0].now).toBeGreaterThan(gains[0].before)
  })
  it('leaves out a lift that is new this week or did not improve', () => {
    expect(strengthGains(S0({ workouts: [w('2026-10-20', [[105, 5]])] }), '2026-10-19', '2026-10-25')).toEqual([])
    expect(strengthGains(S0({ workouts: [w('2026-10-12', [[110, 5]]), w('2026-10-20', [[105, 5]])] }), '2026-10-19', '2026-10-25')).toEqual([])
  })
  it('counts work sets only', () => {
    expect(workSets([{ entries: [{ sets: [{ done: true }, { done: true, phase: 'warmup' }, { done: false }] }] }])).toBe(1)
  })
})

describe('a week', () => {
  const S = S0({
    workouts: [
      w('2026-10-13', [[60, 10]]),                     // the week before
      w('2026-10-19', [[60, 10], [60, 10]]),
      w('2026-10-22', [[65, 10], [65, 10]]),
      w('2026-10-26', [[70, 10]]),                     // the week after
    ],
    steps: withSteps(withSteps({}, '2026-10-19', 9000, 1), '2026-10-20', 11000, 1),
    weekGoals: withWeekGoal({}, '2026-10-19', { chest: 2, quadriceps: 1 }, 1),
    stepGoal: 10000,
  })
  it('covers the seven days from the first weekday', () => {
    const r = weekReport(S, '2026-10-21', 1)
    expect(r.from).toBe('2026-10-19')
    expect(r.to).toBe('2026-10-25')
    expect(r.days.map(d => d.iso)[0]).toBe('2026-10-19')
    expect(r.totals).toMatchObject({ workouts: 2, days: 2, sets: 4, volume: 2500, steps: 20000, stepDays: 2 })
  })
  it('holds the week against its goals', () => {
    const r = weekReport(S, '2026-10-21', 1)
    expect(r.trained.chest).toEqual(['2026-10-19', '2026-10-22'])
    expect(r.goals.rows.find(x => x.muscle === 'chest')).toMatchObject({ target: 2, done: 2, status: 'met' })
    expect(r.goals.rows.find(x => x.muscle === 'quadriceps')).toMatchObject({ target: 1, done: 0, status: 'short' })
    expect(r.goals.summary).toBe('short')
  })
  it('compares with the week before', () => {
    const r = weekReport(S, '2026-10-21', 1)
    expect(r.prev).toMatchObject({ workouts: 1, sets: 1, volume: 600 })
    expect(r.change.volume).toBeCloseTo(2500 / 600 - 1)
    expect(r.change.steps).toBe(null)
    expect(r.gains.map(g => g.id)).toEqual(['bench'])
  })
  it('follows a Sunday-first week', () => {
    const r = weekReport(S, '2026-10-21', 0)
    expect(r.from).toBe('2026-10-18')
    expect(r.goal).toEqual({ chest: 2, quadriceps: 1 })
  })
})
