// Seven bars, one per day of a week, with an optional goal line (views/Report.jsx, views/Nutrition.jsx).
// A bar that reaches the goal turns green; `colorOf(value)` overrides that, for a goal that is a
// limit (saturated fat) rather than something to reach. A day with no value has no bar.
import { t, dateLocale } from '../lib/i18n.js'
import { todayISO, DAYS } from '../lib/format.js'
import { tappable } from '../lib/use-sheet-keyboard.js'

const fmtShort = v => (v >= 10000 ? Math.round(v / 1000) + 'k' : (Math.round(v * 10) / 10).toLocaleString(dateLocale()))

export default function WeekBars({ days, values, goal, onDay, label, colorOf }) {
  const max = Math.max(goal || 0, ...values, 1)
  const today = todayISO()
  return <div className="rp-bars" role="img" aria-label={label}>
    {goal > 0 && <div className="rp-goal" style={{ bottom: 18 + goal / max * 88 }} />}
    {days.map((d, i) => {
      const v = values[i] || 0
      const color = colorOf ? colorOf(v) : goal > 0 && v >= goal ? 'var(--green)' : undefined
      return <div key={d} className={'rp-bar' + (d === today ? ' today' : '')} {...(onDay ? tappable(() => onDay(d)) : {})}>
        <div className="rp-bv">{v ? fmtShort(v) : ''}</div>
        <div className="rp-bc"><i style={{ height: (v / max * 100) + '%', background: color }} /></div>
        <div className="rp-bl">{t(DAYS[new Date(d + 'T12:00:00').getDay()])}</div>
      </div>
    })}
  </div>
}
