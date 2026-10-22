// Nutrition: the meals of a day against the daily goal for calories, protein and saturated fat,
// the supplements taken that day, and the same for a week. Numbers from lib/nutrition.js.
import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { t, dateLocale } from '../lib/i18n.js'
import { fmtDate, fmtDateRange, todayISO, isoOf, weekStartOf, weekKey, DAYS } from '../lib/format.js'
import { mealsOn, dayIntake, goalOf, standing, suppsOn, withSuppCount, weekNutrition } from '../lib/nutrition.js'
import { mealSheet, nutritionGoalSheet, foodsSheet, suppsSheet, macroLine } from '../nutrition-sheets.jsx'
import WeekBars from '../components/WeekBars.jsx'
import Icon from '../components/Icon.jsx'
import { Button, Segmented } from '../components/ui.jsx'
import { tappable } from '../lib/use-sheet-keyboard.js'
import '../report.css'

const ISO = /^\d{4}-\d{2}-\d{2}$/
const shift = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoOf(d) }
const num = (v, key) => (key === 'kcal' ? Math.round(v || 0) : Math.round((v || 0) * 10) / 10).toLocaleString(dateLocale())
const unitOf = key => (key === 'kcal' ? 'kcal' : 'g')
export const NUTRI_LABEL = { kcal: 'Calories', p: 'Protein', sf: 'Saturated fat' }
// Bar colour by standing: on goal green; short of a target or minimum the accent; over a target
// orange; over a limit red.
const BAR_COLOR = { met: 'var(--green)', ok: 'var(--green)', short: 'var(--acc)', over: 'var(--orange)', none: 'var(--acc)' }
const barColor = (key, status) => (key === 'sf' && status === 'over' ? 'var(--red)' : BAR_COLOR[status])

/** How a number stands, in words, under its bar. */
function standingText(key, value, goal) {
  const { status } = standing(key, value, goal)
  if (status === 'none') return t('No goal')
  const left = Math.abs(goal - value)
  if (key === 'sf') return status === 'over' ? t('{0} over the limit', num(left, key) + ' g') : t('{0} left', num(left, key) + ' g')
  if (status === 'over') return t('{0} over', num(left, key) + ' ' + unitOf(key))
  if (status === 'met') return key === 'p' ? t('Goal reached') : t('On target')
  return t('{0} to go', num(left, key) + ' ' + unitOf(key))
}

/** One bar per number: the day's total against its goal. Used on Home and in the Report too. */
export function NutritionBars({ intake, goal, compact }) {
  return <div className={'nu-bars' + (compact ? ' compact' : '')}>
    {['kcal', 'p', 'sf'].map(k => {
      const g = goal[k], v = intake[k] || 0
      const { ratio, status } = standing(k, v, g)
      const fill = g ? Math.min(1, ratio) * 100 : 0
      return <div key={k} className="nu-bar" data-nutri={k} data-status={status}>
        <div className="nu-bh">
          <span>{t(NUTRI_LABEL[k])}</span>
          <b>{num(v, k)}{g ? <span className="dim"> / {num(g, k)}</span> : null} <small>{unitOf(k)}</small></b>
        </div>
        <div className="nu-track">
          <i style={{ width: fill + '%', background: barColor(k, status) }} />
        </div>
        {!compact && <div className="nu-bs" style={{ color: status === 'over' ? barColor(k, status) : undefined }}>{standingText(k, v, g)}</div>}
      </div>
    })}
  </div>
}

/** The day's supplements, each a tap to tick off. */
function SuppList({ S, iso }) {
  const update = useStore(s => s.update)
  const list = suppsOn(S, iso)
  const taken = list.filter(s => s.n > 0).length
  const toggle = s => update(st => { st.suppLog = withSuppCount(st.suppLog, iso, s.id, s.n > 0 ? 0 : 1, s) })
  return <div className="card">
    <div className="row between" style={{ marginBottom: 6 }}>
      <h2 style={{ margin: 0 }}>{t('Supplements')}{list.length ? <span className="dim"> · {taken}/{list.length}</span> : null}</h2>
      <Button size="sm" icon={list.length ? 'pencil' : 'plus'} onClick={suppsSheet}>{list.length ? t('Edit') : t('Add')}</Button>
    </div>
    {list.length ? list.map(s => <div key={s.id} className={'nu-supp' + (s.n > 0 ? ' on' : '')} data-supp={s.id}
      role="checkbox" aria-checked={s.n > 0} {...(iso <= todayISO() && !s.gone ? tappable(() => toggle(s)) : {})}>
      <span className="nu-check">{s.n > 0 && <Icon name="check" />}</span>
      <span className="grow"><span className="tt">{s.name}</span>{s.dose && <span className="ss"> · {s.dose}</span>}</span>
      {s.n > 1 && <span className="tag">×{s.n}</span>}
    </div>) : <div className="muted small">{t('Add the supplements you take, like vitamin D, creatine or fish oil, and tick them off each day.')}</div>}
  </div>
}

/* ------------------------------ one day ------------------------------ */
function DayView({ S, iso }) {
  const meals = useMemo(() => mealsOn(S, iso), [S, iso])
  const intake = dayIntake(S, iso)
  const goal = goalOf(S)
  const hasGoal = goal.kcal || goal.p || goal.sf
  const canLog = iso <= todayISO()
  return <>
    <div className="card">
      <div className="row between" style={{ marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>{t('Daily goal')}</h2>
        <Button size="sm" icon={hasGoal ? 'pencil' : 'target'} onClick={nutritionGoalSheet}>{hasGoal ? t('Edit') : t('Set goal')}</Button>
      </div>
      <NutritionBars intake={intake} goal={goal} />
      {!hasGoal && <div className="muted small" style={{ marginTop: 8 }}>{t('Set a daily goal to see where you stand.')}</div>}
    </div>

    <div className="row between" style={{ margin: '4px 2px 8px' }}>
      <h4 className="sec" style={{ margin: 0 }}>{t('Meals')}</h4>
      {canLog && <Button size="sm" variant="tinted" icon="plus" onClick={() => mealSheet(iso)}>{t('Add meal')}</Button>}
    </div>
    {meals.length ? <div className="list">{meals.map(m => <div key={m.id} className="item" data-meal={m.id} {...tappable(() => mealSheet(iso, m.id))}>
      <span className="lrow-i" style={{ background: 'var(--orange)' }}><Icon name="utensils" /></span>
      <div className="grow">
        <div className="tt">{m.name || t('Meal')}</div>
        <div className="ss">{macroLine(m.total)}</div>
        <div className="ss dim nu-items">{m.items.map(it => it.name + (it.g ? ` ${Math.round(it.g)} g` : '')).filter(Boolean).join(' · ')}</div>
      </div>
      <Icon name="chevronRight" className="chev" />
    </div>)}</div> : <div className="card muted small">{canLog ? t('No meals yet. Add what you ate: a saved food in grams, or the values typed in.') : t('No meals logged on this day.')}</div>}
    <div style={{ height: 12 }} />

    <SuppList S={S} iso={iso} />

    <div className="row" style={{ gap: 8, justifyContent: 'center' }}>
      <Button size="sm" variant="ghost" icon="list" onClick={foodsSheet}>{t('Saved foods')}</Button>
      <Button size="sm" variant="ghost" icon="pill" onClick={suppsSheet}>{t('Supplements')}</Button>
    </div>
  </>
}

/* ------------------------------ one week ------------------------------ */
function WeekView({ S, from, onDay }) {
  const w = useMemo(() => weekNutrition(S, from), [S, from])
  const isos = w.days.map(d => d.iso)
  const chart = k => {
    const g = w.goal[k]
    // A day short of its goal is dimmed, so the days that made it stand out.
    const colorOf = v => {
      if (!v) return undefined
      const st = standing(k, v, g).status
      return st === 'short' ? 'color-mix(in srgb, var(--acc) 38%, var(--surface-2))' : barColor(k, st)
    }
    return <div className="card" key={k}>
      <div className="row between">
        <h2 style={{ margin: 0 }}>{t(NUTRI_LABEL[k])}</h2>
        {g && w.logged > 0 && <span className="small muted">{k === 'sf' ? t('under the limit on {0} of {1} days', w.onGoal[k], w.logged) : t('on goal on {0} of {1} days', w.onGoal[k], w.logged)}</span>}
      </div>
      <div className="rp-big">{num(w.avg[k], k)} <small>{unitOf(k)} · {t('daily average')}</small></div>
      {g && <div className="muted small">{t('Goal: {0}', num(g, k) + ' ' + unitOf(k))}</div>}
      <WeekBars days={isos} values={w.days.map(d => d[k])} goal={g} onDay={onDay} label={t(NUTRI_LABEL[k])} colorOf={colorOf} />
    </div>
  }
  return <>
    {!w.logged && <div className="card muted small">{t('No meals logged this week.')}</div>}
    {['kcal', 'p', 'sf'].map(chart)}
    <div className="card">
      <h2>{t('Supplements')}</h2>
      {w.supps.length ? <div className="nu-grid" style={{ '--cols': 7 }}>
        <span />{isos.map(d => <span key={d} className="nu-gh">{t(DAYS[new Date(d + 'T12:00:00').getDay()])}</span>)}
        {w.supps.map(s => [
          <span key={s.id} className="nu-gn">{s.name}<em>{s.days.length}/7</em></span>,
          ...isos.map(d => <span key={s.id + d} className={'nu-gc' + (s.days.includes(d) ? ' on' : '')} />),
        ])}
      </div> : <div className="muted small">{t('No supplements yet.')}</div>}
    </div>
  </>
}

export default function Nutrition() {
  const S = useStore(s => s.S)
  const [params, setParams] = useSearchParams()
  const ws = weekStartOf(S)
  const today = todayISO()
  const view = params.get('v') === 'week' ? 'week' : 'day'
  const raw = params.get('d')
  const iso = raw && ISO.test(raw) && raw <= today ? raw : today
  const go = (v, d) => setParams({ v, d }, { replace: true })
  const from = weekKey(iso, ws)
  const isLatest = view === 'day' ? iso >= today : from >= weekKey(today, ws)
  const step = view === 'day' ? 1 : 7
  const title = view === 'day'
    ? (iso === today ? t('Today') : iso === shift(today, -1) ? t('Yesterday') : fmtDate(iso, true))
    : (from === weekKey(today, ws) ? t('This week') : from === weekKey(shift(today, -7), ws) ? t('Last week') : fmtDateRange(from, shift(from, 6), false))

  return <div className="narrow rp nu">
    <div className="hdr"><div><h1>{t('Nutrition')}</h1>
      <div className="sub">{view === 'day' ? fmtDate(iso, true, true) : fmtDateRange(from, shift(from, 6), true)}</div></div></div>
    <Segmented value={view} onChange={v => go(v, iso)} options={[{ value: 'day', label: t('Day') }, { value: 'week', label: t('Week') }]} />
    <div className="row between rp-nav">
      <button className="iconbtn sm" aria-label={view === 'day' ? t('Previous day') : t('Previous week')} onClick={() => go(view, shift(iso, -step))}><Icon name="chevronLeft" /></button>
      <span className="small" style={{ fontWeight: 600 }}>{title}</span>
      <button className="iconbtn sm" aria-label={view === 'day' ? t('Next day') : t('Next week')} disabled={isLatest}
        onClick={() => { const n = shift(iso, step); go(view, n > today ? today : n) }}><Icon name="chevronRight" /></button>
    </div>
    {view === 'day' ? <DayView S={S} iso={iso} /> : <WeekView S={S} from={from} onDay={d => d <= today && go('day', d)} />}
  </div>
}
