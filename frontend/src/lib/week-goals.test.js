// Weekly muscle goals (lib/week-goals.js): storage, which days a muscle counts as trained, and
// how a week stands against its goals.
import { describe, expect, it } from 'vitest'
import { readWeekGoal, weekGoalOf, lastWeekGoalBefore, withWeekGoal, muscleDays, goalStatus, weekGoalRows, GOAL_DAYS_MAX } from './week-goals.js'
import { mergeStates, STAMPED_MAPS } from './sync-merge.js'
import * as Server from '../../../api/sync-stamps.js'

const PRESS = { muscleWeights: { chest: 1, triceps: 0.5 } }
const SQUAT = { muscleWeights: { quadriceps: 1, gluteal: 0.5 } }
const entry = (exercise, n, over = {}) => ({ id: 'x', exercise, sets: Array.from({ length: n }, () => ({ w: 50, r: 8, done: true, ...over })) })
const workout = (d, ...entries) => ({ id: d, d, entries })

describe('reading and writing a week', () => {
  it('keeps real muscles with whole positive days, capped at seven', () => {
    expect(readWeekGoal({ m: { chest: 2, triceps: 0, legs: 3, quadriceps: 9.6 } })).toEqual({ chest: 2, quadriceps: GOAL_DAYS_MAX })
    expect(readWeekGoal({ m: {} })).toBe(null)
    expect(readWeekGoal({ _ts: 1 })).toBe(null)
  })
  it('writes a stamped week, and clears it with a stamped empty one', () => {
    const map = withWeekGoal({}, '2026-10-19', { chest: 2 }, 7)
    expect(map).toEqual({ '2026-10-19': { m: { chest: 2 }, _ts: 7 } })
    expect(withWeekGoal(map, '2026-10-19', {}, 8)['2026-10-19']).toEqual({ _ts: 8 })
  })
  it('finds a week stored under the other first weekday', () => {
    const S = { weekGoals: withWeekGoal({}, '2026-10-19', { chest: 2 }, 1) }   // a Monday
    expect(weekGoalOf(S, '2026-10-18')).toEqual({ chest: 2 })                  // the Sunday-first week
    // Saving it from the Sunday side retires the Monday copy, so only one answers.
    const S2 = { weekGoals: withWeekGoal(S.weekGoals, '2026-10-18', { chest: 3 }, 2) }
    expect(S2.weekGoals['2026-10-19']).toEqual({ _ts: 2 })
    expect(weekGoalOf(S2, '2026-10-19')).toEqual({ chest: 3 })
  })
  it('offers the latest earlier week to start from', () => {
    const S = { weekGoals: { '2026-10-05': { m: { chest: 1 } }, '2026-10-12': { m: { biceps: 2 } }, '2026-10-19': { m: { abs: 3 } } } }
    expect(lastWeekGoalBefore(S, '2026-10-19')).toEqual({ biceps: 2 })
    expect(lastWeekGoalBefore(S, '2026-10-05')).toBe(null)
  })
  it('is merged per week like the other stamped maps, here and on the server', () => {
    expect(STAMPED_MAPS).toContain('weekGoals')
    expect(Server.STAMPED_MAPS).toEqual(STAMPED_MAPS)
    const base = { unit: 'kg', workouts: [], routines: [], bodyweight: [] }
    const a = { ...base, _ts: 10, weekGoals: { '2026-10-19': { m: { chest: 2 }, _ts: 5 } } }
    const b = { ...base, _ts: 20, weekGoals: { '2026-10-19': { m: { chest: 1 }, _ts: 3 }, '2026-10-12': { m: { abs: 1 }, _ts: 4 } } }
    expect(mergeStates(a, b).weekGoals).toEqual({ '2026-10-19': { m: { chest: 2 }, _ts: 5 }, '2026-10-12': { m: { abs: 1 }, _ts: 4 } })
  })
})

describe('which days a muscle was trained', () => {
  const isos = ['2026-10-19', '2026-10-20', '2026-10-21']
  it('counts a day once a muscle got one effective set', () => {
    const ws = [
      workout('2026-10-19', entry(PRESS, 3)),
      workout('2026-10-21', entry(PRESS, 1), entry(SQUAT, 4)),
    ]
    const d = muscleDays(ws, isos)
    expect(d.chest).toEqual(['2026-10-19', '2026-10-21'])
    expect(d.triceps).toEqual(['2026-10-19'])         // 3 × 0.5 that day, 1 × 0.5 on the 21st
    expect(d.quadriceps).toEqual(['2026-10-21'])
    expect(d.gluteal).toEqual(['2026-10-21'])          // 4 × 0.5
  })
  it('two sessions on one day are one day', () => {
    const ws = [workout('2026-10-20', entry(PRESS, 2)), { ...workout('2026-10-20', entry(PRESS, 2)), id: 'b' }]
    expect(muscleDays(ws, isos).chest).toEqual(['2026-10-20'])
  })
  it('leaves unticked sets and warm-ups out', () => {
    const ws = [workout('2026-10-20', entry(PRESS, 3, { done: false }), entry(PRESS, 2, { phase: 'warmup' }))]
    expect(muscleDays(ws, isos).chest).toBeUndefined()
  })
})

describe('the week against its goals', () => {
  it('reads each goal as short, met or over', () => {
    expect(goalStatus(2, 1)).toBe('short')
    expect(goalStatus(2, 2)).toBe('met')
    expect(goalStatus(2, 3)).toBe('over')
    expect(goalStatus(0, 3)).toBe('none')
  })
  it('lists goals first, then muscles trained without one, and sums the week up', () => {
    const trained = { chest: ['a', 'b', 'c'], quadriceps: ['a'], biceps: ['b'] }
    const r = weekGoalRows({ chest: 2, quadriceps: 2 }, trained)
    expect(r.rows.map(x => [x.muscle, x.target, x.done, x.status])).toEqual([
      ['chest', 2, 3, 'over'], ['quadriceps', 2, 1, 'short'], ['biceps', 0, 1, 'none'],
    ])
    expect(r).toMatchObject({ met: 1, total: 2, summary: 'short' })
    expect(weekGoalRows({ chest: 2 }, trained).summary).toBe('over')
    expect(weekGoalRows({ chest: 3 }, trained).summary).toBe('met')
    expect(weekGoalRows(null, trained).summary).toBe('none')
  })
})
