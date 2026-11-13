import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useActiveClasses, useTeacher } from './TeacherContext.jsx'
import { getRoster } from '../services/api.js'
import { formatDate } from './format.js'
import { asksFor, explainSummary, feelingSummary, lessonInsight, mostMissed, useClassInsights } from './insights.js'

const SHARED = ['approved', 'feedback_due', 'completed']

export default function ClassInsights() {
  const active = useActiveClasses()
  const { lessons, learners } = useTeacher()
  const [classId, setClassId] = useState(active[0]?.id || '')
  const [roster, setRoster] = useState([])
  useEffect(() => { getRoster().then((r) => setRoster(r.learners), () => setRoster([])) }, [])
  const cls = active.find((c) => c.id === classId)
  const { data, loading, error } = useClassInsights(classId || null)

  const shared = lessons.filter((l) => l.classId === classId && SHARED.includes(l.status))
    .sort((a, b) => (b.approvedAt || b.date || '').localeCompare(a.approvedAt || a.date || ''))
  const nameFor = (key) => {
    if (key.startsWith('class:')) return roster.find((r) => r.account_id === key.slice(6))?.name || 'A learner (class code)'
    return learners.find((l) => l.id === key)?.name || 'A learner'
  }
  const people = Object.entries(data?.learners || {}).sort((a, b) => (b[1].last_seen || '').localeCompare(a[1].last_seen || ''))

  return (
    <div className="stack">
      <div className="t-page-head">
        <div>
          <h1>Class insights</h1>
          <p className="muted">What learners did with the lessons you shared: who opened them, what they found hard, and what helped.</p>
        </div>
      </div>

      {active.length === 0 ? (
        <p className="card muted">Add a class to see insights. <Link to="/teacher/classes">Add your class</Link>.</p>
      ) : (
        <>
          <div className="card t-form-grid">
            <label className="t-field">Class
              <select value={classId} onChange={(e) => setClassId(e.target.value)}>
                {active.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          </div>

          {error && <p className="t-error" role="alert">{error}</p>}
          {loading && <p className="muted">Loading…</p>}

          <section className="card stack">
            <h2>Lessons</h2>
            {shared.length === 0 && <p className="muted">No lessons shared with {cls?.name} yet. Approve a lesson to share it with learners.</p>}
            {shared.length > 0 && (
              <div className="t-table-wrap">
                <table className="t-table t-stack-sm">
                  <thead>
                    <tr><th>Lesson</th><th>Opened</th><th>Finished practice</th><th>Most missed</th><th>How it felt</th><th>Asked for</th></tr>
                  </thead>
                  <tbody>
                    {shared.map((l) => {
                      const i = lessonInsight(data, l)
                      const missed = mostMissed(i, l)
                      return (
                        <tr key={l.id}>
                          <td data-label="Lesson"><Link to={`/teacher/lessons/${l.id}`}>{l.topic}</Link><br /><span className="muted small-text">{formatDate(l.date)}</span></td>
                          <td data-label="Opened">{i ? `${i.opened} of ${l.constraints?.class_size ?? cls?.size ?? '?'}` : '…'}</td>
                          <td data-label="Finished practice">{i ? i.practised : '…'}</td>
                          <td data-label="Most missed">{missed ? `"${missed.prompt}" (${missed.missed})` : <span className="muted">None yet</span>}</td>
                          <td data-label="How it felt">{feelingSummary(i?.feelings) || <span className="muted">None yet</span>}</td>
                          <td data-label="Asked for">{explainSummary(i?.explain_styles) || <span className="muted">None yet</span>}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card stack">
            <h2>Learners</h2>
            {people.length === 0 && <p className="muted">No learner activity yet. Learners appear here once they open a lesson.</p>}
            {people.length > 0 && (
              <div className="t-table-wrap">
                <table className="t-table t-stack-sm">
                  <thead>
                    <tr><th>Learner</th><th>Lessons opened</th><th>Practice finished</th><th>Right first time</th><th>Asked for</th><th>Last active</th></tr>
                  </thead>
                  <tbody>
                    {people.map(([key, p]) => (
                      <tr key={key}>
                        <td data-label="Learner">{nameFor(key)}</td>
                        <td data-label="Lessons opened">{p.opened}</td>
                        <td data-label="Practice finished">{p.practice_done}</td>
                        <td data-label="Right first time">{p.first_try + p.missed ? `${p.first_try} of ${p.first_try + p.missed}` : <span className="muted">No answers yet</span>}</td>
                        <td data-label="Asked for">{asksFor(p.explain_styles) || <span className="muted">Nothing</span>}</td>
                        <td data-label="Last active">{p.last_seen ? formatDate(p.last_seen) : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <p className="t-note">
            These are learning aids, not labels. The Progress Tracker shares a short, factual summary of each profiled learner's
            practice with the agents the next time you plan for them.
          </p>
        </>
      )}
    </div>
  )
}
