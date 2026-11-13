import { useEffect, useRef, useState } from 'react'
import { Link, useOutletContext, useSearchParams } from 'react-router-dom'
import FractionCircle from '../components/FractionCircle.jsx'
import { languageLabel } from '../teacher/curriculum.js'
import { askForExplanation, runToCompletion } from '../services/api.js'
import { completeLearnerActivity } from '../services/learnerPortal.js'
import { useLearnerLesson } from './useLearnerLesson.js'

const STEPS = ['Learn', 'Try it', 'Practice']
const STYLES = [
  { key: 'simpler', label: 'Make it simpler' },
  { key: 'visual', label: 'Show me with pictures' },
  { key: 'practical', label: 'Let me use my hands' },
]
const KID_STEP = {
  'Personalisation Agent': 'Thinking of a new way to explain…',
  Reviewer: 'Checking it is easy to read…',
  'Language Agent': 'Putting it in your language…',
}

export default function LearnerLesson() {
  const { lang, profile } = useOutletContext()
  const [params] = useSearchParams()
  const { loading, lesson, error } = useLearnerLesson(profile?.code, lang, params.get('lesson'))
  const requestedStyle = params.get('style')
  const autoStarted = useRef(false)
  const [step, setStep] = useState(0)
  const [material, setMaterial] = useState(null)
  const [helping, setHelping] = useState(null) // current kid-friendly status while agents work
  const [helpError, setHelpError] = useState('')

  useEffect(() => { setMaterial(lesson?.material || null) }, [lesson])

  const explainAgain = async (style) => {
    setHelpError('')
    setHelping('Asking Mothusi for help…')
    try {
      const runId = await askForExplanation({
        runId: lesson.run_id, code: profile?.code, language: lang, style, interests: profile?.interests || [],
      })
      const run = await runToCompletion(runId, (e) => { if (KID_STEP[e.agent]) setHelping(KID_STEP[e.agent]) })
      if (run.status === 'failed') throw new Error(run.error)
      setMaterial(run.result.material)
      setStep(0)
    } catch {
      setHelpError('Mothusi could not find another way right now. Ask your teacher or a buddy.')
    } finally {
      setHelping(null)
    }
  }

  // Arriving from "Learn a topic" with a chosen way of learning starts that explanation straight away.
  useEffect(() => {
    if (lesson && requestedStyle && !autoStarted.current && STYLES.some((st) => st.key === requestedStyle)) {
      autoStarted.current = true
      explainAgain(requestedStyle)
    }
  }, [lesson, requestedStyle])

  if (loading) return <p className="l-note">Getting your lesson ready…</p>
  if (error) return <p className="l-note" role="alert">We cannot load your lesson right now. Please ask your teacher.</p>
  if (lesson && !material) return <p className="l-note">Getting your lesson ready…</p>
  if (!lesson) {
    return (
      <div className="l-empty">
        <span aria-hidden="true">▤</span>
        <h2>No lesson yet</h2>
        <p>Your teacher has not shared a lesson yet. Check again soon!</p>
        <Link className="btn" to="/learner">Back to home</Link>
      </div>
    )
  }

  const visual = material.practice.flatMap((q) => q.options).find((o) => o.fraction)?.fraction

  return (
    <div className="stack l-page">
      <header className="l-page-heading">
        <span className="l-eyebrow">{lesson.subject.toUpperCase()} • {lesson.grade.toUpperCase()}</span>
        <h1>{material.title}</h1>
      </header>

      {lesson.note === 'language_unavailable' && lang !== 'en' && (
        <p className="l-note" role="status">
          This lesson is not ready in {languageLabel(lang)} yet. We are showing it in English while a person checks the translation.
        </p>
      )}
      {lesson.note === 'translated_ai_draft' && (
        <p className="l-note" role="status">This lesson was translated into {languageLabel(lang)} by Mothusi and checked by its reviewer.</p>
      )}

      <ol className="l-steps" aria-label="Lesson steps">
        {STEPS.map((s, i) => (
          <li key={s} className={i === step ? 'current' : i < step ? 'done' : ''}>
            <button onClick={() => setStep(i)} aria-current={i === step ? 'step' : undefined}>{s}</button>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <section className="card l-learn">
          <div className="stack">
            <div>{material.explanation.map((line, i) => <p key={i}>{line}</p>)}</div>
            <p className="l-example">{material.everyday_example}</p>
            {helping ? (
              <p className="l-note" role="status" aria-live="polite">{helping}</p>
            ) : (
              <div className="stack">
                <p className="muted">Want another way?</p>
                <div className="row">
                  {STYLES.map((s) => (
                    <button key={s.key} className="btn secondary" onClick={() => explainAgain(s.key)}>{s.label}</button>
                  ))}
                </div>
              </div>
            )}
            {helpError && <p className="l-note" role="alert">{helpError}</p>}
            <div className="row">
              <button className="btn" onClick={() => setStep(1)} disabled={!!helping}>Next</button>
            </div>
          </div>
          {visual && (
            <div className="l-fractions" aria-hidden="true">
              <FractionCircle parts={visual.parts} shaded={visual.shaded} />
              <span className="l-frac-label">{visual.shaded}/{visual.parts}</span>
            </div>
          )}
        </section>
      )}

      {step === 1 && (
        <section className="card stack">
          <h2>Try it with real things</h2>
          <p>{material.activity}</p>
          <div className="row">
            <button className="btn secondary" onClick={() => setStep(0)}>Back</button>
            <button className="btn" onClick={() => setStep(2)}>I tried it</button>
          </div>
        </section>
      )}

      {step === 2 && <Practice key={material.title} questions={material.practice} onDone={() => completeLearnerActivity(lesson)} />}
    </div>
  )
}

function Practice({ questions, onDone }) {
  const [qi, setQi] = useState(0)
  const [picked, setPicked] = useState(null)
  const q = questions[qi]
  const correct = picked === q.answer_index
  const last = qi === questions.length - 1

  const next = () => { setPicked(null); setQi((i) => i + 1) }
  const done = picked !== null && correct && last

  useEffect(() => { if (done) onDone() }, [done])

  return (
    <section className="card stack">
      <h2>Question {qi + 1} of {questions.length}</h2>
      <p className="l-question">{q.prompt}</p>
      <div className="l-options" role="group" aria-label="Answer choices">
        {q.options.map((o, i) => (
          <button
            key={i}
            className={`l-option ${picked === i ? (i === q.answer_index ? 'right' : 'try') : ''}`}
            onClick={() => setPicked(i)}
            aria-label={o.fraction ? `${o.fraction.shaded} of ${o.fraction.parts} parts shaded` : o.text}
          >
            {o.fraction ? <FractionCircle parts={o.fraction.parts} shaded={o.fraction.shaded} size={110} /> : <span className="l-option-text">{o.text}</span>}
          </button>
        ))}
      </div>

      {picked !== null && (
        <div className={`l-feedback ${correct ? 'right' : 'try'}`} role="status">
          {correct ? 'Well done! You found it.' : `Good try. ${q.hint || 'Look again and try another answer.'}`}
        </div>
      )}

      {picked !== null && correct && !last && <button className="btn" onClick={next}>Next question</button>}
      {picked !== null && correct && last && <p className="l-done">You finished today's practice. Great work!</p>}
    </section>
  )
}
