import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import FractionCircle from '../components/FractionCircle.jsx'
import { lessonText, practice } from '../services/mockData.js'

const STEPS = ['Learn', 'Try it', 'Practice']

export default function LearnerLesson() {
  const { lang } = useOutletContext()
  const [step, setStep] = useState(0)

  // Fall back to English until a reviewed translation exists for the chosen language.
  const text = lessonText[lang] || lessonText.en
  const missing = !lessonText[lang]

  return (
    <div className="stack">
      <h1>{text.title}</h1>

      {missing && (
        <p className="l-note" role="status">
          This lesson is not available in your language yet. We are showing it in English while the translation is checked.
        </p>
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
          <div>
            {text.explain.map((line, i) => <p key={i}>{line}</p>)}
            <div className="row">
              <button className="btn secondary">Explain it another way</button>
              <button className="btn" onClick={() => setStep(1)}>Next</button>
            </div>
          </div>
          <div className="l-fractions" aria-hidden="true">
            <FractionCircle parts={4} shaded={1} />
            <span className="l-frac-label">1/4</span>
          </div>
        </section>
      )}

      {step === 1 && (
        <section className="card stack">
          <h2>Try it with real things</h2>
          <p>{text.task}</p>
          <div className="row">
            <button className="btn secondary" onClick={() => setStep(0)}>Back</button>
            <button className="btn" onClick={() => setStep(2)}>I tried it</button>
          </div>
        </section>
      )}

      {step === 2 && <Practice />}
    </div>
  )
}

function Practice() {
  const [qi, setQi] = useState(0)
  const [picked, setPicked] = useState(null)
  const q = practice[qi]
  const correct = picked === q.answer
  const last = qi === practice.length - 1

  const next = () => { setPicked(null); setQi((i) => i + 1) }

  return (
    <section className="card stack">
      <h2>Question {qi + 1} of {practice.length}</h2>
      <p className="l-question">{q.prompt}</p>
      <div className="l-options" role="group" aria-label="Answer choices">
        {q.options.map((o, i) => (
          <button
            key={i}
            className={`l-option ${picked === i ? (i === q.answer ? 'right' : 'try') : ''}`}
            onClick={() => setPicked(i)}
            aria-label={`${o.shaded} of ${o.parts} parts shaded`}
          >
            <FractionCircle parts={o.parts} shaded={o.shaded} size={110} />
          </button>
        ))}
      </div>

      {picked !== null && (
        <div className={`l-feedback ${correct ? 'right' : 'try'}`} role="status">
          {correct
            ? 'Well done! You found it.'
            : 'Good try. Count the shaded parts, then count all the parts. Try another picture.'}
        </div>
      )}

      {picked !== null && correct && !last && <button className="btn" onClick={next}>Next question</button>}
      {picked !== null && correct && last && <p className="l-done">You finished today's practice. Great work!</p>}
    </section>
  )
}
