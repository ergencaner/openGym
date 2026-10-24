// Meals, saved foods, supplements and the daily goal (lib/nutrition.js).
import { describe, expect, it } from 'vitest'
import {
  macros, readFood, foodsOf, withFood, scaleFood, foodItem, readMeal, mealTotals, mealsOn, withMeal,
  dayIntake, goalOf, standing, readSupp, suppsOf, withSupp, suppCount, withSuppCount, suppsOn, weekNutrition,
} from './nutrition.js'
import { mergeStates, STAMPED_MAPS } from './sync-merge.js'
import * as Server from '../../../api/sync-stamps.js'

const QUARK = { name: 'Sek Quark Yoğurt', g: 140, kcal: 91, p: 16.8, sf: 0.3 }

describe('numbers', () => {
  it('cleans the three values: whole kcal, grams to a tenth, junk and negatives as 0', () => {
    expect(macros({ kcal: '120.6', p: '12,34', sf: -2 })).toEqual({ kcal: 121, p: 12.3, sf: 0 })
    expect(macros(null)).toEqual({ kcal: 0, p: 0, sf: 0 })
  })
})

describe('saved foods', () => {
  it('needs a name and a serving size', () => {
    expect(readFood(QUARK)).toEqual(QUARK)
    expect(readFood({ ...QUARK, name: '  ' })).toBe(null)
    expect(readFood({ ...QUARK, g: 0 })).toBe(null)
    expect(readFood({ _ts: 1 })).toBe(null)
  })
  it('scales to the grams eaten: 140 g → 100 g', () => {
    expect(scaleFood(QUARK, 100)).toEqual({ kcal: 65, p: 12, sf: 0.2 })
    expect(scaleFood(QUARK, 280)).toEqual({ kcal: 182, p: 33.6, sf: 0.6 })
    expect(scaleFood(QUARK, 0)).toEqual({ kcal: 0, p: 0, sf: 0 })
  })
  it('a meal item from a food keeps its name, grams and the scaled values', () => {
    expect(foodItem(QUARK, 'f1', 100)).toEqual({ name: 'Sek Quark Yoğurt', food: 'f1', g: 100, kcal: 65, p: 12, sf: 0.2 })
  })
  it('writes, lists by name and removes with a stamped empty entry', () => {
    let m = withFood({}, 'b', QUARK, 5)
    m = withFood(m, 'a', { name: 'Ayran', g: 200, kcal: 76, p: 3.4, sf: 1.4 }, 6)
    expect(foodsOf({ foods: m }).map(f => f.id)).toEqual(['a', 'b'])
    m = withFood(m, 'b', null, 7)
    expect(m.b).toEqual({ _ts: 7 })
    expect(foodsOf({ foods: m }).map(f => f.id)).toEqual(['a'])
  })
})

describe('meals', () => {
  const meal = { d: '2026-10-22', t: 2, name: 'Kahvaltı', items: [foodItem(QUARK, 'f1', 100), { name: 'Yumurta', kcal: 155, p: 13, sf: 3.3 }] }
  it('reads a meal and adds it up', () => {
    expect(readMeal(meal).items).toHaveLength(2)
    expect(mealTotals(meal)).toEqual({ kcal: 220, p: 25, sf: 3.5 })
  })
  it('a meal needs a day and something in it', () => {
    expect(readMeal({ ...meal, d: 'x' })).toBe(null)
    expect(readMeal({ ...meal, items: [] })).toBe(null)
    expect(readMeal({ ...meal, items: [{ name: '' }] })).toBe(null)
  })
  it('lists a day’s meals in the order eaten, and sums the day', () => {
    let m = withMeal({}, 'm2', { ...meal, t: 5, name: 'Akşam' }, 1)
    m = withMeal(m, 'm1', meal, 1)
    m = withMeal(m, 'm3', { ...meal, d: '2026-10-21' }, 1)
    const S = { meals: m }
    expect(mealsOn(S, '2026-10-22').map(x => x.name)).toEqual(['Kahvaltı', 'Akşam'])
    expect(dayIntake(S, '2026-10-22')).toEqual({ kcal: 440, p: 50, sf: 7, meals: 2 })
    expect(dayIntake(S, '2026-10-20')).toEqual({ kcal: 0, p: 0, sf: 0, meals: 0 })
  })
  it('removing a meal writes a stamped empty entry', () => {
    const m = withMeal(withMeal({}, 'm1', meal, 1), 'm1', null, 2)
    expect(m.m1).toEqual({ _ts: 2 })
    expect(mealsOn({ meals: m }, '2026-10-22')).toEqual([])
  })
})

describe('the goal', () => {
  it('reads unset values as null', () => {
    expect(goalOf({ nutriGoal: { kcal: 2400, p: 160, sf: null } })).toEqual({ kcal: 2400, p: 160, sf: null })
    expect(goalOf({})).toEqual({ kcal: null, p: null, sf: null })
  })
  it('calories are a target, protein a minimum, saturated fat a limit', () => {
    expect(standing('kcal', 1800, 2400).status).toBe('short')
    expect(standing('kcal', 2300, 2400).status).toBe('met')
    expect(standing('kcal', 2700, 2400).status).toBe('over')
    expect(standing('p', 150, 160).status).toBe('short')
    expect(standing('p', 170, 160).status).toBe('met')
    expect(standing('sf', 18, 20).status).toBe('ok')
    expect(standing('sf', 25, 20)).toEqual({ ratio: 1.25, status: 'over' })
    expect(standing('sf', 25, null).status).toBe('none')
  })
})

describe('supplements', () => {
  it('keeps them in the order added', () => {
    let m = withSupp({}, 'd3', { name: 'D vitamini', dose: '1000 IU' }, 10)
    m = withSupp(m, 'cr', { name: 'Kreatin', dose: '5 g' }, 20)
    m = withSupp(m, 'd3', { name: 'D3 vitamini', dose: '2000 IU' }, 30)   // a rename keeps its place
    expect(suppsOf({ supps: m }).map(s => s.name)).toEqual(['D3 vitamini', 'Kreatin'])
    expect(readSupp({ name: '' })).toBe(null)
  })
  it('counts what was taken each day, and shows a removed supplement under the name it had', () => {
    const supps = withSupp(withSupp({}, 'd3', { name: 'D vitamini' }, 1), 'cr', { name: 'Kreatin' }, 2)
    let log = withSuppCount({}, '2026-10-22', 'd3', 1, { name: 'D vitamini' }, 3)
    log = withSuppCount(log, '2026-10-22', 'fish', 2, { name: 'Balık yağı' }, 3)
    const S = { supps, suppLog: log }
    expect(suppCount(S, '2026-10-22', 'd3')).toBe(1)
    expect(suppsOn(S, '2026-10-22').map(s => [s.name, s.n, !!s.gone])).toEqual([
      ['D vitamini', 1, false], ['Kreatin', 0, false], ['Balık yağı', 2, true],
    ])
    log = withSuppCount(log, '2026-10-22', 'd3', 0, null, 4)
    expect(log['2026-10-22|d3']).toEqual({ _ts: 4 })
  })
})

describe('a week', () => {
  it('averages over the days with meals and counts the days on goal', () => {
    const meals = {}
    const put = (id, d, kcal, p, sf) => Object.assign(meals, withMeal({}, id, { d, items: [{ name: 'x', kcal, p, sf }] }, 1))
    put('a', '2026-10-19', 2400, 170, 15)
    put('b', '2026-10-20', 1500, 100, 25)
    put('c', '2026-10-27', 9999, 999, 99)            // the week after
    const S = {
      meals, nutriGoal: { kcal: 2400, p: 160, sf: 20 },
      supps: withSupp({}, 'cr', { name: 'Kreatin' }, 1),
      suppLog: withSuppCount({}, '2026-10-20', 'cr', 1, null, 1),
    }
    const w = weekNutrition(S, '2026-10-19')
    expect(w.logged).toBe(2)
    expect(w.avg).toEqual({ kcal: 1950, p: 135, sf: 20 })
    expect(w.onGoal).toEqual({ kcal: 1, p: 1, sf: 1 })
    expect(w.supps[0].days).toEqual(['2026-10-20'])
    expect(w.days[6].iso).toBe('2026-10-25')
  })
})

describe('sync', () => {
  it('merges each meal, food, supplement and day’s intake on its own, here and on the server', () => {
    for (const f of ['meals', 'foods', 'supps', 'suppLog']) expect(STAMPED_MAPS).toContain(f)
    expect(Server.STAMPED_MAPS).toEqual(STAMPED_MAPS)
    const base = { unit: 'kg', workouts: [], routines: [], bodyweight: [] }
    const phone = { ...base, _ts: 10, meals: withMeal({}, 'm1', { d: '2026-10-22', items: [{ name: 'a', kcal: 1 }] }, 5) }
    const laptop = { ...base, _ts: 20, meals: withMeal({}, 'm2', { d: '2026-10-22', items: [{ name: 'b', kcal: 2 }] }, 6) }
    expect(Object.keys(mergeStates(phone, laptop).meals).sort()).toEqual(['m1', 'm2'])
    // A removal made later wins over the other device's older copy.
    const removed = { ...laptop, meals: { ...laptop.meals, ...withMeal({}, 'm1', null, 9) } }
    expect(mealsOn(mergeStates(phone, removed), '2026-10-22').map(m => m.id)).toEqual(['m2'])
  })
})
