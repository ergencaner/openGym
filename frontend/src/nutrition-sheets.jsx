// Sheets for nutrition (views/Nutrition.jsx): a meal and what is in it, saved foods, supplements,
// and the daily goal. The numbers and the storage live in lib/nutrition.js.
import { useState } from 'react'
import { useStore } from './store/useStore.js'
import { useUI } from './store/useUI.js'
import { t, dateLocale } from './lib/i18n.js'
import { fmtDate, uid } from './lib/format.js'
import {
  MEAL_NAMES, foodsOf, readFood, withFood, scaleFood, foodItem, macros, readMeal, mealTotals, withMeal,
  goalOf, suppsOf, withSupp, GRAM_MAX,
} from './lib/nutrition.js'
import Icon from './components/Icon.jsx'
import { Button, NumberField, TextField, SearchField } from './components/ui.jsx'
import { tappable } from './lib/use-sheet-keyboard.js'

const S = () => useStore.getState().S
const update = (...a) => useStore.getState().update(...a)
const ui = () => useUI.getState()
const toast = m => ui().toast(m)

const n1 = v => (Math.round((v || 0) * 10) / 10).toLocaleString(dateLocale())
/** One line for anything edible: "520 kcal · P 32 g · SF 4.1 g". */
export const macroLine = m => `${Math.round(m.kcal || 0).toLocaleString(dateLocale())} kcal · ${t('P')} ${n1(m.p)} g · ${t('SF')} ${n1(m.sf)} g`

/** A labelled number cell (the measurement form's look, index.css .measure-*). */
function Num({ label, unit, value, onChange, decimal = true, autoFocus }) {
  return <label className="measure-field">
    <span>{label}</span>
    <span className="measure-input">
      <NumberField nullable decimal={decimal} value={value} onChange={onChange} autoFocus={autoFocus} />
      <i>{unit}</i>
    </span>
  </label>
}

/** The three values of anything edible, as one form row each. */
function MacroFields({ v, set }) {
  return <div className="measure-form">
    <Num label={t('Calories')} unit="kcal" decimal={false} value={v.kcal} onChange={x => set({ ...v, kcal: x })} />
    <Num label={t('Protein')} unit="g" value={v.p} onChange={x => set({ ...v, p: x })} />
    <Num label={t('Saturated fat')} unit="g" value={v.sf} onChange={x => set({ ...v, sf: x })} />
  </div>
}

/* ============================ the daily goal ============================ */
function NutritionGoal({ close }) {
  const [v, setV] = useState(() => goalOf(S()))
  const save = () => {
    const m = macros(v)
    update(s => { s.nutriGoal = { kcal: m.kcal || null, p: m.p || null, sf: m.sf || null } })
    close(); toast(t('Daily goal saved'))
  }
  return <>
    <h3>{t('Daily nutrition goal')}</h3>
    <div className="muted small" style={{ marginBottom: 12 }}>{t('Calories are a target, protein a minimum, saturated fat a limit. Leave one empty for no goal.')}</div>
    <MacroFields v={v} set={setV} />
    <div style={{ height: 16 }} />
    <Button variant="primary" onClick={save}>{t('Save')}</Button>
  </>
}
export const nutritionGoalSheet = () => ui().openSheet(close => <NutritionGoal close={close} />)

/* ============================ a saved food ============================ */
function FoodEdit({ id, close, onSaved }) {
  const old = id ? readFood(S().foods?.[id]) : null
  const [nm, setNm] = useState(old?.name || '')
  const [g, setG] = useState(old?.g ?? 100)
  const [v, setV] = useState(old ? { kcal: old.kcal, p: old.p, sf: old.sf } : { kcal: null, p: null, sf: null })
  const save = () => {
    const food = { name: nm, g, ...macros(v) }
    if (!nm.trim()) { toast(t('Give it a name.')); return }
    if (!(g > 0)) { toast(t('Enter the serving size in grams.')); return }
    const key = id || uid()
    update(s => { s.foods = withFood(s.foods, key, food) })
    close()
    onSaved?.(key, readFood(food))
  }
  const remove = () => { update(s => { s.foods = withFood(s.foods, id, null) }); close(); toast(t('Food removed')) }
  return <>
    <h3>{id ? t('Edit food') : t('New food')}</h3>
    <div className="muted small" style={{ marginBottom: 12 }}>{t('The values for one serving, as on the label. When you add it to a meal, they are scaled to the grams you ate.')}</div>
    <TextField value={nm} placeholder={t('Name, e.g. Sek Quark Yoğurt')} maxLength={80} autoFocus={!id} onChange={e => setNm(e.target.value)} />
    <div style={{ height: 11 }} />
    <div className="measure-form">
      <Num label={t('Serving')} unit="g" value={g} onChange={setG} />
    </div>
    <div style={{ height: 11 }} />
    <MacroFields v={v} set={setV} />
    <div style={{ height: 16 }} />
    <Button variant="primary" onClick={save}>{t('Save')}</Button>
    {id && <><div style={{ height: 8 }} /><Button variant="danger" onClick={remove}>{t('Delete')}</Button></>}
  </>
}
export const foodEditSheet = (id, onSaved) => ui().openSheet(close => <FoodEdit id={id} onSaved={onSaved} close={close} />)

/** The saved foods, to add, change or remove. */
function Foods() {
  const foods = foodsOf(useStore(s => s.S))
  return <>
    <h3>{t('Saved foods')}</h3>
    <div className="muted small" style={{ marginBottom: 12 }}>{t('Foods you eat often, with their values per serving.')}</div>
    {foods.length ? <div className="list">{foods.map(f => <div key={f.id} className="item" {...tappable(() => foodEditSheet(f.id))}>
      <div className="grow"><div className="tt">{f.name}</div><div className="ss">{n1(f.g)} g · {macroLine(f)}</div></div>
      <Icon name="chevronRight" className="chev" />
    </div>)}</div> : <div className="muted small">{t('No saved foods yet.')}</div>}
    <div style={{ height: 14 }} />
    <Button variant="primary" icon="plus" onClick={() => foodEditSheet(null)}>{t('New food')}</Button>
  </>
}
export const foodsSheet = () => ui().openSheet(() => <Foods />)

/* ============================ adding to a meal ============================ */
// Pick a saved food, say how many grams, and the scaled values are added to the meal.
function FoodPicker({ onAdd, close }) {
  const foods = foodsOf(useStore(s => s.S))
  const [q, setQ] = useState('')
  const [pick, setPick] = useState(null)        // { id, food }
  const [g, setG] = useState(null)
  const choose = (id, food) => { setPick({ id, food }); setG(food.g) }
  if (pick) {
    const preview = scaleFood(pick.food, g)
    return <>
      <h3>{pick.food.name}</h3>
      <div className="muted small" style={{ marginBottom: 12 }}>{t('Per {0} g: {1}', n1(pick.food.g), macroLine(pick.food))}</div>
      <div className="measure-form"><Num label={t('Amount eaten')} unit="g" value={g} onChange={setG} autoFocus /></div>
      <div className="nu-preview">{macroLine(preview)}</div>
      <div style={{ height: 14 }} />
      <Button variant="primary" onClick={() => {
        if (!(g > 0) || g > GRAM_MAX) { toast(t('Enter the grams you ate.')); return }
        onAdd(foodItem(pick.food, pick.id, g)); close()
      }}>{t('Add to meal')}</Button>
      <div style={{ height: 8 }} />
      <Button variant="ghost" className="dim" onClick={() => setPick(null)}>{t('Back')}</Button>
    </>
  }
  const needle = q.trim().toLocaleLowerCase()
  const shown = needle ? foods.filter(f => f.name.toLocaleLowerCase().includes(needle)) : foods
  return <>
    <h3>{t('Add food')}</h3>
    {foods.length > 5 && <><SearchField value={q} placeholder={t('Search')} onChange={e => setQ(e.target.value)} onClear={() => setQ('')} /><div style={{ height: 10 }} /></>}
    {shown.length ? <div className="list">{shown.map(f => <div key={f.id} className="item" {...tappable(() => choose(f.id, f))}>
      <div className="grow"><div className="tt">{f.name}</div><div className="ss">{n1(f.g)} g · {macroLine(f)}</div></div>
      <Icon name="plus" className="chev" />
    </div>)}</div> : <div className="muted small">{foods.length ? t('No match.') : t('No saved foods yet. Save one you eat often and add it in grams.')}</div>}
    <div style={{ height: 14 }} />
    <Button icon="plus" onClick={() => foodEditSheet(null, (id, food) => food && choose(id, food))}>{t('New food')}</Button>
  </>
}
const foodPickerSheet = onAdd => ui().openSheet(close => <FoodPicker onAdd={onAdd} close={close} />)

/** Something eaten that is not a saved food: a name and its values, typed in. */
function ManualItem({ onAdd, close, item }) {
  const [nm, setNm] = useState(item?.name || '')
  const [v, setV] = useState(item ? { kcal: item.kcal, p: item.p, sf: item.sf } : { kcal: null, p: null, sf: null })
  const add = () => {
    const m = macros(v)
    if (!nm.trim() && !m.kcal && !m.p && !m.sf) { toast(t('Enter a name or a value.')); return }
    onAdd({ name: nm.trim(), ...m }); close()
  }
  return <>
    <h3>{item ? t('Edit item') : t('Add manually')}</h3>
    <TextField value={nm} placeholder={t('What was it?')} maxLength={80} autoFocus={!item} onChange={e => setNm(e.target.value)} />
    <div style={{ height: 11 }} />
    <MacroFields v={v} set={setV} />
    <div style={{ height: 16 }} />
    <Button variant="primary" onClick={add}>{item ? t('Save') : t('Add to meal')}</Button>
  </>
}
const manualItemSheet = (onAdd, item) => ui().openSheet(close => <ManualItem onAdd={onAdd} item={item} close={close} />)

/* ============================ a meal ============================ */
function MealEdit({ iso, id, close }) {
  const old = id ? readMeal(S().meals?.[id]) : null
  const [nm, setNm] = useState(old?.name ?? '')
  const [items, setItems] = useState(old?.items || [])
  const total = mealTotals({ items })
  const addItem = it => setItems(list => [...list, it])
  const setItem = (i, it) => setItems(list => list.map((x, j) => (j === i ? it : x)))
  const removeItem = i => setItems(list => list.filter((_, j) => j !== i))
  const save = () => {
    if (!items.length) { toast(t('Add something you ate first.')); return }
    const meal = { d: iso, t: old?.t || Date.now(), name: nm.trim(), items }
    update(s => { s.meals = withMeal(s.meals, id || uid(), meal) })
    close(); toast(t('Meal saved'))
  }
  const remove = () => { update(s => { s.meals = withMeal(s.meals, id, null) }); close(); toast(t('Meal deleted')) }
  return <>
    <h3>{id ? t('Edit meal') : t('Add meal')}</h3>
    <div className="muted small" style={{ marginBottom: 10 }}>{fmtDate(iso, true)}</div>
    <TextField value={nm} placeholder={t('Meal name')} maxLength={80} onChange={e => setNm(e.target.value)} />
    <div className="chips nu-chips">{MEAL_NAMES.map(m => <button key={m} className={'chip' + (nm === t(m) ? ' on' : '')} onClick={() => setNm(t(m))}>{t(m)}</button>)}</div>

    <h4 className="sec">{t('What you ate')}</h4>
    {items.length ? <div className="list">{items.map((it, i) => <div key={i} className="item">
      <div className="grow" {...tappable(() => (it.food ? null : manualItemSheet(x => setItem(i, x), it)))}>
        <div className="tt">{it.name || t('Item')}{it.g ? <span className="dim"> · {n1(it.g)} g</span> : null}</div>
        <div className="ss">{macroLine(it)}</div>
      </div>
      <button className="iconbtn sm" aria-label={t('Remove')} onClick={() => removeItem(i)}><Icon name="xmark" /></button>
    </div>)}</div> : <div className="muted small">{t('Add a saved food in grams, or type the values in.')}</div>}
    <div className="lm-actions">
      <Button icon="list" onClick={() => foodPickerSheet(addItem)}>{t('Add food')}</Button>
      <Button icon="pencil" onClick={() => manualItemSheet(addItem)}>{t('Add manually')}</Button>
    </div>
    {items.length > 0 && <div className="nu-total"><span>{t('Total')}</span><b>{macroLine(total)}</b></div>}
    <div style={{ height: 16 }} />
    <Button variant="primary" onClick={save}>{t('Save meal')}</Button>
    {id && <><div style={{ height: 8 }} /><Button variant="danger" onClick={remove}>{t('Delete meal')}</Button></>}
  </>
}
export const mealSheet = (iso, id = null) => ui().openSheet(close => <MealEdit iso={iso} id={id} close={close} />)

/* ============================ supplements ============================ */
function SuppEdit({ id, close }) {
  const old = id ? S().supps?.[id] : null
  const [nm, setNm] = useState(old?.name || '')
  const [dose, setDose] = useState(old?.dose || '')
  const save = () => {
    if (!nm.trim()) { toast(t('Give it a name.')); return }
    update(s => { s.supps = withSupp(s.supps, id || uid(), { name: nm, dose }) })
    close()
  }
  const remove = () => { update(s => { s.supps = withSupp(s.supps, id, null) }); close(); toast(t('Supplement removed')) }
  return <>
    <h3>{id ? t('Edit supplement') : t('New supplement')}</h3>
    <TextField value={nm} placeholder={t('Name, e.g. Vitamin D')} maxLength={80} autoFocus={!id} onChange={e => setNm(e.target.value)} />
    <div style={{ height: 10 }} />
    <TextField value={dose} placeholder={t('Dose (optional), e.g. 1000 IU')} maxLength={80} onChange={e => setDose(e.target.value)} />
    <div style={{ height: 16 }} />
    <Button variant="primary" onClick={save}>{t('Save')}</Button>
    {id && <><div style={{ height: 8 }} /><Button variant="danger" onClick={remove}>{t('Delete')}</Button></>}
  </>
}
export const suppEditSheet = id => ui().openSheet(close => <SuppEdit id={id} close={close} />)

// The usual ones, one tap each (English source strings, saved in the language on screen).
const SUPP_PRESETS = ['Vitamin D', 'Fish oil', 'Creatine', 'Protein powder', 'Magnesium', 'Multivitamin']

function Supps() {
  const supps = suppsOf(useStore(s => s.S))
  const have = new Set(supps.map(s => s.name.toLocaleLowerCase()))
  const presets = SUPP_PRESETS.filter(p => !have.has(t(p).toLocaleLowerCase()))
  return <>
    <h3>{t('Supplements')}</h3>
    <div className="muted small" style={{ marginBottom: 12 }}>{t('The supplements you take. Tick them off each day on the Nutrition screen.')}</div>
    {supps.length > 0 && <div className="list">{supps.map(s => <div key={s.id} className="item" {...tappable(() => suppEditSheet(s.id))}>
      <span className="lrow-i" style={{ background: 'var(--teal)' }}><Icon name="pill" /></span>
      <div className="grow"><div className="tt">{s.name}</div>{s.dose && <div className="ss">{s.dose}</div>}</div>
      <Icon name="chevronRight" className="chev" />
    </div>)}</div>}
    {presets.length > 0 && <>
      <h4 className="sec">{t('Quick add')}</h4>
      <div className="mchips">{presets.map(p => <button key={p} className="chip" onClick={() => update(s => { s.supps = withSupp(s.supps, uid(), { name: t(p) }) })}>+ {t(p)}</button>)}</div>
    </>}
    <div style={{ height: 14 }} />
    <Button variant="primary" icon="plus" onClick={() => suppEditSheet(null)}>{t('New supplement')}</Button>
  </>
}
export const suppsSheet = () => ui().openSheet(() => <Supps />)

