// @vitest-environment happy-dom
// The Nutrition screen: the day's meals against the goal, supplements ticked off with a tap, and
// the week; the meal sheet scaling a saved food to the grams eaten.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { todayISO } from '../lib/format.js'
import { withMeal, withFood, withSupp, withSuppCount, suppCount, mealsOn } from '../lib/nutrition.js'

const params = { v: 'day', d: null }
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [{ get: k => params[k] ?? null }, vi.fn()],
}))

const { default: Nutrition } = await import('./Nutrition.jsx')
const { mealSheet } = await import('../nutrition-sheets.jsx')

let host, root
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove(); useUI.setState({ sheets: [] }) })

const today = todayISO()
const QUARK = { name: 'Sek Quark Yoğurt', g: 140, kcal: 91, p: 16.8, sf: 0.3 }
const mount = (over = {}) => {
  useStore.setState(s => ({
    S: {
      ...s.S, unit: 'kg', weekStart: 1, lang: 'en',
      nutriGoal: { kcal: 2000, p: 150, sf: 20 },
      meals: withMeal({}, 'm1', { d: today, t: 1, name: 'Breakfast', items: [{ name: 'Eggs', kcal: 1800, p: 160, sf: 25 }] }, 1),
      foods: withFood({}, 'q', QUARK, 1),
      supps: withSupp(withSupp({}, 'd3', { name: 'Vitamin D', dose: '1000 IU' }, 1), 'cr', { name: 'Creatine' }, 2),
      suppLog: withSuppCount({}, today, 'd3', 1, { name: 'Vitamin D' }, 1),
      ...over,
    },
  }))
  act(() => root.render(<Nutrition />))
}
const text = () => host.textContent

describe('Nutrition: a day', () => {
  it('shows each number against its goal', () => {
    params.v = 'day'; params.d = today
    mount()
    expect(host.querySelector('[data-nutri=kcal]').dataset.status).toBe('met')
    expect(host.querySelector('[data-nutri=p]').dataset.status).toBe('met')
    expect(host.querySelector('[data-nutri=sf]').dataset.status).toBe('over')
    expect(text()).toContain('5 g over the limit')
    expect(text()).toContain('Breakfast')
  })
  it('ticks a supplement off with a tap', () => {
    params.v = 'day'; params.d = today
    mount()
    expect(text()).toContain('1/2')
    act(() => host.querySelector('[data-supp=cr]').click())
    expect(suppCount(useStore.getState().S, today, 'cr')).toBe(1)
    act(() => host.querySelector('[data-supp=d3]').click())
    expect(suppCount(useStore.getState().S, today, 'd3')).toBe(0)
  })
})

describe('Nutrition: a week', () => {
  it('averages the logged days and lists the supplements by day', () => {
    params.v = 'week'; params.d = today
    mount()
    expect(text()).toContain('daily average')
    expect(text()).toContain('Vitamin D1/7')
  })
})

describe('the meal sheet', () => {
  it('adds a saved food scaled to the grams eaten, and saves the meal', () => {
    mount({ meals: {} })
    act(() => { mealSheet(today) })
    const sheets = () => useUI.getState().sheets
    // Render the open sheets the way the app's sheet host would.
    const render = () => act(() => root.render(<>{sheets().map(sh => <div key={sh.id} data-sheet={sh.id}>{sh.render(() => useUI.getState().closeSheet(sh.id))}</div>)}</>))
    render()
    const button = label => [...host.querySelectorAll('button')].find(b => b.textContent === label)
    act(() => button('Add food').click()); render()
    const item = [...host.querySelectorAll('.item')].find(el => el.textContent.includes('Sek Quark'))
    act(() => item.click()); render()
    const grams = host.querySelector('[data-sheet]:last-child .measure-input input')
    act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(grams, '100'); grams.dispatchEvent(new Event('input', { bubbles: true })) })
    render()
    expect(text()).toContain('65 kcal · P 12 g · SF 0.2 g')
    act(() => button('Add to meal').click()); render()
    act(() => button('Save meal').click())
    const meals = mealsOn(useStore.getState().S, today)
    expect(meals).toHaveLength(1)
    expect(meals[0].items[0]).toMatchObject({ name: 'Sek Quark Yoğurt', food: 'q', g: 100, kcal: 65, p: 12, sf: 0.2 })
  })
})
