import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTeacher } from './TeacherContext.jsx'
import { formatDate } from './format.js'
import { shareLessonCard } from './lessonCard.js'
import logoMark from '../assets/logo-mark.webp'

// The lesson on the teacher's phone while they teach: the phase timer, who needs what right now, and
// what to have ready. Works offline once the lesson has been opened.
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
const matchesPhase = (phase, label) => {
  const a = norm(phase)
  const b = norm(label)
  if (!a || !b) return false
  return a === b || a.includes(b) || b.includes(a) || a.split(' ')[0] === b.split(' ')[0]
}
const clock = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`

function useWakeLock(on) {
  useEffect(() => {
    if (!on || !('wakeLock' in navigator)) return undefined
    let lock = null
    let alive = true
    const request = () => navigator.wakeLock.request('screen').then((l) => { if (alive) lock = l; else l.release() }).catch(() => {})
    request()
    const onVisible = () => { if (document.visibilityState === 'visible') request() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { alive = false; document.removeEventListener('visibilitychange', onVisible); lock?.release().catch(() => {}) }
  }, [on])
}

export default function TeachMode() {
  const { id } = useParams()
  const { lessons } = useTeacher()
  const lesson = lessons.find((l) => l.id === id)

  const flow = lesson?.flow || []
  const [phase, setPhase] = useState(0)
  const [running, setRunning] = useState(false)
  const [left, setLeft] = useState(() => (flow[0]?.min || 0) * 60)
  const [shareState, setShareState] = useState('')
  const endAt = useRef(null)
  useWakeLock(running)

  useEffect(() => {
    if (!running) return undefined
    const t = setInterval(() => {
      const s = Math.round((endAt.current - Date.now()) / 1000)
      setLeft(s)
      if (s <= 0 && navigator.vibrate) navigator.vibrate(200)
    }, 500)
    return () => clearInterval(t)
  }, [running])

  const adaptations = useMemo(() => (lesson?.adaptations || []).filter((a) => !a.removed), [lesson])
  const names = useMemo(() => Object.fromEntries((lesson?.learnersPack || []).map((l) => [l.id, l.name])), [lesson])

  if (!lesson) {
    return <div className="stack"><h1>Lesson not found</h1><p><Link to="/teacher/lessons">Back to lesson plans</Link></p></div>
  }
  if (!flow.length) {
    return (
      <div className="stack">
        <h1>{lesson.topic}</h1>
        <p className="muted">This lesson is not ready yet.</p>
        <p><Link to={`/teacher/lessons/${lesson.id}`}>Back to the lesson</Link></p>
      </div>
    )
  }

  const goTo = (i) => {
    const next = Math.max(0, Math.min(flow.length - 1, i))
    setPhase(next)
    setLeft(flow[next].min * 60)
    if (running) endAt.current = Date.now() + flow[next].min * 60 * 1000
  }
  const toggle = () => {
    if (running) { setRunning(false); return }
    endAt.current = Date.now() + left * 1000
    setRunning(true)
  }

  const current = flow[phase]
  const now = adaptations.filter((a) => matchesPhase(a.phase, current.label))
  const anytime = adaptations.filter((a) => !flow.some((f) => matchesPhase(a.phase, f.label)))
  const materials = [...new Set(adaptations.flatMap((a) => a.materials || []))]
  const who = (a) => (a.learnerId === 'whole_class' ? 'Whole class' : names[a.learnerId] || a.learner)
  const overtime = left < 0

  const share = async () => {
    setShareState('Preparing the image…')
    try {
      const result = await shareLessonCard(lesson, { logo: logoMark })
      setShareState(result === 'downloaded' ? 'Saved the lesson card as an image.' : result === 'shared' ? 'Shared.' : '')
    } catch (e) {
      setShareState(e.message)
    }
  }

  return (
    <div className="stack tm">
      <div className="t-page-head">
        <div>
          <h1>{lesson.topic}</h1>
          <p className="muted">{lesson.grade} {lesson.subject} • {formatDate(lesson.date)} • Version {lesson.version}</p>
        </div>
        <div className="row tight">
          <button type="button" className="btn secondary small" onClick={share}>Share as image</button>
          <button type="button" className="btn ghost small" onClick={() => window.print()}>Print</button>
          <Link to={`/teacher/lessons/${lesson.id}`} className="btn ghost small">Full plan</Link>
        </div>
      </div>
      {shareState && <p className="muted small-text" role="status">{shareState}</p>}

      <section className={`card tm-timer ${overtime ? 'over' : ''}`} aria-label="Phase timer">
        <div className="tm-phase">
          <span className="muted small-text">Phase {phase + 1} of {flow.length}</span>
          <h2>{current.label}</h2>
          {current.activity && <p>{current.activity}</p>}
        </div>
        <div className="tm-clock" aria-live="off">{overtime ? `+${clock(-left)}` : clock(left)}</div>
        <div className="tm-controls">
          <button type="button" className="btn secondary" onClick={() => goTo(phase - 1)} disabled={phase === 0} aria-label="Previous phase">‹</button>
          <button type="button" className="btn tm-play" onClick={toggle}>{running ? 'Pause' : left === current.min * 60 ? 'Start' : 'Resume'}</button>
          <button type="button" className="btn secondary" onClick={() => goTo(phase + 1)} disabled={phase === flow.length - 1} aria-label="Next phase">›</button>
        </div>
        <ol className="tm-track" aria-label="Lesson phases">
          {flow.map((f, i) => (
            <li key={f.label} className={i === phase ? 'on' : i < phase ? 'done' : ''} style={{ flexGrow: f.min }}>
              <button type="button" onClick={() => goTo(i)} aria-current={i === phase ? 'step' : undefined}>
                <span>{f.label}</span><span className="muted">{f.min}m</span>
              </button>
            </li>
          ))}
        </ol>
        {running && 'wakeLock' in navigator && <p className="muted small-text tm-awake">The screen stays on while the timer runs.</p>}
      </section>

      <section className="card stack">
        <h2>Who needs what now</h2>
        {now.length === 0 && <p className="muted">Nothing planned for specific learners in this phase.</p>}
        <ul className="t-list">
          {now.map((a) => (
            <li key={a.id}>
              <div className="row tight"><strong>{who(a)}</strong><span className="chip">{a.strategy}</span><span className="chip">{a.teacherMinutes} min</span></div>
              <p className="tm-text">{a.text}</p>
            </li>
          ))}
        </ul>
      </section>

      {anytime.length > 0 && (
        <section className="card stack">
          <h2>Any time in the lesson</h2>
          <ul className="t-list">
            {anytime.map((a) => (
              <li key={a.id}>
                <div className="row tight"><strong>{who(a)}</strong><span className="chip">{a.strategy}</span></div>
                <p className="tm-text">{a.text}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="t-columns">
        {materials.length > 0 && (
          <section className="card stack">
            <h2>Have ready</h2>
            <ul className="tm-ready">{materials.map((m) => <li key={m}>{m}</li>)}</ul>
          </section>
        )}
        {lesson.vocabulary?.length > 0 && (
          <section className="card stack">
            <h2>Key words</h2>
            <p className="tm-words">{lesson.vocabulary.join(' • ')}</p>
          </section>
        )}
      </div>
    </div>
  )
}
