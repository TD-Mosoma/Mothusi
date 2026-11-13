import { useEffect, useMemo, useState } from 'react'
import { agentStates } from './AgentTimeline.jsx'
import './AgentProgress.css'

// The short, teacher-friendly view of the agents at work: one line per step, what each step has produced so
// far, and a time estimate. The full timeline (every event, check and correction) is one click away.
const STEPS = [
  { agent: 'Progress Tracker', label: 'Remembering what worked with these learners' },
  { agent: 'Lesson Analyst', label: 'Reading what the lesson asks of learners' },
  { agent: 'Needs Matcher', label: 'Matching those demands to your learners' },
  { agent: 'Adaptation Designer', label: 'Designing support that fits your time' },
  { agent: 'Reviewer', label: 'Checking every idea against your classroom' },
  { agent: 'Personalisation Agent', label: 'Writing material for learners' },
  { agent: 'Language Agent', label: 'Translating into home languages' },
  { agent: 'Pack Builder', label: 'Putting your lesson plan together' },
]
const LIVE_ESTIMATE_S = 180

const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

export default function AgentProgress({ events, status, heading }) {
  const states = useMemo(() => agentStates(events), [events])
  const started = events[0]
  const live = started?.data?.live !== false
  const running = status === 'running' || status === 'connecting'
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!running) return undefined
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [running])

  const last = events[events.length - 1]
  const elapsed = started ? (running ? (now - new Date(started.ts).getTime()) / 1000 : (last?.elapsed_ms || 0) / 1000) : 0
  const latest = useMemo(() => {
    const out = {}
    for (const e of events) if (e.type === 'agent_output' || e.type === 'warning') out[e.agent] = e.title
    return out
  }, [events])
  const corrections = events.filter((e) => e.type === 'check_failed').length

  const steps = STEPS.filter((s) => !['not involved', 'not needed', 'skipped'].includes(states[s.agent]?.state))
  const done = steps.filter((s) => states[s.agent]?.state === 'done').length
  const finished = status === 'done'
  const pct = finished ? 100 : Math.min(95, Math.round((done / Math.max(steps.length, 1)) * 100))
  const remaining = live ? Math.max(0, LIVE_ESTIMATE_S - elapsed) : 0

  return (
    <section className="ap card" aria-label="Lesson preparation progress">
      <div className="ap-head">
        <div>
          <h2>{finished ? (heading ? 'Finished' : 'Your lesson plan is ready') : status === 'failed' ? 'Mothusi stopped safely' : heading || 'Preparing your lesson plan'}</h2>
          <p className="muted small-text">
            {finished
              ? `Finished in ${clock(elapsed)}${corrections ? `. The Reviewer caught and fixed ${corrections} problem${corrections === 1 ? '' : 's'} on the way` : ''}.`
              : running
                ? live
                  ? remaining > 0 ? `Usually about 3 minutes. About ${clock(remaining)} to go.` : 'Taking a little longer than usual. Still working.'
                  : 'Practice mode is quick: a few seconds.'
                : ''}
          </p>
        </div>
        <span className="ap-clock" aria-label="Time so far">{clock(elapsed)}</span>
      </div>

      <div className="ap-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Progress">
        <span style={{ width: `${pct}%` }} />
      </div>

      <ol className="ap-steps">
        {steps.map((s) => {
          const state = states[s.agent]?.state || 'waiting'
          const tone = state === 'done' ? 'done' : state === 'working' ? 'working' : 'waiting'
          return (
            <li key={s.agent} className={`ap-step ${tone}`}>
              <span className="ap-icon" aria-hidden="true">{tone === 'done' ? '✓' : ''}</span>
              <span className="ap-text">
                <strong>{s.label}</strong>
                {latest[s.agent] && <span className="muted small-text">{latest[s.agent]}</span>}
              </span>
              <span className="visually-hidden">{tone === 'done' ? 'done' : tone === 'working' ? 'in progress' : 'waiting'}</span>
            </li>
          )
        })}
      </ol>
      <p className="visually-hidden" aria-live="polite">{last && last.type === 'agent_output' ? `${last.agent}: ${last.title}` : ''}</p>
    </section>
  )
}
