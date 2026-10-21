// The Report (log mode, Settings → Plan & schedule): a day or a week at a glance — which muscles
// were trained, what it burned, the steps walked and, for a week, how it measured up to the
// week's muscle goals and to the week before. The numbers come from lib/report.js.
import { useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { t, tn, dateLocale } from '../lib/i18n.js'
import { fmtDate, fmtDateRange, fmtNum, fmtVol, todayISO, isoOf, weekStartOf, weekKey, exerciseNameText, DAYS } from '../lib/format.js'
import { MUSCLE_NAME, rankOf } from '../lib/muscles.js'
import { exOr } from '../lib/exercises.js'
import { dayReport, weekReport } from '../lib/report.js'
import { logWorkoutSheet, logPastWorkoutSheet, workoutDetailSheet } from '../sheets.jsx'
import { stepsSheet, kcalSheet, weekGoalSheet, stepGoalSheet } from '../activity-sheets.jsx'
import BodyMap, { BodyMapLegend } from '../components/BodyMap.jsx'
import Icon from '../components/Icon.jsx'
import { Button, Segmented } from '../components/ui.jsx'
import { tappable } from '../lib/use-sheet-keyboard.js'
import '../report.css'

const ISO = /^\d{4}-\d{2}-\d{2}$/
const shift = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoOf(d) }
const fmtInt = n => Math.round(n || 0).toLocaleString(dateLocale())
const pct = x => (x == null ? null : (x > 0 ? '+' : x < 0 ? '−' : '±') + Math.round(Math.abs(x) * 100) + '%')
const STATUS_COLOR = { short: 'var(--orange)', met: 'var(--green)', over: 'var(--blue)', none: 'var(--label-3)' }

/** A change against the week before: an arrow, the percentage, coloured by direction. */
function Change({ value }) {
  const p = pct(value)
  if (!p) return null
  const up = value > 0, flat = Math.round(Math.abs(value) * 100) === 0
  return <span className="rp-chg" style={{ color: flat ? 'var(--label-2)' : up ? 'var(--green)' : 'var(--orange)' }}>
    {!flat && <Icon name={up ? 'arrowUp' : 'arrowDown'} />}{p}
  </span>
}

/** One headline number in a tile; tappable when `onClick` is given. */
function Tile({ icon, tint, label, value, unit, sub, onClick, children }) {
  return <div className={'rp-tile' + (onClick ? ' tap' : '')} {...(onClick ? tappable(onClick) : {})}>
    <div className="rp-tl"><Icon name={icon} style={{ color: tint }} /><span>{label}</span>{onClick && <Icon name="pencil" className="rp-ed" />}</div>
    <div className="rp-tv">{value}{unit && <small> {unit}</small>}</div>
    {sub && <div className="rp-ts">{sub}</div>}
    {children}
  </div>
}

/** Seven bars, one per day, with an optional goal line; a day with no value has no bar. */
function WeekBars({ days, values, goal, onDay, label }) {
  const max = Math.max(goal || 0, ...values, 1)
  const today = todayISO()
  return <div className="rp-bars" role="img" aria-label={label}>
    {goal > 0 && <div className="rp-goal" style={{ bottom: 18 + goal / max * 88 }} />}
    {days.map((d, i) => {
      const v = values[i] || 0
      const hit = goal > 0 && v >= goal
      return <div key={d} className={'rp-bar' + (d === today ? ' today' : '')} {...(onDay ? tappable(() => onDay(d)) : {})}>
        <div className="rp-bv">{v ? (v >= 10000 ? Math.round(v / 1000) + 'k' : fmtInt(v)) : ''}</div>
        <div className="rp-bc"><i style={{ height: (v / max * 100) + '%', background: hit ? 'var(--green)' : undefined }} /></div>
        <div className="rp-bl">{t(DAYS[new Date(d + 'T12:00:00').getDay()])}</div>
      </div>
    })}
  </div>
}

/** The muscles a load reached, hardest first, as chips. */
function MuscleChips({ load }) {
  const { worked } = rankOf(load)
  if (!worked.length) return null
  return <div className="mchips" style={{ marginTop: 8 }}>{worked.map(m => <span key={m} className="mchip">{t(MUSCLE_NAME[m])}</span>)}</div>
}

/* ------------------------------ one day ------------------------------ */
function DayView({ S, iso }) {
  const r = useMemo(() => dayReport(S, iso), [S, iso])
  const k = r.kcal
  const today = todayISO()
  const logIt = () => (iso === today ? logWorkoutSheet() : logPastWorkoutSheet({ iso }))
  const stepPct = r.stepGoal && r.steps ? Math.min(1, r.steps / r.stepGoal) : 0
  return <>
    <div className="card">
      <div className="row between" style={{ marginBottom: 6 }}>
        <h2 style={{ margin: 0 }}>{t('Muscles worked')}</h2>
        {!S.active && iso <= today && <Button size="sm" icon="plus" onClick={logIt}>{t('Log workout')}</Button>}
      </div>
      {r.workouts.length ? <>
        <BodyMap load={r.load} body={S.body} />
        <BodyMapLegend />
        <MuscleChips load={r.load} />
      </> : <div className="muted small">{iso === today ? t('Nothing logged today yet. Log the workout you did and the muscles show up here.') : t('No workout logged on this day.')}</div>}
    </div>

    <div className="rp-grid">
      <Tile icon="flame" tint="var(--orange)" label={t('Calories')} value={fmtInt(k.total)} unit="kcal"
        sub={(k.override != null ? t('Workout: {0} (your number)', fmtInt(k.override)) : t('Workout: {0} (estimate)', fmtInt(k.workout)))
          + (k.steps ? ' · ' + t('Steps: {0}', fmtInt(k.steps)) : '')}
        onClick={r.workouts.length || k.override != null ? () => kcalSheet(iso) : null} />
      <Tile icon="steps" tint="var(--green)" label={t('Steps')} value={r.steps ? fmtInt(r.steps) : '–'}
        sub={r.stepGoal ? (r.steps >= r.stepGoal ? t('Goal reached') : t('Goal: {0}', fmtInt(r.stepGoal))) : null}
        onClick={iso <= today ? () => stepsSheet(iso) : null}>
        {r.stepGoal > 0 && <div className="rp-prog"><i style={{ width: stepPct * 100 + '%', background: stepPct >= 1 ? 'var(--green)' : undefined }} /></div>}
      </Tile>
      <Tile icon="dumbbell" tint="var(--blue)" label={t('Sets')} value={fmtInt(r.sets)}
        sub={r.volume ? t('Volume') + ' ' + fmtVol(r.volume, S.unit) : null} />
      <Tile icon="clock" tint="var(--purple)" label={t('Training time')} value={k.minutes ? fmtInt(k.minutes) : '–'} unit={k.minutes ? t('min') : null}
        sub={r.prs ? t('Records') + ' ' + r.prs : null} />
    </div>
    {k.assumedKg && <div className="muted small rp-note">{t('No body weight logged yet, so calories assume 75 kg. Log your weight for a better estimate.')}</div>}

    {r.workouts.length > 0 && <>
      <h4 className="sec">{t('Workouts')}</h4>
      <div className="list">{r.workouts.map(w => <div key={w.id} className="item" {...tappable(() => workoutDetailSheet(w))}>
        <span className="lrow-i"><Icon name="dumbbell" /></span>
        <div className="grow">
          <div className="tt">{w.name || t('Workout')}</div>
          <div className="ss">{(w.entries || []).map(e => exerciseNameText(exOr(e.id))).join(' · ')}</div>
        </div>
        <Icon name="chevronRight" className="chev" />
      </div>)}</div>
    </>}
  </>
}

/* ------------------------------ one week ------------------------------ */
function WeekView({ S, iso, ws }) {
  const r = useMemo(() => weekReport(S, iso, ws), [S, iso, ws])
  const nav = useNavigate()
  const g = r.goals
  const isos = r.days.map(d => d.iso)
  const summary = {
    none: null,
    short: t('{0} of {1} goals reached', g.met, g.total),
    met: t('All goals reached'),
    over: t('All goals reached, some exceeded'),
  }[g.summary]
  const openDay = d => nav(`/report?v=day&d=${d}`)
  const stepDaysHit = r.stepGoal ? r.days.filter(d => d.steps >= r.stepGoal).length : 0
  return <>
    <div className="card">
      <div className="row between" style={{ marginBottom: 6 }}>
        <h2 style={{ margin: 0 }}>{t('Weekly goals')}</h2>
        <Button size="sm" icon={g.total ? 'pencil' : 'target'} onClick={() => weekGoalSheet(r.from)}>{g.total ? t('Edit') : t('Set goals')}</Button>
      </div>
      {summary && <div className="rp-sum" style={{ color: STATUS_COLOR[g.summary] }}>
        <Icon name={g.summary === 'short' ? 'target' : 'checkCircle'} /> {summary}
      </div>}
      {g.rows.length ? g.rows.map(row => <div key={row.muscle} className="mrow" data-goal-row={row.muscle}>
        <span className="nm">{t(MUSCLE_NAME[row.muscle])}</span>
        <span className="rp-dots" aria-hidden="true">{Array.from({ length: Math.max(row.target, row.done) }, (_, i) =>
          <i key={i} className={i < row.done ? (i < row.target || !row.target ? 'on' : 'extra') : ''} />)}</span>
        <span className="v" style={{ color: STATUS_COLOR[row.status] }}>
          {row.target ? `${row.done}/${row.target}` : row.done} {t('days')}
        </span>
      </div>) : <div className="muted small">{t('Set how many days each muscle should be trained this week, then follow it here.')}</div>}
    </div>

    <div className="card">
      <h2>{t('Muscles worked this week')}</h2>
      {Object.keys(r.load).length ? <>
        <BodyMap load={r.load} body={S.body} />
        <BodyMapLegend />
      </> : <div className="muted small">{t('No workouts in this period yet.')}</div>}
    </div>

    <div className="card">
      <div className="row between"><h2 style={{ margin: 0 }}>{t('Calories')}</h2><Change value={r.change.kcal} /></div>
      <div className="rp-big">{fmtInt(r.totals.kcal)} <small>kcal</small></div>
      <div className="muted small">{t('{0} kcal a day on average', fmtInt(r.totals.kcal / 7))}</div>
      <WeekBars days={isos} values={r.days.map(d => d.kcal.total)} onDay={openDay} label={t('Calories')} />
    </div>

    <div className="card">
      <div className="row between"><h2 style={{ margin: 0 }}>{t('Steps')}</h2><Change value={r.change.steps} /></div>
      <div className="rp-big">{fmtInt(r.totals.steps)} <small>{t('steps')}</small></div>
      <div className="muted small">
        {r.totals.stepDays ? t('{0} a day on average', fmtInt(r.totals.steps / r.totals.stepDays)) : t('No steps logged this week.')}
        {r.stepGoal ? ' · ' + t('goal reached on {0} of 7 days', stepDaysHit) : ''}
      </div>
      <WeekBars days={isos} values={r.days.map(d => d.steps || 0)} goal={r.stepGoal} onDay={d => (d <= todayISO() ? stepsSheet(d) : null)} label={t('Steps')} />
      {!r.stepGoal && <Button size="sm" variant="ghost" icon="target" onClick={stepGoalSheet}>{t('Daily step goal')}</Button>}
    </div>

    <div className="card">
      <h2>{t('Progress vs last week')}</h2>
      <div className="rp-cmp">
        <div><span>{t('Training days')}</span><b>{r.totals.days}</b><em>{t('last week: {0}', r.prev.days)}</em></div>
        <div><span>{t('Sets')}</span><b>{fmtInt(r.totals.sets)}</b><Change value={r.change.sets} /></div>
        <div><span>{t('Volume')}</span><b>{fmtVol(r.totals.volume, S.unit)}</b><Change value={r.change.volume} /></div>
        <div><span>{t('Records')}</span><b>{r.totals.prs}</b><em>{t('last week: {0}', r.prev.prs)}</em></div>
      </div>
      {r.gains.length > 0 && <>
        <h4 className="sec" style={{ marginTop: 12 }}>{t('Stronger this week')}</h4>
        {r.gains.slice(0, 5).map(x => <div key={x.id} className="mrow">
          <span className="nm">{exerciseNameText(exOr(x.id))}</span>
          <span className="v" style={{ minWidth: 0 }}>{fmtNum(x.before)} → {fmtNum(x.now)} {S.unit}</span>
          <span className="rp-chg" style={{ color: 'var(--green)' }}><Icon name="arrowUp" />{Math.round(x.gain * 100)}%</span>
        </div>)}
        <div className="muted small" style={{ marginTop: 4 }}>{t('Estimated one-rep max against your best before this week.')}</div>
      </>}
    </div>
  </>
}

export default function Report() {
  const S = useStore(s => s.S)
  const [params, setParams] = useSearchParams()
  const ws = weekStartOf(S)
  const today = todayISO()
  const view = params.get('v') === 'day' ? 'day' : 'week'
  const raw = params.get('d')
  const iso = raw && ISO.test(raw) && raw <= today ? raw : today
  const go = (v, d) => setParams({ v, d }, { replace: true })

  const isLatest = view === 'day' ? iso >= today : weekKey(iso, ws) >= weekKey(today, ws)
  const step = view === 'day' ? 1 : 7
  const from = weekKey(iso, ws)
  const title = view === 'day'
    ? (iso === today ? t('Today') : iso === shift(today, -1) ? t('Yesterday') : fmtDate(iso, true))
    : (from === weekKey(today, ws) ? t('This week') : from === weekKey(shift(today, -7), ws) ? t('Last week') : fmtDateRange(from, shift(from, 6), false))

  return <div className="narrow rp">
    <div className="hdr"><div><h1>{t('Report')}</h1>
      <div className="sub">{view === 'day' ? fmtDate(iso, true, true) : fmtDateRange(from, shift(from, 6), true)}</div></div></div>
    <Segmented value={view} onChange={v => go(v, iso)}
      options={[{ value: 'day', label: t('Day') }, { value: 'week', label: t('Week') }]} />
    <div className="row between rp-nav">
      <button className="iconbtn sm" aria-label={view === 'day' ? t('Previous day') : t('Previous week')}
        onClick={() => go(view, shift(iso, -step))}><Icon name="chevronLeft" /></button>
      <span className="small" style={{ fontWeight: 600 }}>{title}</span>
      <button className="iconbtn sm" aria-label={view === 'day' ? t('Next day') : t('Next week')} disabled={isLatest}
        onClick={() => { const n = shift(iso, step); go(view, n > today ? today : n) }}><Icon name="chevronRight" /></button>
    </div>
    {view === 'day' ? <DayView S={S} iso={iso} /> : <WeekView S={S} iso={iso} ws={ws} />}
  </div>
}
