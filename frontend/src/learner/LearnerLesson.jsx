import { useEffect, useRef, useState } from 'react'
import { Link, useOutletContext, useSearchParams } from 'react-router-dom'
import FractionCircle from '../components/FractionCircle.jsx'
import { languageLabel } from '../teacher/curriculum.js'
import { askForExplanation, runToCompletion } from '../services/api.js'
import { completeLearnerActivity } from '../services/learnerPortal.js'
import { useLearnerLesson } from './useLearnerLesson.js'
import { translate, translateMaterial } from './translations.js'

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
  const [localTranslation, setLocalTranslation] = useState(false)
  const [helping, setHelping] = useState(null) // current kid-friendly status while agents work
  const [helpError, setHelpError] = useState('')

  useEffect(() => {
    setMaterial(lesson?.material || null)
    setLocalTranslation(lesson?.note === 'local_translation')
  }, [lesson])
  const localizedMaterial = translateMaterial(material, lang)

  const explainAgain = async (style) => {
    setHelpError('')
    setHelping('Asking Mothusi for help…')
    try {
      const runId = await askForExplanation({
        runId: lesson.run_id, code: profile?.code, language: lang, style, interests: profile?.interests || [],
      })
      const run = await runToCompletion(runId, (e) => { if (KID_STEP[e.agent]) setHelping(KID_STEP[e.agent]) })
      if (run.status === 'failed') throw new Error(run.error)
      const translatedMaterial = translateMaterial(run.result.material, lang)
      setMaterial(translatedMaterial)
      setLocalTranslation(JSON.stringify(translatedMaterial) !== JSON.stringify(run.result.material))
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

  if (loading) return <p className="l-note">{translate(lang, 'Getting your lesson ready…')}</p>
  if (error) return <p className="l-note" role="alert">{translate(lang, 'We cannot load your lesson right now. Please ask your teacher.')}</p>
  if (lesson && !material) return <p className="l-note">{translate(lang, 'Getting your lesson ready…')}</p>
  if (!lesson) {
    return (
      <div className="l-empty">
        <span aria-hidden="true">▤</span>
        <h2>{translate(lang, 'No lessons yet')}</h2>
        <p>{translate(lang, 'Your teacher has not shared a lesson yet. Check again soon!')}</p>
        <Link className="btn" to="/learner">{translate(lang, 'Back to home')}</Link>
      </div>
    )
  }

  const visual = material.practice.flatMap((q) => q.options).find((o) => o.fraction)?.fraction

  return (
    <div className="stack l-page">
      <header className="l-page-heading">
        <span className="l-eyebrow">{lesson.subject.toUpperCase()} • {lesson.grade.toUpperCase()}</span>
        <h1>{localizedMaterial.title}</h1>
      </header>

      {lesson.note === 'language_unavailable' && lang !== 'en' && !localTranslation && (
        <p className="l-note" role="status">
          {translate(lang, 'This lesson is not ready in {language} yet. We are showing it in English while a person checks the translation.', { language: languageLabel(lang) })}
        </p>
      )}
      {lesson.note === 'translated_ai_draft' && (
        <p className="l-note" role="status">
          {translate(lang, 'This lesson’s {language} translation was checked by a reviewer.', { language: languageLabel(lang) })}
          {' '}{translate(lang, 'The lesson title and objective were written by your teacher and stay in their original language.')}
        </p>
      )}
      {localTranslation && (
        <p className="l-note" role="status">
          {translate(lang, 'This lesson has some locally translated built-in text. Any text without a local translation, including teacher-written titles and objectives, stays in its original language.')}
        </p>
      )}

      <ol className="l-steps" aria-label={translate(lang, 'Lesson steps')}>
        {STEPS.map((s, i) => (
          <li key={s} className={i === step ? 'current' : i < step ? 'done' : ''}>
            <button onClick={() => setStep(i)} aria-current={i === step ? 'step' : undefined}>{translate(lang, s)}</button>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <section className="card l-learn">
          <div className="stack">
            <div>{localizedMaterial.explanation.map((line, i) => <p key={i}>{translate(lang, line)}</p>)}</div>
            <p className="l-example">{translate(lang, localizedMaterial.everyday_example)}</p>
            {helping ? (
              <p className="l-note" role="status" aria-live="polite">{translate(lang, helping)}</p>
            ) : (
              <div className="stack">
                <p className="muted">{translate(lang, 'Want another way?')}</p>
                <div className="row">
                  {STYLES.map((s) => (
                    <button key={s.key} className="btn secondary" onClick={() => explainAgain(s.key)}>{translate(lang, s.label)}</button>
                  ))}
                </div>
              </div>
            )}
            {helpError && <p className="l-note" role="alert">{helpError}</p>}
            <div className="row">
              <button className="btn" onClick={() => setStep(1)} disabled={!!helping}>{translate(lang, 'Next')}</button>
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
          <h2>{translate(lang, 'Try it with real things')}</h2>
          <p>{translate(lang, localizedMaterial.activity)}</p>
          <div className="row">
            <button className="btn secondary" onClick={() => setStep(0)}>{translate(lang, 'Back')}</button>
            <button className="btn" onClick={() => setStep(2)}>{translate(lang, 'I tried it')}</button>
          </div>
        </section>
      )}

      {step === 2 && <Practice key={localizedMaterial.title} questions={localizedMaterial.practice} lang={lang} onDone={() => completeLearnerActivity(lesson)} />}
    </div>
  )
}

function Practice({ questions, lang, onDone }) {
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
      <h2>{translate(lang, 'Question {number} of {total}', { number: qi + 1, total: questions.length })}</h2>
      <p className="l-question">{translate(lang, q.prompt)}</p>
      <div className="l-options" role="group" aria-label={translate(lang, 'Answer choices')}>
        {q.options.map((o, i) => (
          <button
            key={i}
            className={`l-option ${picked === i ? (i === q.answer_index ? 'right' : 'try') : ''}`}
            onClick={() => setPicked(i)}
            aria-label={o.fraction ? translate(lang, '{count} of {parts} parts shaded', { count: o.fraction.shaded, parts: o.fraction.parts }) : translate(lang, o.text)}
          >
            {o.fraction ? <FractionCircle parts={o.fraction.parts} shaded={o.fraction.shaded} size={110} /> : <span className="l-option-text">{translate(lang, o.text)}</span>}
          </button>
        ))}
      </div>

      {picked !== null && (
        <div className={`l-feedback ${correct ? 'right' : 'try'}`} role="status">
          {correct ? translate(lang, 'Well done! You found it.') : translate(lang, q.hint ? 'Good try. {hint}' : 'Good try.', { hint: translate(lang, q.hint) || translate(lang, 'Look again and try another answer.') })}
        </div>
      )}

      {picked !== null && correct && !last && <button className="btn" onClick={next}>{translate(lang, 'Next question')}</button>}
      {picked !== null && correct && last && <p className="l-done">{translate(lang, 'You finished today’s practice. Great work!')}</p>}
    </section>
  )
}
