// @vitest-environment happy-dom
// The Report (log mode): the day and week views read the state the way lib/report.js says, and
// Home in log mode shows today and the week's goals instead of the plan.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { useStore } from '../store/useStore.js'
import { todayISO, isoOf } from '../lib/format.js'
import { withSteps } from '../lib/activity.js'
import { withWeekGoal } from '../lib/week-goals.js'

const params = { v: 'week', d: null }
const mocks = vi.hoisted(() => ({
  logWorkoutSheet: vi.fn(), logPastWorkoutSheet: vi.fn(), workoutDetailSheet: vi.fn(),
  stepsSheet: vi.fn(), kcalSheet: vi.fn(), weekGoalSheet: vi.fn(), stepGoalSheet: vi.fn(),
}))
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [{ get: k => params[k] ?? null }, vi.fn()],
}))
vi.mock('../sheets.jsx', () => ({
  logWorkoutSheet: mocks.logWorkoutSheet, logPastWorkoutSheet: mocks.logPastWorkoutSheet, workoutDetailSheet: mocks.workoutDetailSheet,
  starterPlanSheet: vi.fn(), bwSheet: vi.fn(), goalSheet: vi.fn(), dayOverrideSheet: vi.fn(),
  calendarSheet: vi.fn(), startFlow: vi.fn(), bwDeltaColor: () => '', weighInsSheet: vi.fn(),
}))
vi.mock('../activity-sheets.jsx', () => ({
  stepsSheet: mocks.stepsSheet, kcalSheet: mocks.kcalSheet, weekGoalSheet: mocks.weekGoalSheet, stepGoalSheet: mocks.stepGoalSheet,
}))
vi.mock('../components/BodyMap.jsx', () => ({
  default: ({ load }) => <div data-testid="bodymap" data-muscles={Object.keys(load).sort().join(',')} />,
  BodyMapLegend: () => null,
}))

const { default: Report } = await import('./Report.jsx')
const { default: Home } = await import('./Home.jsx')

let host, root
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  Object.values(mocks).forEach(m => m.mockClear())
})
afterEach(() => { act(() => root.unmount()); host.remove() })

const today = todayISO()
const PRESS = { muscleWeights: { chest: 1, triceps: 0.5 } }
const at = iso => new Date(iso + 'T18:00:00').getTime()
const workout = iso => ({
  id: 'w' + iso, d: iso, name: 'Push', start: at(iso), end: at(iso) + 3600000,
  entries: [{ id: 'bench', exercise: PRESS, sets: [{ w: 60, r: 10, done: true }, { w: 60, r: 10, done: true }] }],
})
const mount = (el, over = {}) => {
  useStore.setState(s => ({
    S: {
      ...s.S, routines: [], dayPlan: {}, week: {}, active: null, weekStart: 1, unit: 'kg', logMode: true,
      bodyweight: [{ d: '2026-01-01', w: 80 }], workouts: [workout(today)],
      steps: withSteps({}, today, 12345, 1), stepGoal: 10000,
      weekGoals: withWeekGoal({}, isoOf((() => { const d = new Date(today + 'T12:00:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d })()), { chest: 2, quadriceps: 1 }, 1),
      ...over,
    },
    user: null,
  }))
  act(() => root.render(el))
}
const text = () => host.textContent

describe('Report: a day', () => {
  it('shows the muscles, calories and steps of the day', () => {
    params.v = 'day'; params.d = today
    mount(<Report />)
    expect(host.querySelector('[data-testid=bodymap]').dataset.muscles).toBe('chest,triceps')
    expect(text()).toContain('Calories')
    expect(text()).toContain((12345).toLocaleString())
    expect(text()).toContain('Goal reached')
    expect(text()).toContain('Push')
  })
  it('offers to log a workout on an empty day', () => {
    params.v = 'day'; params.d = today
    mount(<Report />, { workouts: [] })
    expect(text()).toContain('Nothing logged today yet')
    const btn = [...host.querySelectorAll('button')].find(b => b.textContent === 'Log workout')
    act(() => btn.click())
    expect(mocks.logWorkoutSheet).toHaveBeenCalled()
  })
})

describe('Report: a week', () => {
  it('holds the week against its goals', () => {
    params.v = 'week'; params.d = today
    mount(<Report />)
    const chest = host.querySelector('[data-goal-row=chest]')
    expect(chest.textContent).toContain('1/2')
    expect(host.querySelector('[data-goal-row=quadriceps]').textContent).toContain('0/1')
    expect(text()).toContain('0 of 2 goals reached')
    expect(text()).toContain('Progress vs last week')
  })
  it('asks for goals when the week has none', () => {
    params.v = 'week'; params.d = today
    mount(<Report />, { weekGoals: {} })
    const btn = [...host.querySelectorAll('button')].find(b => b.textContent === 'Set goals')
    act(() => btn.click())
    expect(mocks.weekGoalSheet).toHaveBeenCalled()
  })
})

describe('Home in log mode', () => {
  it('shows today and the week’s goals instead of the plan', () => {
    mount(<Home />)
    expect(text()).toContain('Weekly goals')
    expect(text()).toContain('Log workout')
    expect(text()).not.toContain('Choose a different workout')
    const btn = [...host.querySelectorAll('button')].find(b => b.textContent === 'Log steps')
    act(() => btn.click())
    expect(mocks.stepsSheet).toHaveBeenCalledWith(today)
  })
  it('keeps the planner when log mode is off', () => {
    mount(<Home />, { logMode: false })
    expect(text()).not.toContain('Weekly goals')
    expect(text()).toContain('Choose a different workout')
  })
})
