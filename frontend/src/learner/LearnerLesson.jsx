import { useEffect, useRef, useState } from 'react'
import { Link, useOutletContext, useSearchParams } from 'react-router-dom'
import FractionCircle from '../components/FractionCircle.jsx'
import { languageLabel } from '../teacher/curriculum.js'
import { askForExplanation, recordActivity, runToCompletion } from '../services/api.js'
import PracticeSession from './PracticeSession.jsx'
import ReadAloud from './ReadAloud.jsx'
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
  const { loading, lesson, error } = useLearnerLesson(lang, params.get('lesson'))
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
  // Tell the teacher this learner opened the lesson (counted once per learner).
  useEffect(() => {
    if (lesson?.run_id) recordActivity(lesson.run_id, 'opened', { topic: lesson.topic })
  }, [lesson?.run_id])
  const localizedMaterial = lesson?.offline_demo ? translateMaterial(material, lang) : material

  const explainAgain = async (style) => {
    setHelpError('')
    setHelping('Asking Mothusi for help…')
    try {
      const runId = await askForExplanation({
        runId: lesson.run_id, language: lang, style, interests: profile?.interests || [],
      })
      const run = await runToCompletion(runId, (e) => { if (KID_STEP[e.agent]) setHelping(KID_STEP[e.agent]) }, { learner: true })
      if (run.status === 'failed') throw new Error(run.error)
      const translatedMaterial = lesson.offline_demo ? translateMaterial(run.result.material, lang) : run.result.material
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
  const contentLang = localTranslation ? lang : lesson.language || 'en'
  const readText = [localizedMaterial.title, ...localizedMaterial.explanation, localizedMaterial.everyday_example].join(' ')

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
            <div>{localizedMaterial.explanation.map((line, i) => <p key={i}>{line}</p>)}</div>
            <ReadAloud text={readText} lang={lang} contentLang={contentLang} />
            <p className="l-example">{localizedMaterial.everyday_example}</p>
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
          <p>{localizedMaterial.activity}</p>
          <ReadAloud text={localizedMaterial.activity} lang={lang} contentLang={contentLang} />
          <div className="row">
            <button className="btn secondary" onClick={() => setStep(0)}>{translate(lang, 'Back')}</button>
            <button className="btn" onClick={() => setStep(2)}>{translate(lang, 'I tried it')}</button>
          </div>
        </section>
      )}

      {step === 2 && <PracticeSession key={localizedMaterial.title} lesson={lesson} questions={localizedMaterial.practice} lang={lang} contentLang={contentLang} />}
    </div>
  )
}
