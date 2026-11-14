import { useEffect, useMemo, useRef, useState } from 'react'
import './AgentTimeline.css'
import { AGENTS, AGENT_KEY } from './agents.js'
import AgentGraph from './AgentGraph.jsx'



const TYPE_LABEL = {
  run_started: 'Started', plan: 'Planned', decision: 'Decided', agent_started: 'Working', agent_output: 'Output',
  tool: 'Tool', check_passed: 'Passed', check_failed: 'Rejected', repair: 'Self-repair', llm_retry: 'Retry',
  warning: 'Attention', error: 'Error', run_completed: 'Completed', run_failed: 'Stopped',
}
const TYPE_TONE = {
  check_passed: 'ok', run_completed: 'ok', check_failed: 'bad', run_failed: 'bad', error: 'bad',
  repair: 'warn', llm_retry: 'warn', warning: 'warn', decision: 'route', plan: 'route',
}
const HIDDEN_DATA = new Set(['reasoning', 'model', 'live'])
const KEY_TYPES = new Set(['plan', 'decision', 'check_failed', 'check_passed', 'warning', 'repair', 'run_completed', 'run_failed'])

export const formatClock = (iso) => {
  const d = new Date(iso)
  const ms = String(d.getMilliseconds()).padStart(3, '0')
  return `${d.toLocaleTimeString('en-GB', { hour12: false })}.${ms}`
}
const seconds = (ms) => `${(ms / 1000).toFixed(1)}s`

export function agentStates(events) {
  const plan = events.find((e) => e.type === 'plan')
  const planned = new Set((plan?.data?.steps || []).flatMap((s) => s.agent.split(' + ')))
  const skipped = new Set((plan?.data?.steps || []).filter((s) => s.action.startsWith('Skipped')).map((s) => s.agent))
  const finished = events.some((e) => e.type === 'run_completed' || e.type === 'run_failed')
  const out = {}
  for (const a of AGENTS) {
    const mine = events.filter((e) => e.agent === a.name)
    const last = mine[mine.length - 1]
    let state = 'idle'
    if (skipped.has(a.name)) state = 'skipped'
    else if (last?.type === 'agent_started' && !finished) state = 'working'
    else if (mine.length) state = 'done'
    else if (planned.has(a.name)) state = finished ? 'not needed' : 'waiting'
    else if (finished) state = 'not involved'
    out[a.name] = {
      state,
      outputs: mine.filter((e) => e.type === 'agent_output').length,
      rejections: mine.filter((e) => e.type === 'check_failed').length,
    }
  }
  return out
}

function useTicker(active) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!active) return undefined
    const t = setInterval(() => setNow(Date.now()), 200)
    return () => clearInterval(t)
  }, [active])
  return now
}

// `replay` ({ ms, speed }) plays a finished run back: the clock shows the recorded time, not the time since it started.
export default function AgentTimeline({ events, status, title = 'How Mothusi worked', compact = false, replay = null }) {
  const [agentFilter, setAgentFilter] = useState(null)
  const [keyOnly, setKeyOnly] = useState(false)
  const [follow, setFollow] = useState(true)
  const feedRef = useRef(null)

  const running = status === 'running' || status === 'connecting'
  const now = useTicker(running && events.length > 0)
  const started = events[0]
  const last = events[events.length - 1]
  const elapsed = replay ? replay.ms : running && started ? now - new Date(started.ts).getTime() : last?.elapsed_ms || 0

    const live = started?.data?.live
  const states = useMemo(() => agentStates(events), [events])
  const counts = useMemo(() => ({
    calls: events.filter((e) => e.type === 'agent_output' && e.duration_ms != null).length,
    rejections: events.filter((e) => e.type === 'check_failed').length,
    routes: events.filter((e) => e.type === 'decision').length,
    repairs: events.filter((e) => e.type === 'repair' || e.type === 'llm_retry').length,
  }), [events])

  const shown = events.filter((e) => (!agentFilter || e.agent === agentFilter) && (!keyOnly || KEY_TYPES.has(e.type)))

  useEffect(() => {
    const el = feedRef.current
    if (follow && el) el.scrollTop = el.scrollHeight
  }, [shown.length, follow])

  const onScroll = () => {
    const el = feedRef.current
    if (el) setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 40)
  }

  const statusLabel = {
    idle: 'Not started', connecting: 'Connecting', running: 'Live', done: 'Finished', failed: 'Stopped safely',
    disconnected: 'Connection lost',
  }[status]
  const label = replay ? `Replay ×${replay.speed}` : statusLabel

  return (
    <section className={`at card ${compact ? 'compact' : ''}`} aria-label={title}>
      <header className="at-head">
        <div>
          <h2>{title}</h2>
          <p className="muted small-text">
            {started ? (live ? 'Live AI agents' : 'Practice mode: rule-based, no AI. For rehearsing and as a fallback.') : 'Waiting for the orchestrator'}
          </p>
        </div>
        <div className="at-status">
          <span className={`at-live ${status}`}><span className="at-dot" aria-hidden="true" />{label}</span>
          <span className="at-clock" aria-label="Elapsed time">{seconds(elapsed)}</span>
        </div>
      </header>

      <dl className="at-stats">
        <div><dt>Events</dt><dd>{events.length}</dd></div>
        <div><dt>Agent outputs</dt><dd>{counts.calls}</dd></div>
        <div><dt>Rejections</dt><dd className={counts.rejections ? 'bad' : ''}>{counts.rejections}</dd></div>
        <div><dt>Routing decisions</dt><dd>{counts.routes}</dd></div>
        <div><dt>Repairs and retries</dt><dd>{counts.repairs}</dd></div>
      </dl>

      {!compact && events.some((e) => e.node) && <AgentGraph events={events} />}

      {!compact && (
        <ul className="at-roster" aria-label="Agents">
          {AGENTS.map((a) => {
            const s = states[a.name]
            return (
              <li key={a.name}>
                <button type="button" className={`at-agent ${s.state.replace(' ', '-')} ${agentFilter === a.name ? 'on' : ''}`}
                  data-agent={a.key} aria-pressed={agentFilter === a.name} title={a.role}
                  onClick={() => setAgentFilter(agentFilter === a.name ? null : a.name)}>
                  <span className="at-swatch" aria-hidden="true" />
                  <span className="at-agent-name">{a.name}</span>
                  <span className="at-agent-state">
                    {s.state}{s.rejections ? ` • ${s.rejections} rejected` : ''}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <div className="row tight at-tools">
        <label className="t-check">
          <input type="checkbox" checked={keyOnly} onChange={(e) => setKeyOnly(e.target.checked)} />
          Show only plans, decisions and checks
        </label>
        {agentFilter && <button type="button" className="btn ghost small" onClick={() => setAgentFilter(null)}>Show all agents</button>}
        {!follow && <button type="button" className="btn ghost small" onClick={() => setFollow(true)}>Jump to latest</button>}
      </div>

      <ol className="at-feed" ref={feedRef} onScroll={onScroll}>
        {shown.length === 0 && <li className="at-empty muted">{running ? 'Waiting for the first agent…' : 'No events to show.'}</li>}
        {shown.map((e) => <EventRow key={e.seq} e={e} />)}
        {running && <li className="at-typing muted" aria-hidden="true"><span /><span /><span /></li>}
      </ol>
      <p className="visually-hidden" aria-live="polite">{last ? `${last.agent}: ${last.title}` : ''}</p>
    </section>
  )
}

function EventRow({ e }) {
  const tone = TYPE_TONE[e.type] || ''
  const reasoning = e.data?.reasoning
  const data = e.data ? Object.fromEntries(Object.entries(e.data).filter(([k]) => !HIDDEN_DATA.has(k))) : null
  const detail = e.type === 'run_started' ? null : e.detail // the start event only names the models
  const hasData = data && Object.keys(data).length > 0
  return (
    <li className={`at-event ${tone}`} data-agent={AGENT_KEY[e.agent] || 'orch'}>
      <div className="at-meta">
        <time dateTime={e.ts}>{formatClock(e.ts)}</time>
        <span className="muted">+{seconds(e.elapsed_ms)}</span>
      </div>
      <div className="at-body">
        <div className="at-line">
          <span className="at-chip">{e.agent}</span>
          <span className={`at-type ${tone}`}>{TYPE_LABEL[e.type] || e.type}</span>
          <strong>{e.title}</strong>
          {e.duration_ms != null && <span className="at-dur">{seconds(e.duration_ms)}</span>}
        </div>
        {detail && <p className="at-detail">{detail}</p>}
        {(reasoning || hasData) && (
          <details className="at-more">
            <summary>{reasoning ? 'How the agent reasoned' : 'Details'}</summary>
            {reasoning && <p className="at-reasoning">{reasoning}</p>}
            {hasData && <pre>{JSON.stringify(data, null, 2)}</pre>}
          </details>
        )}
      </div>
    </li>
  )
}
