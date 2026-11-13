import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useTeacher } from './TeacherContext.jsx'
import { unique, byGrade } from './curriculum.js'
import { tomorrowISO } from './format.js'
import { generateLessonDraft, getBackendHealth, WORKFLOW_STAGES } from '../services/api.js'

const stageText = (stage, s) => {
  if (s.status === 'running') return `In progress • ${stage.desc}`
  if (s.status === 'done') return `Completed • ${s.detail}`
  if (s.status === 'retry') return s.detail
  if (s.status === 'failed') return `Failed • ${s.detail}`
  return `Queued • ${stage.desc}`
}

export default function LessonPlanner() {
  const navigate = useNavigate()
  const { profile, classes, learners, resources, addLesson } = useTeacher()
  const activeClasses = classes.filter((c) => !c.archived)

  const first = activeClasses[0]
  const [form, setForm] = useState({
    classId: first?.id || '',
    grade: first?.grade || '',
    subject: first?.subjects[0] || '',
    topic: '',
    date: tomorrowISO(),
    objectives: '',
    notes: '',
    resourceId: '',
    noPrinter: true,
    noisyHall: false,
    learnerCount: first?.size || 30,
    lessonMinutes: 45,
    supportMinutes: 5,
  })
  const [errors, setErrors] = useState({})
  const [view, setView] = useState('form') // 'form' | 'working'
  const [steps, setSteps] = useState([])
  const [error, setError] = useState('')
  const [finished, setFinished] = useState(null) // lesson id when the draft is ready
  const [backendStatus, setBackendStatus] = useState('Checking backend...')

  useEffect(() => {
    getBackendHealth()
      .then(({ generator }) => {
        const status = {
          demo: 'Connected to backend · local demo mode',
          ready: 'Connected to backend · AI generation ready',
          unconfigured: 'Connected to backend · NVIDIA_API_KEY not configured',
          dependencies_missing: 'Connected to backend · CrewAI dependencies missing',
        }[generator]
        setBackendStatus(status || 'Connected to backend')
      })
      .catch(() => setBackendStatus('Backend unavailable · start the backend to generate lessons'))
  }, [])

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))
  const cls = activeClasses.find((c) => c.id === form.classId)

  const changeClass = (id) => {
    const c = activeClasses.find((x) => x.id === id)
    setForm((f) => ({
      ...f, classId: id, grade: c?.grade || f.grade, subject: c?.subjects[0] || '', learnerCount: c?.size || f.learnerCount, resourceId: '',
    }))
  }

  const gradeOptions = unique([...profile.grades, cls?.grade]).sort(byGrade)
  const subjectOptions = cls ? cls.subjects : profile.subjects
  const matching = resources.filter((r) => r.grade === form.grade && r.subject === form.subject)

  const validate = () => {
    const e = {}
    if (!form.classId) e.classId = 'Choose a class.'
    if (form.topic.trim().length < 2) e.topic = 'Enter the lesson topic.'
    if (form.objectives.trim().length < 5) e.objectives = 'Describe what learners should be able to do.'
    if (!form.date) e.date = 'Choose a lesson date.'
    if (Number(form.lessonMinutes) < 10) e.lessonMinutes = 'Lessons need at least 10 minutes.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const run = async () => {
    setError('')
    setFinished(null)
    setView('working')
    setSteps(WORKFLOW_STAGES.map(() => ({ status: 'queued', detail: '' })))

    const classLearners = learners.filter((l) => l.classId === form.classId)
    const attached = resources.find((r) => r.id === form.resourceId)
    try {
      const draft = await generateLessonDraft(
        { ...form, lessonMinutes: Number(form.lessonMinutes), supportMinutes: Number(form.supportMinutes) },
        classLearners,
        (i, update) => setSteps((s) => s.map((x, idx) => (idx === i ? { ...x, ...update } : x)))
      )
      const id = addLesson({
        title: `${form.grade} ${form.subject} – ${form.topic.trim()}`,
        classId: form.classId, grade: form.grade, subject: form.subject, topic: form.topic.trim(),
        date: form.date, objectives: form.objectives.trim(), notes: form.notes.trim(),
        attachedResource: attached ? attached.title : '',
        status: 'awaiting_review', version: 1, needsRecheck: false, feedback: null, note: '',
        constraints: { noPrinter: form.noPrinter, noisyHall: form.noisyHall, learners: Number(form.learnerCount), lessonMinutes: Number(form.lessonMinutes), supportMinutes: Number(form.supportMinutes) },
        history: [{ at: new Date().toISOString(), by: 'Mothusi', note: 'Draft generated' }],
        ...draft,
      })
      setFinished(id)
    } catch (generationError) {
      setSteps((s) => s.map((x) => (x.status === 'running' || x.status === 'retry' ? { ...x, status: 'failed', detail: 'This stage did not finish.' } : x)))
      setError(`${generationError.message} Nothing was saved. Try again after addressing the issue.`)
    }
  }

  const analyse = (e) => {
    e.preventDefault()
    if (validate()) run()
  }

  // ---------- Agent workflow view ----------
  if (view === 'working') {
    const busy = !finished && !error
    return (
      <div className="stack">
        <div className="t-page-head">
          <div>
            <h1>{finished ? 'Your lesson draft is ready' : 'Mothusi is preparing your lesson'}</h1>
            <p className="muted">See each stage of the workflow and whether it completed successfully.</p>
          </div>
        </div>

        <section className="card stack" aria-live="polite">
          <ol className="t-stages">
            {WORKFLOW_STAGES.map((stage, i) => {
              const s = steps[i] || { status: 'queued' }
              return (
                <li key={stage.key} className={s.status}>
                  <span className="t-stage-num" aria-hidden="true">{i + 1}</span>
                  <div>
                    <strong>{stage.label}</strong>
                    <span>{stageText(stage, s)}</span>
                  </div>
                </li>
              )
            })}
          </ol>
          {error && <p className="t-error" role="alert">{error}</p>}
          <div className="row">
            {finished && <button type="button" className="btn" onClick={() => navigate(`/teacher/lessons/${finished}`)}>Review lesson plan</button>}
            {error && <button type="button" className="btn" onClick={run}>Try again</button>}
            {!busy && <button type="button" className="btn secondary" onClick={() => setView('form')}>Back to lesson details</button>}
          </div>
        </section>

        <p className="t-note">
          If a check fails, Mothusi shows it and retries up to a set limit. It never marks a failed stage as complete.
        </p>
      </div>
    )
  }

  // ---------- Create a lesson plan ----------
  if (activeClasses.length === 0) {
    return (
      <div className="stack">
        <h1>Create a lesson plan</h1>
        <p className="card muted">You need a class first. <Link to="/teacher/classes">Add a class</Link> and come back.</p>
      </div>
    )
  }

  return (
    <div className="stack">
      <div className="t-page-head">
        <div>
          <h1>Create a lesson plan</h1>
          <p className="muted">Tell Mothusi what you are teaching and the conditions it must plan around.</p>
          <p className="muted small-text" role="status">{backendStatus}</p>
        </div>
      </div>

      <form className="card stack" onSubmit={analyse} noValidate>
        <div className="t-form-grid">
          <label className="t-field">Class
            <select value={form.classId} onChange={(e) => changeClass(e.target.value)}>
              {activeClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {errors.classId && <span className="t-error" role="alert">{errors.classId}</span>}
          </label>
          <label className="t-field">Subject
            <select value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value, resourceId: '' }))}>
              {subjectOptions.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label className="t-field">Grade
            <select value={form.grade} onChange={(e) => setForm((f) => ({ ...f, grade: e.target.value, resourceId: '' }))}>
              {gradeOptions.map((g) => <option key={g}>{g}</option>)}
            </select>
          </label>
        </div>

        <div className="t-form-grid">
          <label className="t-field">Lesson topic
            <input value={form.topic} onChange={(e) => set('topic', e.target.value)} placeholder="Fractions" />
            {errors.topic && <span className="t-error" role="alert">{errors.topic}</span>}
          </label>
          <label className="t-field">Lesson date
            <input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
            {errors.date && <span className="t-error" role="alert">{errors.date}</span>}
          </label>
        </div>

        <label className="t-field">Learning objectives
          <textarea rows="3" value={form.objectives} onChange={(e) => set('objectives', e.target.value)} placeholder="Represent halves, thirds and quarters." />
          {errors.objectives && <span className="t-error" role="alert">{errors.objectives}</span>}
        </label>

        <label className="t-field">Lesson content
          <textarea rows="4" value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Paste your lesson notes here" />
        </label>

        <label className="t-field">Attach curriculum material (optional)
          <select value={form.resourceId} onChange={(e) => set('resourceId', e.target.value)}>
            <option value="">None</option>
            {matching.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
          </select>
          <span className="t-hint">
            {matching.length === 0
              ? <>No uploaded materials for {form.grade} {form.subject}. <Link to="/teacher/resources">Upload some in Resources</Link>.</>
              : `Showing materials for ${form.grade} ${form.subject}.`}
          </span>
        </label>

        <fieldset className="t-fieldset">
          <legend>Classroom constraints</legend>
          <label className="t-check">
            <input type="checkbox" checked={form.noPrinter} onChange={(e) => set('noPrinter', e.target.checked)} />
            No printer available
          </label>
          <label className="t-check">
            <input type="checkbox" checked={form.noisyHall} onChange={(e) => set('noisyHall', e.target.checked)} />
            Lesson is in a noisy hall
          </label>
          <div className="t-form-grid">
            <label className="t-field">Learners
              <input type="number" min="1" value={form.learnerCount} onChange={(e) => set('learnerCount', e.target.value)} />
            </label>
            <label className="t-field">Lesson length (minutes)
              <input type="number" min="10" value={form.lessonMinutes} onChange={(e) => set('lessonMinutes', e.target.value)} />
              {errors.lessonMinutes && <span className="t-error" role="alert">{errors.lessonMinutes}</span>}
            </label>
            <label className="t-field">Most individual support (minutes)
              <input type="number" min="0" value={form.supportMinutes} onChange={(e) => set('supportMinutes', e.target.value)} />
            </label>
          </div>
        </fieldset>

        <div className="row">
          <button type="submit" className="btn">Analyse lesson</button>
          <span className="muted">Mothusi analyses lesson demands and matches learner support profiles.</span>
        </div>
      </form>
    </div>
  )
}
