// Steps, a day's own calorie number, and the calorie estimate (lib/activity.js).
import { describe, expect, it } from 'vitest'
import {
  readSteps, stepsOn, withSteps, stepGoalOf, readDayKcal, dayKcalOverride, withDayKcal, bodyKgOn,
  workoutMinutes, metOfSpeed, workoutKcal, stepsKcal, dayKcal, weekDays,
  DEFAULT_KG, MET_STRENGTH, MIN_PER_SET, MAX_WORKOUT_MIN, STEPS_MAX,
} from './activity.js'

const H = 3600000
const set = (over = {}) => ({ w: 60, r: 8, done: true, ...over })
const workout = (over = {}) => ({ id: 'w1', d: '2026-10-21', start: 0, end: H, entries: [{ id: 'x', sets: [set(), set()] }], ...over })

describe('steps', () => {
  it('reads a stored day; junk, zero and a cleared day read as none', () => {
    expect(readSteps({ n: 8400, _ts: 1 })).toBe(8400)
    expect(readSteps({ n: '9000.4' })).toBe(9000)
    expect(readSteps({ _ts: 1 })).toBe(null)
    expect(readSteps({ n: 0 })).toBe(null)
    expect(readSteps({ n: -5 })).toBe(null)
    expect(readSteps(null)).toBe(null)
    expect(readSteps({ n: 1e9 })).toBe(STEPS_MAX)
  })
  it('writes a stamped entry, and a stamped empty one to clear', () => {
    const m = withSteps({ '2026-10-20': { n: 5, _ts: 1 } }, '2026-10-21', 7000, 99)
    expect(m).toEqual({ '2026-10-20': { n: 5, _ts: 1 }, '2026-10-21': { n: 7000, _ts: 99 } })
    expect(withSteps(m, '2026-10-21', 0, 100)['2026-10-21']).toEqual({ _ts: 100 })
    expect(stepsOn({ steps: m }, '2026-10-21')).toBe(7000)
    expect(stepsOn({}, '2026-10-21')).toBe(null)
  })
  it('the daily goal is a positive whole number or off', () => {
    expect(stepGoalOf({ stepGoal: 10000 })).toBe(10000)
    expect(stepGoalOf({ stepGoal: 0 })).toBe(null)
    expect(stepGoalOf({})).toBe(null)
  })
})

describe('a day’s own calorie number', () => {
  it('reads, writes and clears like steps', () => {
    expect(readDayKcal({ kcal: 450, _ts: 1 })).toBe(450)
    expect(readDayKcal({ _ts: 1 })).toBe(null)
    const m = withDayKcal({}, '2026-10-21', 512, 5)
    expect(dayKcalOverride({ dayKcal: m }, '2026-10-21')).toBe(512)
    expect(withDayKcal(m, '2026-10-21', null, 6)['2026-10-21']).toEqual({ _ts: 6 })
  })
})

describe('body weight for an estimate', () => {
  const bodyweight = [{ d: '2026-10-01', w: 80, t: 1 }, { d: '2026-10-15', w: 82, t: 2 }, { d: '2026-10-25', w: 84, t: 3 }]
  it('takes the workout’s own weigh-in first', () => {
    expect(bodyKgOn({ bodyweight }, '2026-10-21', { bw: 79 })).toEqual({ kg: 79, assumed: false })
  })
  it('then the last weigh-in on or before the day, then the first after', () => {
    expect(bodyKgOn({ bodyweight }, '2026-10-21').kg).toBe(82)
    expect(bodyKgOn({ bodyweight }, '2026-09-01').kg).toBe(80)
  })
  it('converts pounds, and assumes a default with no weigh-in at all', () => {
    expect(bodyKgOn({ unit: 'lb', bodyweight: [{ d: '2026-10-01', w: 176.4 }] }, '2026-10-21').kg).toBeCloseTo(80, 1)
    expect(bodyKgOn({ bodyweight: [] }, '2026-10-21')).toEqual({ kg: DEFAULT_KG, assumed: true })
  })
})

describe('how long a workout took', () => {
  it('uses its own clock', () => {
    expect(workoutMinutes(workout())).toBe(60)
  })
  it('caps a session left open', () => {
    expect(workoutMinutes(workout({ end: 10 * H }))).toBe(MAX_WORKOUT_MIN)
  })
  it('guesses from the sets without a clock: cardio minutes plus a few per other set', () => {
    const w = workout({ start: undefined, end: undefined, entries: [
      { id: 'x', sets: [set(), set(), set({ done: false })] },
      { id: 'run', sets: [{ min: 20, speed: 10, done: true }] },
    ] })
    expect(workoutMinutes(w)).toBe(20 + 2 * MIN_PER_SET)
  })
  it('leaves warm-ups out of the guess', () => {
    const w = workout({ start: undefined, end: undefined, entries: [{ id: 'x', sets: [set({ phase: 'warmup' }), set()] }] })
    expect(workoutMinutes(w)).toBe(MIN_PER_SET)
  })
})

describe('the calorie estimate', () => {
  it('a strength hour at MET 5 for 80 kg is 400 kcal', () => {
    expect(workoutKcal(workout(), 80)).toBe(MET_STRENGTH * 80)
  })
  it('reads cardio at a MET from its speed, and the rest of the session as strength', () => {
    expect(metOfSpeed(10)).toBeCloseTo((3.5 + 0.2 * 10000 / 60) / 3.5, 5)  // running
    expect(metOfSpeed(5)).toBeCloseTo((3.5 + 0.1 * 5000 / 60) / 3.5, 5)    // walking
    const w = workout({ entries: [{ id: 'run', sets: [{ min: 30, speed: 10, done: true }] }] })
    expect(workoutKcal(w, 70)).toBe(Math.round(metOfSpeed(10) * 70 * 0.5 + MET_STRENGTH * 70 * 0.5))
  })
  it('steps burn about 0.04 kcal each at 70 kg', () => {
    expect(stepsKcal(10000, 70)).toBe(399)
    expect(stepsKcal(0, 70)).toBe(0)
  })
  it('a day adds its workouts and its steps; your own number replaces the workout part only', () => {
    const S = { bodyweight: [{ d: '2026-10-01', w: 80 }], workouts: [workout()], steps: withSteps({}, '2026-10-21', 10000, 1) }
    const day = dayKcal(S, '2026-10-21')
    expect(day.workout).toBe(400)
    expect(day.steps).toBe(stepsKcal(10000, 80))
    expect(day.total).toBe(400 + day.steps)
    expect(day.override).toBe(null)
    expect(day.assumedKg).toBe(false)
    const own = dayKcal({ ...S, dayKcal: withDayKcal({}, '2026-10-21', 650, 2) }, '2026-10-21')
    expect(own.override).toBe(650)
    expect(own.total).toBe(650 + day.steps)
    expect(own.estimate).toBe(day.total)
  })
  it('says when the weight was assumed', () => {
    expect(dayKcal({ workouts: [workout()], bodyweight: [] }, '2026-10-21').assumedKg).toBe(true)
    expect(dayKcal({ workouts: [], bodyweight: [] }, '2026-10-21')).toMatchObject({ total: 0, assumedKg: false })
  })
})

describe('weekDays', () => {
  it('lists seven days across a month end', () => {
    expect(weekDays('2026-10-26')).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'])
  })
})
