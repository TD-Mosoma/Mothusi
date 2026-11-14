import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTeacher } from './TeacherContext.jsx'
import { formatDateTime } from './format.js'
import { listRuns } from '../services/api.js'
import { useRunStream } from '../hooks/useRunStream.js'
import AgentTimeline from '../components/AgentTimeline.jsx'

const KIND = {
  plan: 'Lesson plan', replan: 'Re-plan', recheck: 'Re-check', feedback: 'Feedback', explain: 'Learner asked for help',
}
const STATUS_TONE = { completed: 'ok', completed_with_warnings: 'warn', failed: 'warn', running: '' }
const STATUS_LABEL = {
  completed: 'Completed', completed_with_warnings: 'Completed, needs attention', failed: 'Stopped safely', running: 'Running',
}

export default function AgentActivity() {
  const { runId } = useParams()
  const navigate = useNavigate()
  const { lessons } = useTeacher()
  const [runs, setRuns] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')

  const anyRunning = runs.some((r) => r.status === 'running')
  useEffect(() => {
    let alive = true
    const load = () => listRuns().then((r) => { if (alive) { setRuns(r); setLoaded(true); setError('') } }).catch((e) => alive && setError(e.message))
    load()
    const t = setInterval(load, anyRunning ? 2000 : 10000)
    return () => { alive = false; clearInterval(t) }
  }, [anyRunning])

  const selectedId = runId || runs[0]?.id
  const selected = runs.find((r) => r.id === selectedId)
  const { events, status } = useRunStream(selectedId)
  const lesson = selected?.lesson_id && lessons.find((l) => l.id === selected.lesson_id)

  // Replay: play a finished run back at its recorded pace, sped up to take about half a minute.
  const [replay, setReplay] = useState(null) // { from, speed }
  const [now, setNow] = useState(Date.now())
  useEffect(() => { setReplay(null) }, [selectedId])
  useEffect(() => {
    if (!replay) return undefined
    const t = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(t)
  }, [replay])
  const total = events[events.length - 1]?.elapsed_ms || 0
  const replayMs = replay ? Math.min(total, Math.max(0, now - replay.from) * replay.speed) : 0
  const replayDone = replay && replayMs >= total
  useEffect(() => { if (replayDone) { const t = setTimeout(() => setReplay(null), 600); return () => clearTimeout(t) } return undefined }, [replayDone])
  const finished = status === 'done' || status === 'failed'
  const startReplay = () => { const n = Date.now(); setNow(n); setReplay({ from: n, speed: Math.max(2, Math.ceil(total / 30000)) }) }
  const shownEvents = replay ? events.filter((e) => (e.elapsed_ms || 0) <= replayMs) : events

  return (
    <div className="stack">
      <div className="t-page-head">
        <div>
          <h1>How Mothusi worked</h1>
          <p className="muted">
            Every time Mothusi works, each agent's plan, output, check and correction is recorded here with timestamps.
            Open one to replay it, or watch one live.
          </p>
        </div>
        <Link to="/teacher/plan" className="btn">New lesson</Link>
      </div>

      {error && <p className="t-error" role="alert">{error}</p>}

      <div className="t-activity">
        <section className="card stack t-run-list" aria-label="Recent work">
          <h2>Recent work</h2>
          {loaded && runs.length === 0 && !error && <p className="muted">Nothing yet. Prepare a lesson to see the agents at work.</p>}
          <ul>
            {runs.map((r) => (
              <li key={r.id}>
                <button type="button" className={`t-run ${r.id === selectedId ? 'on' : ''}`}
                  aria-current={r.id === selectedId ? 'true' : undefined}
                  onClick={() => navigate(`/teacher/activity/${r.id}`)}>
                  <span className="row tight">
                    <span className="chip">{KIND[r.kind] || r.kind}</span>
                    <span className={`chip ${STATUS_TONE[r.status] || ''}`}>{STATUS_LABEL[r.status] || r.status}</span>
                  </span>
                  <strong>{r.title}</strong>
                  <span className="muted small-text">{formatDateTime(r.created_at)} • {r.event_count} events</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <div className="stack">
          {selected && (
            <section className="card t-run-summary">
              <div>
                <strong>{selected.title}</strong>
                <p className="muted small-text">
                  {KIND[selected.kind]} • started {formatDateTime(selected.created_at)}
                </p>
                {selected.error && <p className="t-error">{selected.error}</p>}
              </div>
              <div className="row tight">
                {selected.parent_run_id && <Link className="btn secondary small" to={`/teacher/activity/${selected.parent_run_id}`}>Earlier version</Link>}
                {finished && events.length > 0 && (
                  <button type="button" className="btn small" onClick={startReplay} disabled={!!replay}>
                    {replay ? 'Replaying…' : '▶ Replay'}
                  </button>
                )}
                {lesson && <Link className="btn secondary small" to={`/teacher/lessons/${lesson.id}`}>Open lesson</Link>}
              </div>
            </section>
          )}
          {selectedId && (
            <AgentTimeline
              events={shownEvents}
              status={replay && !replayDone ? 'running' : status}
              title={status === 'running' ? 'Working now' : 'Recorded run'}
              replay={replay ? { ms: replayMs, speed: replay.speed } : null}
            />
          )}
        </div>
      </div>
    </div>
  )
}
