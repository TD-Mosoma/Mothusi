import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { lessonFromRun, useActiveClasses, useTeacher } from './TeacherContext.jsx'
import { subjectsFor, languageLabel } from './curriculum.js'
import { capsTopics, currentTerm } from './caps.js'
import { describeConditions, tomorrowISO } from './format.js'
import { buildLessonRequest, getHealth, getResourceText, startPlan } from '../services/api.js'
import { useRunStream } from '../hooks/useRunStream.js'
import LiveRun from '../components/LiveRun.jsx'
import ConstraintFields from './ConstraintFields.jsx'

const MAX_CONTENT = 6000 // the backend's limit for lesson content
const DEFAULT_CONDITIONS = {
  noPrinter: true, hasDevices: false, noisyHall: false, conditionNotes: '', lessonMinutes: 45, supportMinutes: 5, prepMinutes: 30,
}
const CONDITION_KEYS = Object.keys(DEFAULT_CONDITIONS).concat('learnerCount')

const conditionsFor = (cls) => ({ ...DEFAULT_CONDITIONS, learnerCount: cls?.size || 30, ...(cls?.conditions || {}) })

export default function LessonPlanner() {
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from // "Plan again" from an earlier lesson
  const { learners, lessons, resources, addLesson, updateLesson, updateClass, newLessonId, prefs } = useTeacher()
  const activeClasses = useActiveClasses()

  const subjectOptions = (cls) => (cls ? cls.subjects.filter((s) => subjectsFor(cls.grade).includes(s)) : [])
  const startClass = activeClasses.find((c) => c.id === (from?.classId || location.state?.classId)) || activeClasses[0]
  const [form, setForm] = useState(() => ({
    classId: startClass?.id || '',
    subject: from?.subject && subjectOptions(startClass).includes(from.subject) ? from.subject : subjectOptions(startClass)[0] || '',
    topic: from?.topic || '',
    date: tomorrowISO(),
    objectives: from?.objectives || '',
    notes: from?.notes || '',
    resourceId: '',
    offline: false,
    ...conditionsFor(startClass),
  }))
  const [changing, setChanging] = useState(() => !startClass?.conditions)
  const [remember, setRemember] = useState(true)
  const [term, setTerm] = useState(currentTerm)
  const [errors, setErrors] = useState({})
  const [runId, setRunId] = useState(null)
  const [lessonId, setLessonId] = useState(null)
  const [startError, setStartError] = useState('')
  const [starting, setStarting] = useState(false)
  const [health, setHealth] = useState(undefined)
  const finished = useRef(null)
  const { events, status, run } = useRunStream(runId)

  useEffect(() => { getHealth().then(setHealth, () => setHealth(null)) }, [])

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))
  const cls = activeClasses.find((c) => c.id === form.classId)
  const classLearners = learners.filter((l) => l.classId === form.classId)
  const matching = resources.filter((r) => r.grade === cls?.grade && r.subject === form.subject)
  const attached = resources.find((r) => r.id === form.resourceId)
  const topics = useMemo(() => capsTopics(cls?.grade, form.subject), [cls?.grade, form.subject])
  const termTopics = topics.filter((t) => term === 'all' || t.term === 0 || t.term === term)
  const lastLesson = lessons.find((l) => l.classId === form.classId && l.topic && l.status !== 'preparing')

  const changeClass = (id) => {
    const c = activeClasses.find((x) => x.id === id)
    setForm((f) => ({ ...f, classId: id, subject: subjectOptions(c)[0] || '', resourceId: '', ...conditionsFor(c) }))
    setChanging(!c?.conditions)
  }

  const pickTopic = (t) => {
    const words = t.words.length ? `Key words: ${t.words.join(', ')}` : ''
    setForm((f) => ({
      ...f,
      topic: t.topic,
      objectives: t.objective,
      notes: f.notes.trim() ? (words && !f.notes.includes('Key words:') ? `${f.notes.trim()}\n${words}` : f.notes) : words,
    }))
    setErrors((e) => ({ ...e, topic: undefined, objectives: undefined }))
  }

  // When the agents finish while the teacher is still here, fill in the lesson straight away.
  useEffect(() => {
    if (!run || finished.current === run.id || !lessonId) return
    if (status === 'done' && run.result?.pack) {
      finished.current = run.id
      updateLesson(lessonId, (cur) => (cur.status === 'preparing' && cur.runId === run.id ? lessonFromRun(cur, run) : {}))
    } else if (status === 'failed') {
      finished.current = run.id
      updateLesson(lessonId, (cur) => (cur.runId === run.id ? { status: 'failed', error: run.error || 'Mothusi stopped before the lesson was ready.' } : {}))
    }
  }, [status, run, lessonId, updateLesson])

  const validate = () => {
    const e = {}
    if (!form.classId) e.classId = 'Choose a class.'
    if (!form.subject) e.subject = 'This class has no Grades 1–4 subject yet. Add one in Classes.'
    if (form.topic.trim().length < 2) e.topic = 'Enter the lesson topic, or choose one from CAPS.'
    if (form.objectives.trim().length < 5) e.objectives = 'Describe what learners should be able to do.'
    if (!form.date) e.date = 'Choose a lesson date.'
    if (Number(form.lessonMinutes) < 10 || Number(form.lessonMinutes) > 120) e.lessonMinutes = 'Use 10 to 120 minutes.'
    if (Number(form.supportMinutes) < 0 || Number(form.supportMinutes) > 60) e.supportMinutes = 'Use 0 to 60 minutes.'
    if (Number(form.prepMinutes) < 0 || Number(form.prepMinutes) > 240) e.prepMinutes = 'Use 0 to 240 minutes.'
    if (Number(form.learnerCount) < 1 || Number(form.learnerCount) > 80) e.learnerCount = 'Use 1 to 80 learners.'
    setErrors(e)
    if (['lessonMinutes', 'supportMinutes', 'prepMinutes', 'learnerCount'].some((k) => e[k])) setChanging(true)
    return Object.keys(e).length === 0
  }

  // The teacher's notes, then as much of the attached material's text as fits.
  const lessonContent = async () => {
    const notes = form.notes.trim()
    if (!attached) return notes
    let text = ''
    try { text = attached.text_chars ? await getResourceText(attached.id) : '' } catch { /* use the title only */ }
    const head = `${notes ? `${notes}\n\n` : ''}From the teacher's material "${attached.title}":\n`
    return (head + (text || '(The text of this file could not be read.)')).slice(0, MAX_CONTENT)
  }

  const start = async (offline = form.offline) => {
    setStartError('')
    setStarting(true)
    const id = lessonId || newLessonId()
    try {
      const content = await lessonContent()
      const newRun = await startPlan(buildLessonRequest({ ...form, grade: cls.grade, notes: content }, classLearners, { lessonId: id, offline }))
      const now = new Date().toISOString()
      const base = {
        runId: newRun, status: 'preparing', error: '', offline,
        runs: [{ runId: newRun, kind: 'plan', at: now, version: 1 }],
      }
      const details = {
        title: `${cls.grade} ${form.subject}: ${form.topic.trim()}`,
        classId: form.classId, grade: cls.grade, subject: form.subject, topic: form.topic.trim(),
        date: form.date, objectives: form.objectives.trim(), notes: form.notes.trim(),
        attachedResource: attached ? attached.title : '', sample: !!cls.sample,
      }
      if (lessonId) {
        updateLesson(id, (cur) => ({
          ...details, ...base, history: [...(cur.history || []), { at: now, by: 'Teacher', note: 'Asked Mothusi to try again' }],
        }))
      } else {
        addLesson({
          id, ...details, ...base, version: 1, feedback: null, note: '',
          history: [{ at: now, by: 'Teacher', note: 'Asked Mothusi to prepare this lesson' }],
        })
      }
      if (remember) updateClass(cls.id, { conditions: Object.fromEntries(CONDITION_KEYS.map((k) => [k, form[k]])) })
      setForm((f) => ({ ...f, offline }))
      setLessonId(id)
      setRunId(newRun)
    } catch (err) {
      setStartError(err.message)
    } finally {
      setStarting(false)
    }
  }

  const submit = (e) => {
    e.preventDefault()
    if (validate()) start()
  }

  // ---------- While the agents work ----------
  if (runId) {
    const done = status === 'done'
    const failed = status === 'failed' || status === 'disconnected'
    return (
      <div className="stack">
        <div className="t-page-head">
          <div>
            <h1>{cls.grade} {form.subject}: {form.topic}</h1>
            <p className="muted">{done ? 'Ready for your review.' : failed ? 'This lesson was not finished.' : 'Mothusi is preparing this lesson.'}</p>
          </div>
          {done && <button type="button" className="btn" onClick={() => navigate(`/teacher/lessons/${lessonId}`)}>Review lesson plan</button>}
        </div>

        {!done && !failed && (
          <p className="t-note">
            You can keep working. This lesson is saved in <Link to="/teacher/lessons">Lesson plans</Link> as <strong>Preparing…</strong> and
            changes to <strong>Ready for review</strong> when it is done, even if you leave this page.
          </p>
        )}

        <LiveRun events={events} status={status} showDetail={!!prefs.agentDetail} />

        {failed && (
          <section className="card stack">
            <p className="t-error" role="alert">{run?.error || 'The connection to Mothusi was lost before the lesson was ready.'}</p>
            <div className="row">
              <button type="button" className="btn" disabled={starting} onClick={() => start(form.offline)}>Try again</button>
              {!form.offline && <button type="button" className="btn secondary" disabled={starting} onClick={() => start(true)}>Try in practice mode</button>}
              <button type="button" className="btn ghost" onClick={() => setRunId(null)}>Back to lesson details</button>
            </div>
            {startError && <p className="t-error" role="alert">{startError}</p>}
          </section>
        )}
        {done && run?.result?.warnings?.length > 0 && (
          <p className="t-note">{run.result.warnings.length} item(s) need your attention. They are at the top of the review page.</p>
        )}
        <p className="muted small-text">
          Mothusi retries a rejected step only up to a set limit. It never marks a failed check as passed; anything it
          cannot fix is flagged for your decision.
        </p>
      </div>
    )
  }

  // ---------- Lesson details ----------
  if (activeClasses.length === 0) {
    return (
      <div className="stack">
        <h1>New lesson</h1>
        <section className="card stack">
          <p>Mothusi plans for a class: its grade, its subjects and the learners who need support.</p>
          <div className="row">
            <Link to="/teacher/classes" className="btn">Add your class</Link>
            <Link to="/teacher" className="btn secondary">Or try a sample class from Home</Link>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="stack">
      <div className="t-page-head">
        <div>
          <h1>{from ? 'Plan again' : 'New lesson'}</h1>
          <p className="muted">
            {from ? `Starting from "${from.topic}". Change anything before you prepare it.` : 'Tell Mothusi what you are teaching. It plans around your class and your conditions.'}
          </p>
        </div>
        {!from && lastLesson && (
          <button type="button" className="btn secondary small" onClick={() => setForm((f) => ({
            ...f, subject: subjectOptions(cls).includes(lastLesson.subject) ? lastLesson.subject : f.subject,
            topic: lastLesson.topic, objectives: lastLesson.objectives || '', notes: lastLesson.notes || '',
          }))}>
            Copy my last lesson ({lastLesson.topic})
          </button>
        )}
      </div>

      <form className="card stack" onSubmit={submit} noValidate>
        <div className="t-form-grid">
          <label className="t-field">Class
            <select value={form.classId} onChange={(e) => changeClass(e.target.value)}>
              {activeClasses.map((c) => <option key={c.id} value={c.id}>{c.name}{c.sample ? '' : ` (${c.grade})`}</option>)}
            </select>
            {errors.classId && <span className="t-error" role="alert">{errors.classId}</span>}
          </label>
          <label className="t-field">Subject
            <select value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value, resourceId: '' }))}>
              {subjectOptions(cls).map((s) => <option key={s}>{s}</option>)}
            </select>
            {errors.subject && <span className="t-error" role="alert">{errors.subject}</span>}
          </label>
          <label className="t-field">Lesson date
            <input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
            {errors.date && <span className="t-error" role="alert">{errors.date}</span>}
          </label>
        </div>

        {topics.length > 0 && (
          <fieldset className="t-fieldset t-caps">
            <legend>Choose a CAPS topic (optional)</legend>
            <div className="t-caps-terms" role="group" aria-label="Term">
              {[1, 2, 3, 4, 'all'].map((n) => (
                <button key={n} type="button" className={`t-toggle ${term === n ? 'on' : ''}`} aria-pressed={term === n} onClick={() => setTerm(n)}>
                  {n === 'all' ? 'All terms' : `Term ${n}`}
                </button>
              ))}
            </div>
            <div className="t-caps-list">
              {termTopics.map((t) => (
                <button key={t.topic} type="button" className={`t-caps-topic ${form.topic === t.topic ? 'on' : ''}`} onClick={() => pickTopic(t)}>
                  <strong>{t.topic}</strong>
                  <span className="muted small-text">{t.term ? `Term ${t.term}` : 'Any term'}</span>
                </button>
              ))}
              {termTopics.length === 0 && <p className="muted small-text">No suggestions for this term. Choose another term or type your own topic.</p>}
            </div>
            <span className="t-hint">Suggestions only. Check the topic and term against your school's Annual Teaching Plan (ATP).</span>
          </fieldset>
        )}

        <label className="t-field">Lesson topic
          <input value={form.topic} onChange={(e) => set('topic', e.target.value)} placeholder="Fractions: halves and quarters" />
          {errors.topic && <span className="t-error" role="alert">{errors.topic}</span>}
        </label>

        <label className="t-field">What learners should be able to do
          <textarea rows="3" value={form.objectives} onChange={(e) => set('objectives', e.target.value)}
            placeholder="Recognise, name and represent halves and quarters of a whole." />
          {errors.objectives && <span className="t-error" role="alert">{errors.objectives}</span>}
        </label>

        <label className="t-field">Your lesson notes (optional)
          <textarea rows="4" value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Paste or type your lesson notes" />
        </label>

        <label className="t-field">Use your own material (optional)
          <select value={form.resourceId} onChange={(e) => set('resourceId', e.target.value)}>
            <option value="">None</option>
            {matching.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
          </select>
          <span className="t-hint">
            {matching.length === 0
              ? <>No materials for {cls?.grade} {form.subject} yet. <Link to="/teacher/resources">Upload one in Resources</Link>.</>
              : attached
                ? attached.text_chars
                  ? `Mothusi will read the text of "${attached.title}" and plan from it.`
                  : `Mothusi cannot read text from this file, so only its title is shared.`
                : `Materials you uploaded for ${cls?.grade} ${form.subject}.`}
          </span>
        </label>

        <section className="t-fieldset" aria-label="Learner support profiles">
          <strong>Learners who need support in {cls?.name}</strong>
          {classLearners.length === 0 && <p className="muted">No profiles yet. Mothusi will plan for the whole class.</p>}
          <ul className="t-list">
            {classLearners.map((l) => (
              <li key={l.id} className="t-list-row">
                <span><strong>{l.name}</strong> <span className="muted">• {l.support || 'No support notes'}</span></span>
                <span className="chip">{languageLabel(l.language || 'en')}</span>
              </li>
            ))}
          </ul>
          <span className="t-hint"><Link to="/teacher/profiles">Edit profiles</Link>. Only labels, strengths, support notes and the chosen language are shared with the agents.</span>
        </section>

        <section className="t-fieldset t-conditions" aria-label="Classroom conditions">
          <div className="t-list-row">
            <div>
              <strong>Classroom conditions</strong>
              <p className="muted small-text t-conditions-line">{describeConditions(form)}</p>
            </div>
            {!changing && (
              <button type="button" className="btn secondary small" onClick={() => setChanging(true)}>Anything different tomorrow?</button>
            )}
          </div>
          {changing && (
            <>
              <ConstraintFields form={form} set={set} errors={errors} legend={cls?.conditions ? 'Change for this lesson' : `${cls?.name}'s usual conditions`} />
              <label className="t-check">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                Remember these as {cls?.name}'s usual conditions
              </label>
            </>
          )}
        </section>

        <label className="t-check">
          <input type="checkbox" checked={form.offline} onChange={(e) => set('offline', e.target.checked)} />
          Practice mode (rule-based and quick, no AI; for rehearsing or if the live service is down)
        </label>

        {health === null && <p className="t-error" role="alert">Mothusi cannot reach its server right now. Check your connection and try again.</p>}
        {health && !health.live && !form.offline && <p className="t-hint">The live AI service is not set up on this server, so lessons are prepared in practice mode.</p>}
        {startError && <p className="t-error" role="alert">{startError}</p>}
        <div className="row">
          <button type="submit" className="btn" disabled={health === null || starting}>{starting ? 'Starting…' : 'Prepare lesson'}</button>
          <span className="muted small-text">
            {form.offline || (health && !health.live) ? 'Practice mode takes a few seconds.' : 'Usually about 3 minutes. You can keep working while Mothusi prepares it.'}
          </span>
        </div>
      </form>
    </div>
  )
}
