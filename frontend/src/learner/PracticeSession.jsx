import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import FractionCircle from '../components/FractionCircle.jsx'
import { recordActivity } from '../services/api.js'
import { translate } from './translations.js'
import ReadAloud from './ReadAloud.jsx'

// The one practice experience, used inside a lesson and on the Practice page. Answers, the finished practice and
// the learner's reflection are sent to the teacher's class insights and to the Progress Tracker as evidence.
const FEELINGS = ['Easy', 'Just right', 'Difficult']
const HELPED = ['Pictures', 'Short steps', 'Practical example', 'My language']

export default function PracticeSession({ lesson, questions, lang, contentLang = 'en', onFinished }) {
  const [index, setIndex] = useState(0)
  const [selected, setSelected] = useState(null)
  const [checked, setChecked] = useState(false)
  const [hint, setHint] = useState(false)
  const [finished, setFinished] = useState(false)
  const firstTry = useRef(0)
  const attempts = useRef({})

  const topic = lesson.topic
  const question = questions[index]
  const isCorrect = selected === question?.answer_index
  const isLast = index === questions.length - 1

  const check = () => {
    const attempt = (attempts.current[index] || 0) + 1
    attempts.current[index] = attempt
    const correct = selected === question.answer_index
    if (correct && attempt === 1) firstTry.current += 1
    setChecked(true)
    recordActivity(lesson.run_id, 'answer', { question: index, prompt: question.prompt.slice(0, 200), correct, attempt, topic })
  }

  const next = () => {
    if (isLast) {
      setFinished(true)
      recordActivity(lesson.run_id, 'practice_done', { score: firstTry.current, total: questions.length, topic })
      onFinished?.()
      return
    }
    setIndex((i) => i + 1)
    setSelected(null)
    setChecked(false)
    setHint(false)
  }

  if (!questions.length) return null
  if (finished) return <Finished lesson={lesson} lang={lang} total={questions.length} firstTry={firstTry.current} />

  return (
    <section className="l-panel l-question-panel" aria-labelledby="l-question">
      <span className="l-eyebrow">{translate(lang, 'QUESTION {current} OF {total}', { current: index + 1, total: questions.length })}</span>
      <h2 id="l-question">{question.prompt}</h2>
      <ReadAloud text={question.prompt} lang={lang} contentLang={contentLang} />
      <div className="l-practice-options" role="group" aria-label={translate(lang, 'Answer choices')}>
        {question.options.map((option, i) => (
          <button key={i} type="button"
            className={`l-practice-option${selected === i ? ' selected' : ''}${checked && selected === i ? (isCorrect ? ' correct' : ' incorrect') : ''}`}
            onClick={() => { if (!(checked && isCorrect)) { setSelected(i); setChecked(false) } }}
            aria-pressed={selected === i}
            aria-label={option.fraction ? translate(lang, '{count} of {parts} parts shaded', { count: option.fraction.shaded, parts: option.fraction.parts }) : option.text}>
            {option.fraction && <FractionCircle parts={option.fraction.parts} shaded={option.fraction.shaded} size={104} />}
            {option.text && <span>{option.text}</span>}
          </button>
        ))}
      </div>
      <div className="row">
        {question.hint && !checked && (
          <button type="button" className="btn secondary" onClick={() => setHint(!hint)} aria-expanded={hint}>
            {translate(lang, hint ? 'Hide hint' : 'Show me a hint')}
          </button>
        )}
        {!checked && <button type="button" className="btn" disabled={selected === null} onClick={check}>{translate(lang, 'Check answer')}</button>}
      </div>
      {hint && !checked && <aside className="l-info-note"><strong>{translate(lang, 'A little hint')}</strong><p>{question.hint}</p></aside>}
      {checked && (
        <div className={`l-feedback ${isCorrect ? 'right' : 'try'}`} role="status">
          <strong>{translate(lang, isCorrect ? 'You got it!' : 'Good try. Have another look.')}</strong>
          {!isCorrect && question.hint && <p>{question.hint}</p>}
          {isCorrect
            ? <button type="button" className="btn" onClick={next}>{translate(lang, isLast ? 'Finish practice' : 'Next question')}</button>
            : <button type="button" className="btn secondary" onClick={() => { setSelected(null); setChecked(false) }}>{translate(lang, 'Try again')}</button>}
        </div>
      )}
    </section>
  )
}

function Finished({ lesson, lang, total, firstTry }) {
  const [feeling, setFeeling] = useState('')
  const [helped, setHelped] = useState([])
  const [status, setStatus] = useState('')
  const [sent, setSent] = useState(false)

  const toggle = (value) => setHelped((h) => (h.includes(value) ? h.filter((x) => x !== value) : [...h, value]))
  const save = async () => {
    if (!feeling) return setStatus(translate(lang, 'Choose how the activity felt.'))
    const ok = await recordActivity(lesson.run_id, 'reflection', { feeling, helped, topic: lesson.topic })
    setSent(!!ok)
    setStatus(translate(lang, ok ? 'Thank you! Your teacher will see this.' : 'We could not send this just now. Please try again.'))
  }

  return (
    <div className="stack">
      <section className="l-complete-banner">
        <span aria-hidden="true">★</span>
        <div>
          <h2>{translate(lang, 'Well done, activity completed!')}</h2>
          <p>{translate(lang, 'You answered all {count} questions.', { count: total })}{' '}
            {translate(lang, '{count} right the first time.', { count: firstTry })}</p>
        </div>
      </section>
      <section className="l-panel l-reflection">
        <h2>{translate(lang, 'How did this activity feel?')}</h2>
        <div className="l-choice-row">
          {FEELINGS.map((option) => (
            <button key={option} type="button" className={`l-choice-chip${feeling === option ? ' selected' : ''}`} aria-pressed={feeling === option}
              onClick={() => setFeeling(option)} disabled={sent}>{translate(lang, option)}</button>
          ))}
        </div>
        <h2>{translate(lang, 'What helped you most?')}</h2>
        <div className="l-choice-row">
          {HELPED.map((option) => (
            <button key={option} type="button" className={`l-choice-chip${helped.includes(option) ? ' selected' : ''}`} aria-pressed={helped.includes(option)}
              onClick={() => toggle(option)} disabled={sent}>{translate(lang, option)}</button>
          ))}
        </div>
        {!sent && <button type="button" className="btn l-fit-button" onClick={save}>{translate(lang, 'Send to my teacher')}</button>}
        {status && <p className="l-inline-status" role="status">{status}</p>}
      </section>
      <Link to={`/learner/topic`} className="l-text-link">{translate(lang, 'Explore the topic another way')} <span aria-hidden="true">→</span></Link>
    </div>
  )
}
