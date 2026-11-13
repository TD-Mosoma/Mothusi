import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTeacher } from './TeacherContext.jsx'
import { formatDateTime } from './format.js'
import { listRuns } from '../services/api.js'
import { useRunStream } from '../hooks/useRunStream.js'
import AgentTimeline from '../components/AgentTimeline.jsx'

const KIND = {
  plan: 'Lesson plan', replan: 'Re-plan', recheck: 'Re-check', feedback: 'Feedback', explain: 'Learner help',
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
  const [error, setError] = useState('')

  const anyRunning = runs.some((r) => r.status === 'running')
  useEffect(() => {
    let alive = true
    const load = () => listRuns().then((r) => { if (alive) { setRuns(r); setError('') } }).catch((e) => alive && setError(e.message))
    load()
    const t = setInterval(load, anyRunning ? 2000 : 10000)
    return () => { alive = false; clearInterval(t) }
  }, [anyRunning])

  const selectedId = runId || runs[0]?.id
  const selected = runs.find((r) => r.id === selectedId)
  const { events, status } = useRunStream(selectedId)
  const lesson = selected?.lesson_id && lessons.find((l) => l.id === selected.lesson_id)

  return (
    <div className="stack">
      <div className="t-page-head">
        <div>
          <h1>Agent Activity</h1>
          <p className="muted">
            Every time Mothusi works, each agent's plan, output, check and correction is recorded here with timestamps.
            Open a run to replay it, or watch one live.
          </p>
        </div>
        <Link to="/teacher/plan" className="btn">+ Create lesson</Link>
      </div>

      {error && <p className="t-error" role="alert">{error}</p>}

      <div className="t-activity">
        <section className="card stack t-run-list" aria-label="Agent runs">
          <h2>Runs</h2>
          {runs.length === 0 && !error && <p className="muted">No agent runs yet. Create a lesson plan to see the agents at work.</p>}
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
                  {selected.model && selected.model !== 'none' ? ` • ${selected.model}` : ''}
                </p>
                {selected.error && <p className="t-error">{selected.error}</p>}
              </div>
              <div className="row tight">
                {selected.parent_run_id && <Link className="btn secondary small" to={`/teacher/activity/${selected.parent_run_id}`}>Previous run</Link>}
                {lesson && <Link className="btn secondary small" to={`/teacher/lessons/${lesson.id}`}>Open lesson</Link>}
              </div>
            </section>
          )}
          {selectedId && <AgentTimeline events={events} status={status} title={status === 'running' ? 'Live agent activity' : 'Agent activity replay'} />}
        </div>
      </div>
    </div>
  )
}
