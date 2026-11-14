import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useActiveClasses, useTeacher } from './TeacherContext.jsx'
import { getRoster } from '../services/api.js'
import { formatDate, STATUS } from './format.js'
import { asksFor, feelingSummary, lessonInsight, mostMissed, plural, useClassInsights } from './insights.js'

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

const SHARED = ['approved', 'feedback_due', 'completed']

export default function TeacherDashboard() {
  const { profile, classes, learners, lessons, addSampleClass, removeClass, notify, prefs, updatePrefs } = useTeacher()
  const active = useActiveClasses()
  const [roster, setRoster] = useState(null)
  useEffect(() => { getRoster().then(setRoster, () => setRoster({ codes: [], learners: [] })) }, [classes.length])
  const codes = roster?.codes

  const first = profile.fullName.trim().split(' ')[0]
  const sample = classes.find((c) => c.sample)
  const own = classes.filter((c) => !c.sample)
  const ownIds = new Set(own.map((c) => c.id))
  const preparing = lessons.filter((l) => l.status === 'preparing')
  const ready = lessons.filter((l) => l.status === 'awaiting_review' || l.status === 'returned')
  const feedbackDue = lessons.filter((l) => l.status === 'feedback_due' || (l.status === 'approved' && l.date && l.date < new Date().toISOString().slice(0, 10)))
  const failed = lessons.filter((l) => l.status === 'failed')

  const steps = [
    { done: own.length > 0, text: 'Add your class', hint: 'Its grade, subjects and number of learners.', to: '/teacher/classes' },
    { done: learners.some((l) => ownIds.has(l.classId)), text: 'Add learners who need support', hint: 'Strengths and what helps. No diagnoses.', to: '/teacher/profiles' },
    { done: !!codes?.some((c) => ownIds.has(c.class_id)), text: 'Create your class code', hint: 'Learners sign in with it, or with pictures.', to: '/teacher/profiles' },
    { done: lessons.some((l) => ownIds.has(l.classId) && l.status !== 'failed'), text: 'Prepare your first lesson', hint: 'Choose a CAPS topic; Mothusi does the rest.', to: '/teacher/plan' },
    { done: lessons.some((l) => ownIds.has(l.classId) && SHARED.includes(l.status)), text: 'Approve it and share it with learners', hint: 'Nothing reaches learners until you approve it.', to: '/teacher/lessons' },
  ]
  const doneCount = steps.filter((s) => s.done).length
  const showChecklist = doneCount < steps.length && !prefs.checklistDismissed

  const trySample = () => {
    addSampleClass()
    notify('Sample class added. It is marked Sample and uses made-up learners.')
  }
  const removeSample = () => {
    if (window.confirm(`Remove ${sample.name}, its made-up learners and its lessons?`)) removeClass(sample.id)
  }

  const todo = [
    ...preparing.map((l) => ({ key: `p-${l.id}`, to: `/teacher/lessons/${l.id}`, text: l.topic, status: 'preparing' })),
    ...ready.map((l) => ({ key: `r-${l.id}`, to: `/teacher/lessons/${l.id}`, text: `Review ${l.topic}`, status: l.status })),
    ...failed.map((l) => ({ key: `x-${l.id}`, to: `/teacher/lessons/${l.id}`, text: l.topic, status: 'failed' })),
    ...feedbackDue.map((l) => ({ key: `f-${l.id}`, to: `/teacher/lessons/${l.id}/feedback`, text: `Give feedback on ${l.topic}`, status: 'feedback_due' })),
  ]

  return (
    <div className="stack">
      <div className="t-page-head">
        <div>
          <h1>{greeting()}, {first}</h1>
          <p className="muted">{active.length ? 'What needs you today.' : 'Welcome to Mothusi. Let us get your class ready.'}</p>
        </div>
        {active.length > 0 && <Link to="/teacher/plan" className="btn">New lesson</Link>}
      </div>

      {active.length > 0 && (
        <section className="t-stats" aria-label="Overview">
          <Link to="/teacher/classes" className="t-stat">
            <span className="t-stat-label">Classes</span>
            <strong>{plural(active.length, 'active class', 'active classes')}</strong>
            <span className="t-stat-sub">{active.reduce((n, c) => n + Number(c.size || 0), 0)} learners in total</span>
          </Link>
          <Link to="/teacher/profiles" className="t-stat">
            <span className="t-stat-label">Learners &amp; codes</span>
            <strong>{plural(learners.filter((l) => active.some((c) => c.id === l.classId)).length, 'support profile')}</strong>
            <span className="t-stat-sub">{roster ? `${plural(roster.learners.length, 'learner')} signed in to Mothusi` : '…'}</span>
          </Link>
          <Link to="/teacher/lessons" className="t-stat">
            <span className="t-stat-label">Lesson plans</span>
            <strong>{plural(lessons.length, 'lesson plan')}</strong>
            <span className="t-stat-sub">{ready.length} ready for review • {lessons.filter((l) => SHARED.includes(l.status)).length} shared</span>
          </Link>
          <Link to="/teacher/lessons" className="t-stat">
            <span className="t-stat-label">After teaching</span>
            <strong>{plural(feedbackDue.length, 'feedback note')} due</strong>
            <span className="t-stat-sub">{plural(lessons.filter((l) => l.status === 'completed').length, 'lesson')} with feedback</span>
          </Link>
        </section>
      )}

      {active.length === 0 && (
        <section className="card stack t-welcome">
          <h2>Start with your class</h2>
          <p>Mothusi plans each lesson around one class: its grade, the learners who need support, and the time and resources you really have.</p>
          <div className="row">
            <Link to="/teacher/classes" className="btn">Add your class</Link>
            {!sample && <button type="button" className="btn secondary" onClick={trySample}>Try with a sample class</button>}
          </div>
          <p className="muted small-text">The sample class uses made-up learners so you can see how Mothusi works before you add real ones.</p>
        </section>
      )}

      {sample && !sample.archived && (
        <p className="t-note t-sample-note">
          <span className="chip sample">Sample</span> You are trying Mothusi with <strong>{sample.name}</strong>. Its learners are made up.
          {' '}<button type="button" className="btn ghost small" onClick={removeSample}>Remove the sample class</button>
        </p>
      )}

      {showChecklist && (
        <section className="card stack t-checklist" aria-labelledby="ready-title">
          <div className="t-list-row">
            <h2 id="ready-title">Get your class ready</h2>
            <span className="muted small-text">{doneCount} of {steps.length} done</span>
          </div>
          <div className="t-progress" aria-hidden="true"><span style={{ width: `${(doneCount / steps.length) * 100}%` }} /></div>
          <ol className="t-steps">
            {steps.map((s) => (
              <li key={s.text} className={s.done ? 'done' : ''}>
                <span className="t-step-icon" aria-hidden="true">{s.done ? '✓' : ''}</span>
                <span>
                  {s.done ? <strong>{s.text}</strong> : <Link to={s.to}><strong>{s.text}</strong></Link>}
                  <span className="muted small-text"> {s.hint}</span>
                </span>
                <span className="visually-hidden">{s.done ? 'done' : 'to do'}</span>
              </li>
            ))}
          </ol>
          {active.length === 0 && !sample && (
            <p className="muted small-text">Not ready to add your class? <button type="button" className="t-link-btn" onClick={trySample}>Try with a sample class</button>.</p>
          )}
          <div><button type="button" className="btn ghost small" onClick={() => updatePrefs({ checklistDismissed: true })}>Hide this list</button></div>
        </section>
      )}

      {active.length > 0 && (
        <div className="t-columns t-even">
          <section className="card stack">
            <h2>Needs you</h2>
            {todo.length === 0 && <p className="muted">You are up to date. <Link to="/teacher/plan">Prepare your next lesson</Link>.</p>}
            <ul className="t-list">
              {todo.map((p) => {
                const s = STATUS[p.status] || STATUS.draft
                return (
                  <li key={p.key} className="t-list-row">
                    <Link to={p.to}>{p.text}</Link>
                    <span className={`chip ${s.tone}`}>{p.status === 'feedback_due' ? 'Feedback' : s.label}</span>
                  </li>
                )
              })}
            </ul>
          </section>

          <section className="card stack">
            <h2>My classes</h2>
            <ul className="t-list">
              {active.map((c) => (
                <li key={c.id} className="t-list-row">
                  <span><strong>{c.name}</strong> <span className="muted small-text">• {learners.filter((l) => l.classId === c.id).length} with support profiles</span></span>
                  <Link to="/teacher/plan" state={{ classId: c.id }} className="btn ghost small">Plan</Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}

      {active.map((c) => (
        <ClassSummary key={c.id} cls={c} lessons={lessons.filter((l) => l.classId === c.id && SHARED.includes(l.status))}
          learners={learners} roster={roster} />
      ))}

    </div>
  )
}

// A class at a glance: its most recent shared lessons, what learners did with them, and who to check on.
function ClassSummary({ cls, lessons, learners, roster }) {
  const recent = [...lessons].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 3)
  const { data, loading } = useClassInsights(recent.length ? cls.id : null)
  const nameFor = (key) => (key.startsWith('class:')
    ? roster?.learners.find((r) => r.account_id === key.slice(6))?.name || 'A learner'
    : learners.find((l) => l.id === key)?.name || 'A learner')
  const checkOn = Object.entries(data?.learners || {}).map(([key, p]) => {
    const reasons = []
    if (p.feelings?.Difficult) reasons.push('found it difficult')
    if (p.missed > p.first_try) reasons.push(`missed ${p.missed} of ${p.missed + p.first_try} at first try`)
    const asked = asksFor(p.explain_styles)
    if (asked) reasons.push(`asked for ${asked}`)
    return { key, name: nameFor(key), reasons }
  }).filter((l) => l.reasons.length).slice(0, 4)

  return (
    <section className="card stack t-class-summary">
      <div className="t-list-row">
        <h2>{cls.name}</h2>
        <span className="row tight">
          <Link to="/teacher/insights" className="btn ghost small">Class insights</Link>
          <Link to="/teacher/plan" state={{ classId: cls.id }} className="btn secondary small">Plan a lesson</Link>
        </span>
      </div>
      {recent.length === 0 ? (
        <p className="muted">No lessons shared with {cls.name} yet. Approve a lesson to share it with learners.</p>
      ) : (
        <div className="t-summary-grid">
          <div className="stack">
            <h3>Recent lessons</h3>
            <ul className="t-list">
              {recent.map((l) => {
                const i = lessonInsight(data, l)
                const missed = mostMissed(i, l)
                const felt = feelingSummary(i?.feelings)
                const size = l.constraints?.class_size ?? cls.size
                return (
                  <li key={l.id} className="t-recent">
                    <div className="t-list-row">
                      <Link to={`/teacher/lessons/${l.id}`}><strong>{l.topic}</strong></Link>
                      <span className="muted small-text">{formatDate(l.date)}</span>
                    </div>
                    {loading || !i ? <span className="muted small-text">Loading…</span> : i.opened === 0 ? (
                      <span className="muted small-text">Shared. Nobody has opened it yet.</span>
                    ) : (
                      <span className="small-text">
                        <b>{i.opened} of {size}</b> opened • {i.practised} finished the practice
                        {missed ? <> • most missed: “{missed.prompt}”</> : null}
                        {felt ? <> • felt: {felt}</> : null}
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
          <div className="stack">
            <h3>Learners to check on</h3>
            {loading ? <p className="muted small-text">Loading…</p> : checkOn.length === 0 ? (
              <p className="muted small-text">Nobody needs a check-in from the lessons so far.</p>
            ) : (
              <ul className="t-list">
                {checkOn.map((l) => (
                  <li key={l.key}><strong>{l.name}</strong> <span className="muted small-text">{l.reasons.join(' • ')}</span></li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
