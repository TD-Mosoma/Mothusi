import { useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useTeacher } from './TeacherContext.jsx'
import { formatDate, formatDateTime, STATUS } from './format.js'
import { languageLabel } from './curriculum.js'
import {
  approveRun, constraintsFromForm, formFromConstraints, lessonFieldsFromRun, startRecheck, startReplan,
} from '../services/api.js'
import InlineRun from '../components/InlineRun.jsx'
import ConstraintFields from './ConstraintFields.jsx'
import LearnerMaterialView from './LearnerMaterialView.jsx'

const stamp = () => new Date().toISOString()

export default function LessonReview() {
  const { id } = useParams()
  const { lessons, updateLesson } = useTeacher()
  const lesson = lessons.find((l) => l.id === id)
  const rework = useLocation().state?.rework || ''

  const [mode, setMode] = useState(rework ? 'return' : null) // null | 'return' | 'conditions'
  const [reason, setReason] = useState(rework)
  const [conditions, setConditions] = useState(() => (lesson?.constraints ? formFromConstraints(lesson.constraints) : null))
  const [active, setActive] = useState(null) // { runId, kind, title }
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (!lesson) {
    return (
      <div className="stack">
        <h1>Lesson not found</h1>
        <p><Link to="/teacher/lessons">Back to lesson plans</Link></p>
      </div>
    )
  }

  const s = STATUS[lesson.status] || STATUS.draft
  const adaptations = lesson.adaptations.filter((a) => !a.removed)
  const canDecide = ['awaiting_review', 'returned', 'draft'].includes(lesson.status) && !active
  const canGiveFeedback = ['approved', 'feedback_due'].includes(lesson.status)
  const learnerGroups = [
    ...lesson.learnersPack.map((l) => ({ ...l, items: adaptations.filter((a) => a.learnerId === l.id) })),
    { id: 'whole_class', name: 'Whole class', language: 'en', items: adaptations.filter((a) => a.learnerId === 'whole_class'),
      material: lesson.wholeClass?.material },
  ]
  const failedChecks = (lesson.checks || []).filter((c) => !c.passed)

  // ---------- actions ----------
  const approve = async () => {
    setBusy(true); setError('')
    try {
      await approveRun(lesson.runId)
      updateLesson(lesson.id, (l) => ({
        status: 'approved', note: '',
        history: [...l.history, { at: stamp(), by: 'Teacher', note: `Approved version ${l.version} and shared it with learners` }],
      }))
    } catch (e) {
      setError(`Could not approve: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  const begin = async (kind, starter, title) => {
    setError(''); setBusy(true)
    try {
      const runId = await starter()
      setActive({ runId, kind, title })
      setMode(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const sendBack = () => {
    if (reason.trim().length < 3) return setError('Tell Mothusi what should change.')
    begin('return', () => startReplan(lesson.runId, { teacherNote: reason.trim(), lessonId: lesson.id }), 'Mothusi is reworking the plan')
  }

  const changeConditions = () => {
    begin('conditions', () => startReplan(lesson.runId, { constraints: constraintsFromForm(conditions), lessonId: lesson.id }),
      'Mothusi is re-planning for the new conditions')
  }

  const recheck = () =>
    begin('recheck', () => startRecheck(lesson.runId, adaptations), 'The Reviewer is checking your edits')

  const finishRun = (run) => {
    const kind = active.kind
    if (kind === 'recheck') {
      const r = run.result
      updateLesson(lesson.id, (l) => ({
        needsRecheck: false,
        checks: r.checks,
        recheckIssues: r.issues,
        history: [...l.history, {
          at: stamp(), by: 'Mothusi', runId: run.id,
          note: r.passed ? `Re-checked version ${l.version}: every check passed` : `Re-checked version ${l.version}: ${r.issues.length} concern(s) flagged for you`,
        }],
      }))
    } else {
      const reasonText = reason.trim()
      updateLesson(lesson.id, (l) => ({
        ...lessonFieldsFromRun(run),
        version: l.version + 1,
        recheckIssues: [],
        note: kind === 'return' ? reasonText : l.note,
        runs: [...(l.runs || []), { runId: run.id, kind: 'replan', at: run.created_at, version: l.version + 1 }],
        history: [...l.history,
          ...(kind === 'return' ? [{ at: stamp(), by: 'Teacher', note: 'Returned for changes', reason: reasonText }] : []),
          { at: stamp(), by: 'Mothusi', runId: run.id,
            note: `Version ${l.version + 1}: ${run.result.changes.length} recommendation(s) changed${kind === 'conditions' ? ' for new classroom conditions' : ''}` }],
      }))
      setReason('')
    }
    setActive(null)
  }

  return (
    <div className="stack">
      <div className="t-page-head">
        <div>
          <h1>{canDecide ? 'Review your lesson plan' : 'Lesson plan'}</h1>
          <p className="muted">{lesson.title} • {formatDate(lesson.date)} • Version {lesson.version}</p>
        </div>
        <div className="row tight">
          <span className={`chip ${s.tone}`}>{s.label}</span>
          <Link to={`/teacher/activity/${lesson.runId}`} className="btn secondary small">See how the agents built this</Link>
        </div>
      </div>

      {lesson.model && !lesson.model.includes('(live)') && (
        <p className="t-note">Prepared with the offline demo model. Content is rule-based; run it again with the live model before teaching.</p>
      )}

      <section className="card stack">
        <h2>{lesson.grade} {lesson.subject} • {lesson.topic}</h2>
        <p><strong>Objective:</strong> {lesson.objectiveSummary || lesson.objectives}</p>
        {lesson.successCriteria?.length > 0 && (
          <div>
            <strong>Success criteria</strong>
            <ul>{lesson.successCriteria.map((c) => <li key={c}>{c}</li>)}</ul>
          </div>
        )}
        {lesson.vocabulary?.length > 0 && (
          <p><strong>Key words:</strong> {lesson.vocabulary.join(', ')}</p>
        )}
        {lesson.note && <p className="t-note">Your note to Mothusi: {lesson.note}</p>}
        {lesson.needsRecheck && <p className="t-note">You edited this plan. Ask the Reviewer to re-check it before you approve.</p>}
      </section>

      {(lesson.warnings?.length > 0 || lesson.recheckIssues?.length > 0) && (
        <section className="card stack t-attention">
          <h2>Needs your attention</h2>
          <ul>
            {lesson.warnings.map((w) => <li key={w}>{w}</li>)}
            {(lesson.recheckIssues || []).map((i) => <li key={i.message}>{i.message}</li>)}
          </ul>
          <p className="muted small-text">Mothusi shows what it could not resolve instead of hiding it. You decide.</p>
        </section>
      )}

      {lesson.changes?.length > 0 && (
        <section className="card stack">
          <h2>What changed in version {lesson.version}</h2>
          <ul className="t-list">
            {lesson.changes.map((c) => (
              <li key={c.adaptation_id}>
                <span className="chip">{c.learner}</span>
                {c.before && <p className="t-before">Before: {c.before.strategy}. {c.before.instruction}</p>}
                <p className="t-after">Now: <strong>{c.after.strategy}.</strong> {c.after.instruction}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="t-columns">
        <section className="card stack">
          <h2>Lesson flow</h2>
          <ul className="t-list">
            {lesson.flow.map((f) => (
              <li key={f.label}>
                <div className="t-list-row"><strong>{f.label}</strong><span className="muted">{f.min} min</span></div>
                {f.activity && <span className="muted small-text">{f.activity}</span>}
              </li>
            ))}
          </ul>
        </section>

        <section className="card stack">
          <h2>Checks</h2>
          <ul className="t-checks">
            {(lesson.checks || []).map((c) => (
              <li key={c.check} className={c.passed ? '' : 'failed'}>{c.label}{c.detail ? ` (${c.detail})` : ''}</li>
            ))}
          </ul>
          {lesson.stats && (
            <p className="muted small-text">
              {lesson.stats.corrections} correction round(s), {lesson.stats.rejections} rejection(s) handled by the agents
              {failedChecks.length ? `, ${failedChecks.length} check(s) still failing` : ''}.
            </p>
          )}
        </section>
      </div>

      {lesson.demands?.length > 0 && (
        <section className="card stack">
          <h2>What this lesson demands of learners</h2>
          <ul className="t-demands">
            {lesson.demands.map((d, i) => (
              <li key={i}><span className={`chip ${d.load === 'high' ? 'warn' : ''}`}>{d.kind.replace(/_/g, ' ')} • {d.load}</span> {d.description}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="card stack">
        <h2>Support for learners</h2>
        {adaptations.length === 0 && <p className="muted">All recommendations were removed.</p>}
        {learnerGroups.filter((g) => g.items.length || g.material).map((g) => (
          <article key={g.id} className="t-learner-block">
            <header className="row tight">
              <h3>{g.name}</h3>
              {g.language && g.language !== 'en' && <span className="chip">Learns in {languageLabel(g.language)}</span>}
            </header>
            {g.needs?.length > 0 && (
              <p className="muted small-text">Why: {g.needs.map((n) => `${n.barrier}; build on ${n.leverage}`).join(' • ')}</p>
            )}
            <ul className="t-list">
              {g.items.map((a) => (
                <li key={a.id} className="t-rec">
                  <div className="row tight">
                    <strong>{a.strategy}</strong>
                    <span className="chip">{a.teacherMinutes} min of your time</span>
                    {a.prepMinutes > 0 && <span className="chip">{a.prepMinutes} min prep</span>}
                    {a.phase && <span className="chip">{a.phase}</span>}
                    {a.revision > 1 && <span className="chip warn">Corrected by Mothusi</span>}
                    {a.edited && <span className="chip">Edited by you</span>}
                  </div>
                  <p>{a.text}</p>
                  {a.materials.length > 0 && <span className="muted small-text">Materials: {a.materials.join(', ')}</span>}
                </li>
              ))}
            </ul>
            {g.material && <LearnerMaterialView material={g.material} translation={g.translation} />}
          </article>
        ))}
      </section>

      {lesson.memoryApplied?.length > 0 && (
        <section className="card stack">
          <h2>What Mothusi remembered from earlier lessons</h2>
          <ul className="t-list">
            {lesson.memoryApplied.slice(0, 6).map((m, i) => (
              <li key={i}>
                <span className={`chip ${m.outcome === 'Worked' ? 'ok' : m.outcome === 'Did not work' ? 'warn' : ''}`}>{m.outcome}</span>{' '}
                {m.learner_label || m.learner_id}: {m.strategy || m.instruction} <span className="muted small-text">({m.topic})</span>
              </li>
            ))}
          </ul>
          <p className="muted small-text">Mothusi does not retrain its model. It brings your feedback into the next plan.</p>
        </section>
      )}

      {active && (
        <InlineRun runId={active.runId} title={active.title} onDone={finishRun}
          onFail={(msg) => { setError(msg); setActive(null) }} />
      )}

      {canDecide && (
        <section className="card stack">
          <h2>Your decision</h2>
          <p className="muted">Approving shares this version with your learners and records the version and date.</p>

          {mode === null && (
            <div className="row">
              {lesson.needsRecheck
                ? <button type="button" className="btn" onClick={recheck} disabled={busy}>Re-check my edits</button>
                : <button type="button" className="btn" onClick={approve} disabled={busy}>Approve{lesson.recheckIssues?.length ? ' anyway' : ''}</button>}
              <Link to={`/teacher/lessons/${lesson.id}/edit`} className="btn secondary">Edit</Link>
              <button type="button" className="btn secondary" onClick={() => setMode('return')}>Return to Mothusi</button>
              <button type="button" className="btn secondary" onClick={() => { setConditions(formFromConstraints(lesson.constraints)); setMode('conditions') }}>
                Classroom conditions changed
              </button>
            </div>
          )}

          {mode === 'return' && (
            <div className="stack">
              <label className="t-field">What should Mothusi change?
                <textarea rows="3" value={reason} onChange={(e) => setReason(e.target.value)}
                  placeholder="For example: Learner B needs one instruction at a time, not three." />
              </label>
              <div className="row">
                <button type="button" className="btn" onClick={sendBack} disabled={busy}>Send back to the agents</button>
                <button type="button" className="btn secondary" onClick={() => { setMode(null); setError('') }}>Cancel</button>
              </div>
            </div>
          )}

          {mode === 'conditions' && conditions && (
            <div className="stack">
              <ConstraintFields form={conditions} set={(k, v) => setConditions((c) => ({ ...c, [k]: v }))} legend="Tomorrow's conditions" />
              <p className="t-hint">Mothusi re-checks every recommendation and redesigns only what no longer fits.</p>
              <div className="row">
                <button type="button" className="btn" onClick={changeConditions} disabled={busy}>Re-plan for these conditions</button>
                <button type="button" className="btn secondary" onClick={() => setMode(null)}>Cancel</button>
              </div>
            </div>
          )}
          {error && <p className="t-error" role="alert">{error}</p>}
        </section>
      )}

      {!canDecide && error && <p className="t-error" role="alert">{error}</p>}

      {canGiveFeedback && (
        <section className="card stack">
          <h2>After you teach</h2>
          <p className="muted">Tell Mothusi what worked. The Progress Tracker brings it into your next plan.</p>
          <div className="row">
            <Link to={`/teacher/lessons/${lesson.id}/feedback`} className="btn">Submit feedback</Link>
          </div>
        </section>
      )}

      {lesson.status === 'completed' && lesson.feedback && (
        <section className="card stack">
          <h2>Feedback you submitted</h2>
          <p><strong>Overall:</strong> {lesson.feedback.overall}</p>
          {lesson.feedback.happened && <p><strong>What happened:</strong> {lesson.feedback.happened}</p>}
          {lesson.feedback.change && <p><strong>What to change next time:</strong> {lesson.feedback.change}</p>}
        </section>
      )}

      <section className="card stack">
        <h2>Review record</h2>
        <ul className="t-history">
          {[...lesson.history].reverse().map((h, i) => (
            <li key={i}>
              <strong>{h.note}</strong>
              <span className="muted small-text">
                {h.by} • {formatDateTime(h.at)}
                {h.runId && <> • <Link to={`/teacher/activity/${h.runId}`}>agent activity</Link></>}
              </span>
              {h.reason && <span className="small-text">Reason: {h.reason}</span>}
            </li>
          ))}
        </ul>
      </section>

      <p><Link to="/teacher/lessons">Back to all lesson plans</Link></p>
    </div>
  )
}
