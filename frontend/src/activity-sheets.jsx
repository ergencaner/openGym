// Sheets for log mode: a day's steps, a day's own calorie number, the daily step goal, and a
// week's muscle goals. The numbers themselves live in lib/activity.js and lib/week-goals.js.
import { useState } from 'react'
import { useStore } from './store/useStore.js'
import { useUI } from './store/useUI.js'
import { t } from './lib/i18n.js'
import { fmtDate, fmtDateRange } from './lib/format.js'
import { MUSCLES, MUSCLE_NAME } from './lib/muscles.js'
import { stepsOn, withSteps, dayKcalOverride, withDayKcal, dayKcal, stepGoalOf, weekDays, STEPS_MAX, KCAL_MAX } from './lib/activity.js'
import { weekGoalOf, lastWeekGoalBefore, withWeekGoal, GOAL_DAYS_MAX } from './lib/week-goals.js'
import { Button, NumberField } from './components/ui.jsx'
import Stepper from './components/Stepper.jsx'

const S = () => useStore.getState().S
const update = (...a) => useStore.getState().update(...a)
const ui = () => useUI.getState()
const toast = m => ui().toast(m)

// The muscles in the order the goal editor groups them (lib/muscles.js MUSCLES).
export const MUSCLE_GROUPS = [
  { title: 'Upper body', muscles: ['chest', 'upper-back', 'deltoids', 'trapezius', 'serratus'] },
  { title: 'Arms', muscles: ['biceps', 'triceps', 'forearm'] },
  { title: 'Core', muscles: ['abs', 'obliques', 'lower-back'] },
  { title: 'Legs', muscles: ['gluteal', 'quadriceps', 'hamstring', 'adductors', 'hip-flexors', 'calves', 'tibialis'] },
]

/* ---------------- one number for one day ---------------- */
function DayNumber({ title, note, iso, value, max, step, unit, onSave, onClear, close }) {
  const [v, setV] = useState(value ?? null)
  const save = () => {
    const n = Math.round(Number(v) || 0)
    if (n > max) { toast(t('That number is too large.')); return }
    onSave(n); close()
  }
  return <>
    <h3>{title}</h3>
    <div className="muted small" style={{ marginBottom: 12 }}>{fmtDate(iso, true)}{note ? ' · ' + note : ''}</div>
    <div className="row" style={{ gap: 10, alignItems: 'center' }}>
      <NumberField className="big-num" value={v} nullable decimal={false} inputMode="numeric" autoFocus
        aria-label={title} onChange={setV} onKeyDown={e => { if (e.key === 'Enter') save() }} style={{ flex: 1 }} />
      <span className="muted">{unit}</span>
    </div>
    {step && <div className="row" style={{ gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
      {step.map(n => <Button key={n} size="sm" onClick={() => setV((Number(v) || 0) + n)}>+{n.toLocaleString()}</Button>)}
    </div>}
    <div style={{ height: 16 }} />
    <Button variant="primary" onClick={save}>{t('Save')}</Button>
    {value != null && onClear && <><div style={{ height: 8 }} /><Button variant="danger" onClick={() => { onClear(); close() }}>{t('Clear')}</Button></>}
  </>
}

/** Log or correct the steps walked on `iso`. */
export function stepsSheet(iso) {
  ui().openSheet(close => <DayNumber close={close} iso={iso} title={t('Steps')} unit={t('steps')}
    value={stepsOn(S(), iso)} max={STEPS_MAX} step={[1000, 5000]}
    onSave={n => update(s => { s.steps = withSteps(s.steps, iso, n) })}
    onClear={() => update(s => { s.steps = withSteps(s.steps, iso, 0) })} />)
}

/** Replace the day's workout calories with your own number (a watch's), or go back to the estimate. */
export function kcalSheet(iso) {
  const day = dayKcal(S(), iso)
  ui().openSheet(close => <DayNumber close={close} iso={iso} title={t('Workout calories')} unit="kcal"
    note={t('Estimate: {0} kcal', day.workout)}
    value={dayKcalOverride(S(), iso)} max={KCAL_MAX}
    onSave={n => update(s => { s.dayKcal = withDayKcal(s.dayKcal, iso, n) })}
    onClear={() => update(s => { s.dayKcal = withDayKcal(s.dayKcal, iso, null) })} />)
}

/** The daily step goal (0 turns it off). */
function StepGoal({ close }) {
  const [v, setV] = useState(stepGoalOf(S()) || 0)
  return <>
    <h3>{t('Daily step goal')}</h3>
    <div className="muted small" style={{ marginBottom: 12 }}>{t('The report marks the days you reach it. 0 turns it off.')}</div>
    <Stepper label={t('Steps')} value={v} step={500} min={0} max={STEPS_MAX} decimal={false} onChange={n => setV(Math.round(n))} />
    <div style={{ height: 16 }} />
    <Button variant="primary" onClick={() => { update(s => { s.stepGoal = v > 0 ? v : null }); close() }}>{t('Save')}</Button>
  </>
}
export const stepGoalSheet = () => ui().openSheet(close => <StepGoal close={close} />)

/* ---------------- a week's muscle goals ---------------- */
function WeekGoals({ wk, close }) {
  const st = S()
  const [goal, setGoal] = useState(() => ({ ...(weekGoalOf(st, wk) || {}) }))
  const prev = lastWeekGoalBefore(st, wk)
  const days = weekDays(wk)
  const set = (m, n) => setGoal(g => ({ ...g, [m]: Math.max(0, Math.min(GOAL_DAYS_MAX, Math.round(n))) }))
  const total = MUSCLES.reduce((n, m) => n + (goal[m] || 0), 0)
  const save = () => {
    update(s => { s.weekGoals = withWeekGoal(s.weekGoals, wk, goal) })
    close()
    toast(total ? t('Weekly goals saved') : t('Weekly goals cleared'))
  }
  return <>
    <h3>{t('Weekly goals')}</h3>
    <div className="muted small" style={{ marginBottom: 10 }}>
      {fmtDateRange(days[0], days[6], true)} · {t('How many days this week should each muscle be trained?')}
    </div>
    {prev && <div style={{ marginBottom: 10 }}><Button size="sm" icon="copy" onClick={() => setGoal({ ...prev })}>{t('Copy last goals')}</Button></div>}
    {MUSCLE_GROUPS.map(g => <div key={g.title} className="goal-grp">
      <h4 className="sec">{t(g.title)}</h4>
      {g.muscles.map(m => <div key={m} className="goal-row" data-goal-muscle={m}>
        <span className="goal-nm">{t(MUSCLE_NAME[m])}</span>
        <Stepper value={goal[m] || 0} step={1} min={0} max={GOAL_DAYS_MAX} decimal={false}
          ariaLabel={t(MUSCLE_NAME[m])} unit={t('days')} onChange={n => set(m, n)} />
      </div>)}
    </div>)}
    <div style={{ height: 14 }} />
    <Button variant="primary" onClick={save}>{t('Save')}</Button>
    {total > 0 && <><div style={{ height: 8 }} /><Button variant="ghost" className="dim" onClick={() => setGoal({})}>{t('Clear')}</Button></>}
  </>
}
export const weekGoalSheet = wk => ui().openSheet(close => <WeekGoals wk={wk} close={close} />)
