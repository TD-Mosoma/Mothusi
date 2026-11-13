import { useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import FractionCircle from '../components/FractionCircle.jsx'
import { LANGUAGES, languageLabel } from '../teacher/curriculum.js'
import {
  completeLearnerActivity,
  getCompletedActivities,
  getLearningPreferences,
  getRecentPractice,
  getSavedLearning,
  saveLearnerReflection,
  saveLearningItems,
  saveLearningPreferences,
} from '../services/learnerPortal.js'
import { useLearnerLesson, useLearnerLessons } from './useLearnerLesson.js'

// ------------------------------------------------------------------ My lessons

export function LearnerLessons() {
  const { loading, lessons, error } = useLearnerLessons()
  return (
    <div className="stack l-page">
      <PageHeading eyebrow="YOUR CLASSROOM" title="My lessons" description="The lessons your teacher has shared with your class." />
      {loading && <p className="l-inline-status">Loading your lessons…</p>}
      {error && <InfoNote title="We cannot load your lessons">Please ask your teacher, or try again in a moment.</InfoNote>}
      {!loading && !error && lessons.length === 0 && (
        <EmptyState icon="▤" title="No lessons yet">When your teacher shares a lesson, it will appear here.</EmptyState>
      )}
      <div className="l-list">
        {lessons.map((l, i) => (
          <LessonCard key={l.run_id} title={l.topic} subject={`${l.subject} • ${l.grade}`}
            status={i === 0 ? 'Newest' : 'Shared'} to={lessonLink(l.run_id)} />
        ))}
      </div>
      <InfoNote title="How lessons appear">Your teacher plans each lesson with Mothusi and checks it before sharing it with you.</InfoNote>
    </div>
  )
}

// ------------------------------------------------------------------ Learn a topic

const METHODS = [
  { style: 'simpler', tone: 'blue', icon: '☀', title: 'Explain it', text: 'A simpler explanation in short sentences.' },
  { style: 'visual', tone: 'yellow', icon: '◉', title: 'Show me', text: 'Pictures and things you can draw.' },
  { style: 'practical', tone: 'green', icon: '✎', title: 'Let me try', text: 'Use your hands with real objects.' },
]

export function LearnerTopic() {
  const { lang, profile } = useOutletContext()
  const { loading, lesson } = useLearnerLesson(profile?.code, lang)
  const [saved, setSaved] = useState(() => getSavedLearning())
  const [notice, setNotice] = useState('')

  if (loading) return <p className="l-inline-status">Getting your lesson ready…</p>
  if (!lesson) {
    return (
      <div className="stack l-page">
        <PageHeading eyebrow="PICK YOUR PATH" title="Learn a topic" description="Explore your class topic in a way that works for you." />
        <EmptyState icon="✦" title="No topic yet">When your teacher shares a lesson, you can explore it here.</EmptyState>
      </div>
    )
  }

  const isSaved = saved.some((item) => item.id === lesson.run_id)
  const toggleSaved = () => {
    const next = isSaved
      ? saved.filter((item) => item.id !== lesson.run_id)
      : [...saved, { id: lesson.run_id, title: lesson.topic, subject: lesson.subject, type: 'Lesson' }]
    if (!saveLearningItems(next)) return setNotice('We could not save this just now. Please try again.')
    setSaved(next)
    setNotice(isSaved ? 'Removed from your saved learning.' : 'Added to your saved learning.')
  }

  return (
    <div className="stack l-page">
      <PageHeading eyebrow="PICK YOUR PATH" title={lesson.topic} description={`${lesson.subject} • ${lesson.grade}. Choose how you would like to learn it.`} />
      <div className="l-method-grid">
        {METHODS.map((m) => (
          <Link key={m.style} to={lessonLink(lesson.run_id, m.style)} className={`l-method-card method-${m.tone}`}>
            <span aria-hidden="true">{m.icon}</span><h2>{m.title}</h2><p>{m.text}</p>
          </Link>
        ))}
      </div>
      <InfoNote title="Your learning goal">{lesson.objective}</InfoNote>
      <div className="row">
        <Link className="btn" to={lessonLink(lesson.run_id)}>Start learning <span aria-hidden="true">→</span></Link>
        <button type="button" className="btn secondary" onClick={toggleSaved}>{isSaved ? '♥ Saved' : '♡ Save for later'}</button>
      </div>
      {notice && <p className="l-inline-status" role="status">{notice}</p>}
    </div>
  )
}

// ------------------------------------------------------------------ Practice

export function LearnerPractice() {
  const { lang, profile } = useOutletContext()
  const { loading, lesson } = useLearnerLesson(profile?.code, lang)
  const [questionIndex, setQuestionIndex] = useState(0)
  const [selected, setSelected] = useState(null)
  const [checked, setChecked] = useState(false)
  const [hint, setHint] = useState(false)
  const [finished, setFinished] = useState(false)
  const [completionError, setCompletionError] = useState(false)
  const [feeling, setFeeling] = useState('')
  const [helped, setHelped] = useState([])
  const [status, setStatus] = useState('')

  if (loading) return <p className="l-inline-status">Getting your practice ready…</p>
  if (!lesson) {
    return (
      <div className="stack l-page">
        <PageHeading eyebrow="PRACTICE" title="Practice" description="Short questions to check your understanding." />
        <EmptyState icon="✎" title="Nothing to practise yet">When your teacher shares a lesson, its practice questions will appear here.</EmptyState>
      </div>
    )
  }

  const questions = lesson.material.practice
  const question = questions[questionIndex]
  const isCorrect = selected === question.answer_index
  const isLast = questionIndex === questions.length - 1

  const continuePractice = () => {
    if (isLast) {
      setCompletionError(!completeLearnerActivity(lesson))
      setFinished(true)
      return
    }
    setQuestionIndex((index) => index + 1)
    setSelected(null)
    setChecked(false)
    setHint(false)
  }

  const saveReflection = () => {
    if (!feeling || helped.length === 0) return setStatus('Choose how the activity felt and what helped you most.')
    const ok = saveLearnerReflection({ lesson: lesson.run_id, feeling, helped, savedAt: new Date().toISOString() })
    setStatus(ok ? 'Thanks for sharing. Your reflection has been saved.' : 'We could not save your reflection. Please try again.')
  }

  const toggleHelped = (value) =>
    setHelped((current) => (current.includes(value) ? current.filter((item) => item !== value) : [...current, value]))

  if (finished) {
    return (
      <div className="stack l-page">
        <PageHeading eyebrow="LOOK AT YOU GO!" title="Well done, activity completed!" description="A short reflection helps you decide what to try next." />
        <section className="l-complete-banner"><span aria-hidden="true">★</span><div><h2>You practised {lesson.topic.toLowerCase()}!</h2><p>You answered all {questions.length} questions.</p></div></section>
        <div className="l-method-grid l-next-grid">
          <InfoNote title="What you practised">{lesson.objective}</InfoNote>
          <InfoNote title="Your next step">Ask Mothusi to explain it another way, then try the questions again.</InfoNote>
        </div>
        <section className="l-panel l-reflection">
          <h2>How did this activity feel?</h2>
          <div className="l-choice-row">
            {['Easy', 'Just right', 'Difficult'].map((option) => (
              <button key={option} type="button" className={`l-choice-chip${feeling === option ? ' selected' : ''}`} aria-pressed={feeling === option} onClick={() => setFeeling(option)}>{option}</button>
            ))}
          </div>
          <h2>What helped you most?</h2>
          <div className="l-choice-row">
            {['Pictures', 'Short steps', 'Practical example', 'My language'].map((option) => (
              <button key={option} type="button" className={`l-choice-chip${helped.includes(option) ? ' selected' : ''}`} aria-pressed={helped.includes(option)} onClick={() => toggleHelped(option)}>{option}</button>
            ))}
          </div>
          <button type="button" className="btn l-fit-button" onClick={saveReflection}>Save reflection</button>
          {completionError && <p className="l-inline-status" role="status">Your activity is complete, but we could not update your saved progress just now.</p>}
          {status && <p className="l-inline-status" role="status">{status}</p>}
        </section>
        <Link to="/learner/topic" className="l-text-link">Explore the topic another way <span aria-hidden="true">→</span></Link>
      </div>
    )
  }

  return (
    <div className="stack l-page">
      <PageHeading eyebrow={`QUESTION ${questionIndex + 1} OF ${questions.length}`} title={`Practise ${lesson.topic.toLowerCase()}`} description="Try one question at a time. You can ask for a hint before answering." />
      <section className="l-panel l-question-panel">
        <h2>{question.prompt}</h2>
        <div className="l-practice-options" role="group" aria-label="Answer choices">
          {question.options.map((option, index) => (
            <button key={index} type="button"
              className={`l-practice-option${selected === index ? ' selected' : ''}${checked && selected === index ? (isCorrect ? ' correct' : ' incorrect') : ''}`}
              onClick={() => { setSelected(index); setChecked(false) }} aria-pressed={selected === index}
              aria-label={option.fraction ? `${option.fraction.shaded} of ${option.fraction.parts} parts shaded` : option.text}>
              {option.fraction && <FractionCircle parts={option.fraction.parts} shaded={option.fraction.shaded} size={104} />}
              <span>{option.text}</span>
            </button>
          ))}
        </div>
        <div className="row">
          {question.hint && <button type="button" className="btn secondary" onClick={() => setHint(!hint)} aria-expanded={hint}>{hint ? 'Hide hint' : 'Show me a hint'}</button>}
          {!checked && <button type="button" className="btn" disabled={selected === null} onClick={() => setChecked(true)}>Check answer</button>}
        </div>
        {hint && <InfoNote title="A little hint">{question.hint}</InfoNote>}
        {checked && (
          <div className={`l-feedback ${isCorrect ? 'right' : 'try'}`} role="status">
            <strong>{isCorrect ? 'You got it!' : 'Good try. Have another look.'}</strong>
            {!isCorrect && question.hint && <p>{question.hint}</p>}
            {isCorrect
              ? <button type="button" className="btn" onClick={continuePractice}>{isLast ? 'Finish practice' : 'Next question'}</button>
              : <button type="button" className="btn secondary" onClick={() => { setSelected(null); setChecked(false) }}>Try again</button>}
          </div>
        )}
      </section>
    </div>
  )
}

// ------------------------------------------------------------------ Progress

export function LearnerProgress() {
  const { lessons } = useLearnerLessons()
  const completed = getCompletedActivities()
  const recent = getRecentPractice()
  return (
    <div className="stack l-page">
      <PageHeading eyebrow="YOUR PROGRESS" title="My learning progress" description="See what you have practised and what you may want to try next." />
      <div className="l-stats l-progress-stats">
        <StatCard label="LESSONS SHARED" value={lessons.length} tone="blue" />
        <StatCard label="ACTIVITIES DONE" value={completed} tone="yellow" />
        <StatCard label="RECENT PRACTICE" value={recent?.title || 'Not yet'} tone="green" />
        <StatCard label="NEXT STEP" value={completed ? 'Try it another way' : 'Start practising'} tone="pink" />
      </div>
      <div className="l-method-grid l-progress-grid">
        <InfoNote title="What is going well">{completed ? `You have finished ${completed} practice ${completed === 1 ? 'activity' : 'activities'}. Great work sticking with it!` : 'Start a short activity and your progress will show here.'}</InfoNote>
        <InfoNote title="What to practise next">Ask for an explanation with pictures or real objects, then try the questions again.</InfoNote>
      </div>
      <InfoNote title="A note about progress">Progress is a learning aid, not a label or diagnosis. Your teacher can help choose what to practise next.</InfoNote>
      <Link to="/learner/practice" className="btn l-fit-button">Practise now <span aria-hidden="true">→</span></Link>
    </div>
  )
}

// ------------------------------------------------------------------ Saved learning

export function LearnerSaved() {
  const [items, setItems] = useState(getSavedLearning())
  const [status, setStatus] = useState('')

  const removeItem = (id) => {
    const next = items.filter((item) => item.id !== id)
    if (!saveLearningItems(next)) return setStatus('We could not update your saved learning. Please try again.')
    setItems(next)
    setStatus('Removed from your saved learning.')
  }

  return (
    <div className="stack l-page">
      <PageHeading eyebrow="YOUR FAVOURITES" title="My saved learning" description="Return to lessons you want to use again." />
      {items.length > 0
        ? <div className="l-list">{items.map((item) => (
            <LessonCard key={item.id} title={item.title} subject={`${item.subject} • ${item.type}`} status="Saved"
              to={lessonLink(item.id)} onRemove={() => removeItem(item.id)} />
          ))}</div>
        : <EmptyState icon="♡" title="No saved learning yet" action={<Link className="btn" to="/learner/topic">Explore a topic</Link>}>Save a lesson and it will be waiting here for you.</EmptyState>}
      {status && <p className="l-inline-status" role="status">{status}</p>}
    </div>
  )
}

// ------------------------------------------------------------------ Preferences

const STYLES = [
  { id: 'pictures', label: 'Pictures and diagrams' },
  { id: 'shortSteps', label: 'Short steps' },
  { id: 'practical', label: 'Practical examples' },
]

export function LearnerPreferences() {
  const { lang, setLang } = useOutletContext()
  const [preferences, setPreferences] = useState(getLearningPreferences())
  const [status, setStatus] = useState('')

  const toggleStyle = (id) => setPreferences((current) => ({
    ...current,
    styles: current.styles.includes(id) ? current.styles.filter((style) => style !== id) : [...current.styles, id],
  }))

  const save = () => {
    setStatus(saveLearningPreferences(preferences) ? 'Your learning preferences are saved.' : 'We could not save your preferences. Please try again.')
  }

  return (
    <div className="stack l-page">
      <PageHeading eyebrow="MAKE IT YOURS" title="Language & learning preferences" description="Choose how you would like Mothusi to present your lessons." />
      <section className="l-panel l-preferences-grid">
        <label className="l-field"><span>My learning language</span>
          <select value={lang} onChange={(event) => setLang(event.target.value)}>
            {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </label>
        <label className="l-field"><span>Text size</span>
          <select value={preferences.textSize} onChange={(event) => setPreferences((current) => ({ ...current, textSize: event.target.value }))}>
            <option value="normal">Normal</option>
            <option value="large">Large</option>
          </select>
        </label>
        <fieldset className="l-preference-group"><legend>How I like to learn</legend>
          {STYLES.map((style) => (
            <label key={style.id}><input type="checkbox" checked={preferences.styles.includes(style.id)} onChange={() => toggleStyle(style.id)} />{style.label}</label>
          ))}
        </fieldset>
      </section>
      <InfoNote title="Language quality">Mothusi checks every translation and shows a lesson in English until its translation passes. A person who speaks the language should still read it.</InfoNote>
      <button type="button" className="btn l-fit-button" onClick={save}>Save preferences</button>
      {status && <p className="l-inline-status" role="status">{status}</p>}
    </div>
  )
}

// ------------------------------------------------------------------ Profile

export function LearnerProfile() {
  const { profile } = useOutletContext()
  const preferences = getLearningPreferences()
  const selectedStyles = STYLES.filter((s) => preferences.styles.includes(s.id)).map((s) => s.label)
  const p = profile || {}

  return (
    <div className="stack l-page">
      <PageHeading eyebrow="YOUR PROFILE" title="My learner profile" description="Your learning details and preferences. School details are managed by your teacher." />
      <section className="l-panel l-profile-card">
        <div className="l-profile-avatar" aria-hidden="true">{p.fullName?.trim()?.[0]?.toUpperCase() || 'L'}</div>
        <div className="l-profile-details">
          <ProfileDetail label="Display name" value={p.fullName || 'Learner'} />
          <ProfileDetail label="Grade" value={p.grade || 'Not set'} />
          <ProfileDetail label="Age" value={p.age ? `${p.age} years old` : 'Not set'} />
          <ProfileDetail label="Learner code" value={p.code || 'Not added'} />
          <ProfileDetail label="Learning language" value={languageLabel(p.language || 'en')} />
          <ProfileDetail label="Learning preferences" value={selectedStyles.length ? selectedStyles.join(' • ') : 'Choose what helps you learn'} />
        </div>
      </section>
      <InfoNote title="Privacy & safety">You can update your language and learning preferences. School, class and teacher details are managed by authorised school staff.</InfoNote>
      <Link className="btn l-fit-button" to="/learner/preferences">Update preferences</Link>
    </div>
  )
}

// ------------------------------------------------------------------ shared pieces

const lessonLink = (runId, style) => {
  const q = new URLSearchParams({ lesson: runId, ...(style ? { style } : {}) })
  return `/learner/lesson?${q}`
}

function PageHeading({ eyebrow, title, description }) {
  return <header className="l-page-heading"><span className="l-eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></header>
}

function LessonCard({ title, subject, status, to, onRemove }) {
  return (
    <article className="l-lesson-card">
      <span className="l-lesson-icon" aria-hidden="true">✦</span>
      <div className="l-lesson-copy"><h2>{title}</h2><p>{subject}</p></div>
      <span className="l-status-pill">{status}</span>
      {to && <Link className="l-open-link" to={to}>Open <span aria-hidden="true">→</span></Link>}
      {onRemove && <button type="button" className="l-open-link" onClick={onRemove}>Remove</button>}
    </article>
  )
}

function EmptyState({ icon, title, children, action }) {
  return <div className="l-empty"><span aria-hidden="true">{icon}</span><h2>{title}</h2><p>{children}</p>{action}</div>
}

function StatCard({ label, value, tone }) {
  return <div className={`l-stat-card stat-${tone}`}><span className="l-stat-label">{label}</span><strong>{value}</strong></div>
}

function ProfileDetail({ label, value }) {
  return <div className="l-profile-detail"><span>{label}</span><strong>{value}</strong></div>
}

function InfoNote({ title, children }) {
  return <aside className="l-info-note"><strong>{title}</strong><p>{children}</p></aside>
}
