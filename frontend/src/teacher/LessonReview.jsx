import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useTeacher } from './TeacherContext.jsx'
import { formatDate, formatDateTime, planAgainFrom, STATUS } from './format.js'
import { languageLabel } from './curriculum.js'
import {
  approveRun, constraintsFromForm, formFromConstraints, lessonFieldsFromRun, startRecheck, startReplan,
} from '../services/api.js'
import { useRunStream } from '../hooks/useRunStream.js'
import InlineRun from '../components/InlineRun.jsx'
import LiveRun from '../components/LiveRun.jsx'
import ConstraintFields from './ConstraintFields.jsx'
import LearnerMaterialView from './LearnerMaterialView.jsx'
import { explainSummary, feelingSummary, lessonInsight, mostMissed, plural, useClassInsights } from './insights.js'

const stamp = () => new Date().toISOString()

export default function LessonReview() {
  const { id } = useParams()
  const { lessons } = useTeacher()
  const lesson = lessons.find((l) => l.id === id)

  if (!lesson) {
    return (
      <div className="stack">
        <h1>Lesson not found</h1>
        <p><Link to="/teacher/lessons">Back to lesson plans</Link></p>
      </div>
    )
  }
  if (lesson.status === 'preparing') return <Preparing lesson={lesson} />
  if (lesson.status === 'failed') return <NotFinished lesson={lesson} />
  return <Review key={lesson.id} lesson={lesson} />
}

function Heading({ lesson, children }) {
  const s = STATUS[lesson.status] || STATUS.draft
  return (
    <div className="t-page-head">
      <div>
        <h1>{lesson.topic}</h1>
        <p className="muted">
          {lesson.grade} {lesson.subject} • {formatDate(lesson.date)}{lesson.version ? ` • Version ${lesson.version}` : ''}
        </p>
      </div>
      <div className="row tight">
        {lesson.sample && <span className="chip sample">Sample</span>}
        <span className={`chip ${s.tone}`}>{s.label}</span>
        {children}
      </div>
    </div>
  )
}

function Preparing({ lesson }) {
  const { prefs } = useTeacher()
  const { events, status } = useRunStream(lesson.runId)
  return (
    <div className="stack">
      <Heading lesson={lesson} />
      <p className="t-note">Mothusi is preparing this lesson. You can leave this page; it will be marked <strong>Ready for review</strong> when it is done.</p>
      <LiveRun events={events} status={status} showDetail={!!prefs.agentDetail} />
    </div>
  )
}

function NotFinished({ lesson }) {
  const { removeLesson } = useTeacher()
  const navigate = useNavigate()
  return (
    <div className="stack">
      <Heading lesson={lesson} />
      <section className="card stack">
        <h2>This lesson was not finished</h2>
        <p className="t-error" role="alert">{lesson.error || 'Mothusi stopped before the lesson was ready.'}</p>
        <p className="muted">Nothing half-finished was saved. You can try again with the same details.</p>
        <div className="row">
          <button type="button" className="btn" onClick={() => { removeLesson(lesson.id); navigate('/teacher/plan', { state: { from: planAgainFrom(lesson) } }) }}>Try again</button>
          <button type="button" className="btn secondary" onClick={() => { removeLesson(lesson.id); navigate('/teacher/lessons') }}>Remove this lesson</button>
          {lesson.runId && <Link className="btn ghost" to={`/teacher/activity/${lesson.runId}`}>See what happened</Link>}
        </div>
      </section>
    </div>
  )
}

function Review({ lesson }) {
  const { updateLesson, classes, prefs } = useTeacher()
  const navigate = useNavigate()
  const rework = useLocation().state?.rework || ''
  const [mode, setMode] = useState(rework ? 'return' : null) // null | 'return' | 'conditions'
  const [reason, setReason] = useState(rework)
  const [conditions, setConditions] = useState(() => (lesson.constraints ? formFromConstraints(lesson.constraints) : null))
  const [active, setActive] = useState(null) // { runId, kind, title }
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const cls = classes.find((c) => c.id === lesson.classId)
  const adaptations = (lesson.adaptations || []).filter((a) => !a.removed)
  const canDecide = ['awaiting_review', 'returned', 'draft'].includes(lesson.status) && !active
  const shared = ['approved', 'feedback_due', 'completed'].includes(lesson.status)
  const canGiveFeedback = ['approved', 'feedback_due'].includes(lesson.status)
  const learnerGroups = [
    ...(lesson.learnersPack || []).map((l) => ({ ...l, items: adaptations.filter((a) => a.learnerId === l.id) })),
    { id: 'whole_class', name: 'Whole class', language: 'en', items: adaptations.filter((a) => a.learnerId === 'whole_class'),
      material: lesson.wholeClass?.material },
  ]
  const checks = lesson.checks || []
  const failedChecks = checks.filter((c) => !c.passed)
  const attention = [...(lesson.warnings || []), ...(lesson.recheckIssues || []).map((i) => i.message)]
  const yourMinutes = adaptations.reduce((n, a) => n + (Number(a.teacherMinutes) || 0), 0)
  const prepMinutes = adaptations.reduce((n, a) => n + (Number(a.prepMinutes) || 0), 0)
  const supported = new Set(adaptations.map((a) => a.learnerId).filter((x) => x !== 'whole_class')).size
  const languages = [...new Set((lesson.learnersPack || []).map((l) => l.language).filter((l) => l && l !== 'en'))]

  // ---------- actions ----------
  const approve = async () => {
    setBusy(true); setError('')
    try {
      await approveRun(lesson.runId)
      updateLesson(lesson.id, (l) => ({
        status: 'approved', note: '', approvedAt: stamp(),
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

  const recheck = () => begin('recheck', () => startRecheck(lesson.runId, adaptations), 'The Reviewer is checking your edits')

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
    <div className={`stack ${canDecide ? 't-has-decision-bar' : ''}`}>
      <Heading lesson={lesson}>
        <Link to={`/teacher/lessons/${lesson.id}/teach`} className="btn secondary small">Lesson card</Link>
      </Heading>

      {lesson.offline && (
        <p className="t-note">Prepared in practice mode (rule-based, no AI). Prepare it again with the live service before you teach it.</p>
      )}

      {/* ---------- At a glance ---------- */}
      <section className="card stack t-summary">
        <p className="t-summary-objective"><strong>Learners will:</strong> {lesson.objectiveSummary || lesson.objectives}</p>
        <dl className="t-glance">
          <div><dt>Learners supported</dt><dd>{supported}{cls ? <span className="muted"> of {lesson.constraints?.class_size ?? cls.size}</span> : null}</dd></div>
          <div><dt>Your one-to-one time</dt><dd>{yourMinutes} min{lesson.constraints ? <span className="muted"> of {lesson.constraints.support_minutes}</span> : null}</dd></div>
          <div><dt>Preparation</dt><dd>{prepMinutes} min{lesson.constraints?.prep_minutes != null ? <span className="muted"> of {lesson.constraints.prep_minutes}</span> : null}</dd></div>
          <div><dt>Checks passed</dt><dd className={failedChecks.length ? 'warn' : 'ok'}>{checks.length - failedChecks.length}<span className="muted"> of {checks.length}</span></dd></div>
        </dl>
        {lesson.vocabulary?.length > 0 && <p className="small-text"><strong>Key words:</strong> {lesson.vocabulary.join(', ')}</p>}
        <div className="row tight">
          {languages.map((l) => <span key={l} className="chip">Material in {languageLabel(l)}</span>)}
          {lesson.memoryApplied?.length > 0 && <span className="chip ok">Used {plural(lesson.memoryApplied.length, 'note')} from earlier lessons</span>}
          {lesson.attachedResource && <span className="chip">Planned from: {lesson.attachedResource}</span>}
        </div>
        {lesson.note && <p className="t-note">Your note to Mothusi: {lesson.note}</p>}
        {lesson.needsRecheck && <p className="t-note">You edited this plan. Ask the Reviewer to re-check it before you approve.</p>}
      </section>

      {attention.length > 0 && (
        <section className="card stack t-attention">
          <h2>Needs your attention</h2>
          <ul>{attention.map((w) => <li key={w}>{w}</li>)}</ul>
          <p className="muted small-text">Mothusi shows what it could not resolve instead of hiding it. You decide.</p>
        </section>
      )}

      {shared && <LearnerResults lesson={lesson} cls={cls} />}

      {active && (
        <InlineRun runId={active.runId} title={active.title} onDone={finishRun} showDetail={!!prefs.agentDetail}
          onFail={(msg) => { setError(msg); setActive(null) }} />
      )}

      {lesson.changes?.length > 0 && (
        <Detail title={`What changed in version ${lesson.version}`} meta={plural(lesson.changes.length, 'change')} open>
          <ul className="t-list">
            {lesson.changes.map((c) => (
              <li key={c.adaptation_id}>
                <span className="chip">{c.learner}</span>
                {c.before && <p className="t-before">Before: {c.before.strategy}. {c.before.instruction}</p>}
                <p className="t-after">Now: <strong>{c.after.strategy}.</strong> {c.after.instruction}</p>
              </li>
            ))}
          </ul>
        </Detail>
      )}

      <Detail title="Support for learners" meta={`${plural(adaptations.length, 'recommendation')} for ${plural(supported, 'learner')} and the class`}>
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
      </Detail>

      <Detail title="Lesson flow" meta={`${(lesson.flow || []).reduce((n, f) => n + Number(f.min || 0), 0)} min`}>
        <ul className="t-list">
          {(lesson.flow || []).map((f) => (
            <li key={f.label}>
              <div className="t-list-row"><strong>{f.label}</strong><span className="muted">{f.min} min</span></div>
              {f.activity && <span className="muted small-text">{f.activity}</span>}
            </li>
          ))}
        </ul>
        {lesson.successCriteria?.length > 0 && (
          <div>
            <strong>Success criteria</strong>
            <ul>{lesson.successCriteria.map((c) => <li key={c}>{c}</li>)}</ul>
          </div>
        )}
      </Detail>

      <Detail title="Checks" meta={failedChecks.length ? `${failedChecks.length} still failing` : 'All passed'}>
        <ul className="t-checks">
          {checks.map((c) => (
            <li key={c.check} className={c.passed ? '' : 'failed'}>{c.label}{c.detail ? ` (${c.detail})` : ''}</li>
          ))}
        </ul>
        {lesson.stats && (
          <p className="muted small-text">
            {lesson.stats.corrections} correction round(s) and {lesson.stats.rejections} rejection(s) handled by the agents.{' '}
            <Link to={`/teacher/activity/${lesson.runId}`}>See how Mothusi worked</Link>
          </p>
        )}
      </Detail>

      {lesson.demands?.length > 0 && (
        <Detail title="What this lesson asks of learners" meta={plural(lesson.demands.length, 'demand')}>
          <ul className="t-demands">
            {lesson.demands.map((d, i) => (
              <li key={i}><span className={`chip ${d.load === 'high' ? 'warn' : ''}`}>{d.kind.replace(/_/g, ' ')} • {d.load}</span> {d.description}</li>
            ))}
          </ul>
        </Detail>
      )}

      {lesson.memoryApplied?.length > 0 && (
        <Detail title="What Mothusi remembered" meta={plural(lesson.memoryApplied.length, 'note')}>
          <ul className="t-list">
            {lesson.memoryApplied.slice(0, 8).map((m, i) => (
              <li key={i}>
                <span className={`chip ${m.outcome === 'Worked' ? 'ok' : m.outcome === 'Did not work' ? 'warn' : ''}`}>
                  {m.outcome === 'Evidence' ? 'From practice' : m.outcome}
                </span>{' '}
                {m.learner_label || m.learner_id}: {m.outcome === 'Evidence' ? m.note : m.strategy || m.instruction}{' '}
                <span className="muted small-text">({m.topic})</span>
              </li>
            ))}
          </ul>
          <p className="muted small-text">Mothusi does not retrain its model. It brings your feedback and learners' practice into the next plan.</p>
        </Detail>
      )}

      {canGiveFeedback && (
        <section className="card stack">
          <h2>After you teach</h2>
          <p className="muted">Tell Mothusi what worked. The Progress Tracker brings it into your next plan.</p>
          <div className="row">
            <Link to={`/teacher/lessons/${lesson.id}/feedback`} className="btn">Give feedback</Link>
            <button type="button" className="btn secondary" onClick={() => navigate('/teacher/plan', { state: { from: planAgainFrom(lesson) } })}>Plan again</button>
          </div>
        </section>
      )}

      {lesson.status === 'completed' && lesson.feedback && (
        <section className="card stack">
          <h2>Your feedback</h2>
          <p><strong>Overall:</strong> {lesson.feedback.overall}</p>
          {lesson.feedback.happened && <p><strong>What happened:</strong> {lesson.feedback.happened}</p>}
          {lesson.feedback.change && <p><strong>What to change next time:</strong> {lesson.feedback.change}</p>}
          <div><button type="button" className="btn secondary" onClick={() => navigate('/teacher/plan', { state: { from: planAgainFrom(lesson) } })}>Plan again</button></div>
        </section>
      )}

      <Detail title="Review record" meta={plural(lesson.history.length, 'entry', 'entries')}>
        <ul className="t-history">
          {[...lesson.history].reverse().map((h, i) => (
            <li key={i}>
              <strong>{h.note}</strong>
              <span className="muted small-text">
                {h.by} • {formatDateTime(h.at)}
                {h.runId && <> • <Link to={`/teacher/activity/${h.runId}`}>how Mothusi worked</Link></>}
              </span>
              {h.reason && <span className="small-text">Reason: {h.reason}</span>}
            </li>
          ))}
        </ul>
      </Detail>

      {!canDecide && error && <p className="t-error" role="alert">{error}</p>}
      <p><Link to="/teacher/lessons">Back to all lesson plans</Link></p>

      {/* ---------- Decision ---------- */}
      {canDecide && (
        <section className="t-decision" aria-label="Your decision">
          {mode === 'return' && (
            <div className="t-decision-panel stack">
              <label className="t-field">What should Mothusi change?
                <textarea rows="3" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus
                  placeholder="For example: Learner B needs one instruction at a time, not three." />
              </label>
              <div className="row">
                <button type="button" className="btn" onClick={sendBack} disabled={busy}>Send back to Mothusi</button>
                <button type="button" className="btn secondary" onClick={() => { setMode(null); setError('') }}>Cancel</button>
              </div>
            </div>
          )}
          {mode === 'conditions' && conditions && (
            <div className="t-decision-panel stack">
              <ConstraintFields form={conditions} set={(k, v) => setConditions((c) => ({ ...c, [k]: v }))} legend="What is different now?" />
              <p className="t-hint">Mothusi re-checks every recommendation and redesigns only what no longer fits.</p>
              <div className="row">
                <button type="button" className="btn" onClick={changeConditions} disabled={busy}>Re-plan for these conditions</button>
                <button type="button" className="btn secondary" onClick={() => setMode(null)}>Cancel</button>
              </div>
            </div>
          )}
          {error && <p className="t-error" role="alert">{error}</p>}
          <div className="t-decision-bar">
            <span className="t-decision-text muted small-text">Approving shares this version with your learners.</span>
            <div className="row tight">
              {lesson.needsRecheck
                ? <button type="button" className="btn" onClick={recheck} disabled={busy}>Re-check my edits</button>
                : <button type="button" className="btn" onClick={approve} disabled={busy}>Approve{lesson.recheckIssues?.length ? ' anyway' : ''}</button>}
              <Link to={`/teacher/lessons/${lesson.id}/edit`} className="btn secondary">Edit</Link>
              <button type="button" className="btn secondary" aria-expanded={mode === 'return'} onClick={() => setMode(mode === 'return' ? null : 'return')}>Return</button>
              <button type="button" className="btn ghost" aria-expanded={mode === 'conditions'}
                onClick={() => { setConditions(formFromConstraints(lesson.constraints)); setMode(mode === 'conditions' ? null : 'conditions') }}>
                Conditions changed
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}

function Detail({ title, meta, open = false, children }) {
  return (
    <details className="card t-detail" open={open}>
      <summary>
        <span className="t-detail-title">{title}</span>
        {meta && <span className="muted small-text">{meta}</span>}
      </summary>
      <div className="stack t-detail-body">{children}</div>
    </details>
  )
}

function LearnerResults({ lesson, cls }) {
  const { data, loading, error } = useClassInsights(lesson.classId)
  const insight = lessonInsight(data, lesson)
  const missed = mostMissed(insight, lesson)
  const explain = explainSummary(insight?.explain_styles)
  const feelings = feelingSummary(insight?.feelings)
  const size = lesson.constraints?.class_size ?? cls?.size

  return (
    <section className="card stack">
      <div className="t-list-row">
        <h2>How learners did</h2>
        <Link to="/teacher/insights" className="small-text">Class insights</Link>
      </div>
      {loading && <p className="muted">Loading…</p>}
      {error && <p className="t-error">{error}</p>}
      {insight && (
        insight.opened === 0 ? (
          <p className="muted">No learner has opened this lesson yet. Learners sign in with your class code on <strong>Learners &amp; codes</strong>.</p>
        ) : (
          <>
            <dl className="t-glance">
              <div><dt>Opened it</dt><dd>{insight.opened}{size ? <span className="muted"> of {size}</span> : null}</dd></div>
              <div><dt>Finished practice</dt><dd>{insight.practised}</dd></div>
              <div><dt>Asked for another way</dt><dd>{Object.values(insight.explain_styles).reduce((n, v) => n + v, 0)}</dd></div>
            </dl>
            <ul className="t-list">
              {missed && <li><strong>Most missed:</strong> "{missed.prompt}" ({missed.missed} of {missed.tried} wrong at first try)</li>}
              {explain && <li><strong>Explanations asked for:</strong> {explain}</li>}
              {feelings && <li><strong>How it felt:</strong> {feelings}</li>}
            </ul>
            <p className="muted small-text">Mothusi's Progress Tracker uses this practice as evidence the next time you plan for these learners.</p>
          </>
        )
      )}
    </section>
  )
}
