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
import { translate } from './translations.js'

// ------------------------------------------------------------------ My lessons

export function LearnerLessons() {
  const { lang } = useOutletContext()
  const { loading, lessons, error } = useLearnerLessons()
  return (
    <div className="stack l-page">
      <PageHeading lang={lang} eyebrow="YOUR CLASSROOM" title="My lessons" description="The lessons your teacher has shared with your class." />
      {loading && <p className="l-inline-status">{translate(lang, 'Loading your lessons…')}</p>}
      {error && <InfoNote lang={lang} title="We cannot load your lessons">Please ask your teacher, or try again in a moment.</InfoNote>}
      {!loading && !error && lessons.length === 0 && (
        <EmptyState lang={lang} icon="▤" title="No lessons yet">When your teacher shares a lesson, it will appear here.</EmptyState>
      )}
      <div className="l-list">
        {lessons.map((l, i) => (
          <LessonCard lang={lang} key={l.run_id} title={l.topic} subject={`${l.subject} • ${l.grade}`}
            status={i === 0 ? 'Newest' : 'Shared'} to={lessonLink(l.run_id)} />
        ))}
      </div>
      <InfoNote lang={lang} title="How lessons appear">Your teacher plans each lesson with Mothusi and checks it before sharing it with you.</InfoNote>
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

  if (loading) return <p className="l-inline-status">{translate(lang, 'Getting your lesson ready…')}</p>
  if (!lesson) {
    return (
      <div className="stack l-page">
        <PageHeading lang={lang} eyebrow="PICK YOUR PATH" title="Learn a topic" description="Explore your class topic in a way that works for you." />
        <EmptyState lang={lang} icon="✦" title="No topic yet">When your teacher shares a lesson, you can explore it here.</EmptyState>
      </div>
    )
  }

  const isSaved = saved.some((item) => item.id === lesson.run_id)
  const toggleSaved = () => {
    const next = isSaved
      ? saved.filter((item) => item.id !== lesson.run_id)
      : [...saved, { id: lesson.run_id, title: lesson.topic, subject: lesson.subject, type: 'Lesson' }]
    if (!saveLearningItems(next)) return setNotice(translate(lang, 'We could not save this just now. Please try again.'))
    setSaved(next)
    setNotice(translate(lang, isSaved ? 'Removed from your saved learning.' : 'Added to your saved learning.'))
  }

  return (
    <div className="stack l-page">
      <PageHeading lang={lang} eyebrow="PICK YOUR PATH" title={lesson.topic} description={`${lesson.subject} • ${lesson.grade}. ${translate(lang, 'Choose how you would like to learn it.')}`} />
      <div className="l-method-grid">
        {METHODS.map((m) => (
          <Link key={m.style} to={lessonLink(lesson.run_id, m.style)} className={`l-method-card method-${m.tone}`}>
            <span aria-hidden="true">{m.icon}</span><h2>{translate(lang, m.title)}</h2><p>{translate(lang, m.text)}</p>
          </Link>
        ))}
      </div>
      <InfoNote lang={lang} title="Your learning goal" translateContent={false}>{lesson.objective}</InfoNote>
      <div className="row">
        <Link className="btn" to={lessonLink(lesson.run_id)}>{translate(lang, 'Start learning')} <span aria-hidden="true">→</span></Link>
        <button type="button" className="btn secondary" onClick={toggleSaved}>{isSaved ? `♥ ${translate(lang, 'Saved')}` : `♡ ${translate(lang, 'Save for later')}`}</button>
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

  if (loading) return <p className="l-inline-status">{translate(lang, 'Getting your lesson ready…')}</p>
  if (!lesson) {
    return (
      <div className="stack l-page">
        <PageHeading lang={lang} eyebrow="PRACTICE" title="Practice" description="Short questions to check your understanding." />
        <EmptyState lang={lang} icon="✎" title="Nothing to practise yet">When your teacher shares a lesson, its practice questions will appear here.</EmptyState>
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
    if (!feeling || helped.length === 0) return setStatus(translate(lang, 'Choose how the activity felt and what helped you most.'))
    const ok = saveLearnerReflection({ lesson: lesson.run_id, feeling, helped, savedAt: new Date().toISOString() })
    setStatus(translate(lang, ok ? 'Thanks for sharing. Your reflection has been saved.' : 'We could not save your reflection. Please try again.'))
  }

  const toggleHelped = (value) =>
    setHelped((current) => (current.includes(value) ? current.filter((item) => item !== value) : [...current, value]))

  if (finished) {
    return (
      <div className="stack l-page">
        <PageHeading lang={lang} eyebrow="LOOK AT YOU GO!" title="Well done, activity completed!" description="A short reflection helps you decide what to try next." />
        <section className="l-complete-banner"><span aria-hidden="true">★</span><div><h2>{translate(lang, 'You practised {topic}!', { topic: lesson.topic.toLowerCase() })}</h2><p>{translate(lang, 'You answered all {count} questions.', { count: questions.length })}</p></div></section>
        <div className="l-method-grid l-next-grid">
          <InfoNote lang={lang} title="What you practised" translateContent={false}>{lesson.objective}</InfoNote>
          <InfoNote lang={lang} title="Your next step">Ask Mothusi to explain it another way, then try the questions again.</InfoNote>
        </div>
        <section className="l-panel l-reflection">
          <h2>{translate(lang, 'How did this activity feel?')}</h2>
          <div className="l-choice-row">
            {['Easy', 'Just right', 'Difficult'].map((option) => (
              <button key={option} type="button" className={`l-choice-chip${feeling === option ? ' selected' : ''}`} aria-pressed={feeling === option} onClick={() => setFeeling(option)}>{translate(lang, option)}</button>
            ))}
          </div>
          <h2>{translate(lang, 'What helped you most?')}</h2>
          <div className="l-choice-row">
            {['Pictures', 'Short steps', 'Practical example', 'My language'].map((option) => (
              <button key={option} type="button" className={`l-choice-chip${helped.includes(option) ? ' selected' : ''}`} aria-pressed={helped.includes(option)} onClick={() => toggleHelped(option)}>{translate(lang, option)}</button>
            ))}
          </div>
          <button type="button" className="btn l-fit-button" onClick={saveReflection}>{translate(lang, 'Save reflection')}</button>
          {completionError && <p className="l-inline-status" role="status">{translate(lang, 'Your activity is complete, but we could not update your saved progress just now.')}</p>}
          {status && <p className="l-inline-status" role="status">{status}</p>}
        </section>
        <Link to="/learner/topic" className="l-text-link">{translate(lang, 'Explore the topic another way')} <span aria-hidden="true">→</span></Link>
      </div>
    )
  }

  return (
    <div className="stack l-page">
      <PageHeading lang={lang} eyebrow={translate(lang, 'QUESTION {current} OF {total}', { current: questionIndex + 1, total: questions.length })} title={translate(lang, 'Practise {topic}', { topic: lesson.topic.toLowerCase() })} description="Try one question at a time. You can ask for a hint before answering." />
      <section className="l-panel l-question-panel">
      <h2>{translate(lang, question.prompt)}</h2>
      <div className="l-practice-options" role="group" aria-label={translate(lang, 'Answer choices')}>
          {question.options.map((option, index) => (
            <button key={index} type="button"
              className={`l-practice-option${selected === index ? ' selected' : ''}${checked && selected === index ? (isCorrect ? ' correct' : ' incorrect') : ''}`}
              onClick={() => { setSelected(index); setChecked(false) }} aria-pressed={selected === index}
              aria-label={option.fraction ? translate(lang, '{count} of {parts} parts shaded', { count: option.fraction.shaded, parts: option.fraction.parts }) : translate(lang, option.text)}>
              {option.fraction && <FractionCircle parts={option.fraction.parts} shaded={option.fraction.shaded} size={104} />}
              <span>{translate(lang, option.text)}</span>
            </button>
          ))}
        </div>
        <div className="row">
          {question.hint && <button type="button" className="btn secondary" onClick={() => setHint(!hint)} aria-expanded={hint}>{translate(lang, hint ? 'Hide hint' : 'Show me a hint')}</button>}
          {!checked && <button type="button" className="btn" disabled={selected === null} onClick={() => setChecked(true)}>{translate(lang, 'Check answer')}</button>}
        </div>
        {hint && <InfoNote lang={lang} title="A little hint">{translate(lang, question.hint)}</InfoNote>}
        {checked && (
          <div className={`l-feedback ${isCorrect ? 'right' : 'try'}`} role="status">
            <strong>{translate(lang, isCorrect ? 'You got it!' : 'Good try. Have another look.')}</strong>
            {!isCorrect && question.hint && <p>{translate(lang, question.hint)}</p>}
            {isCorrect
              ? <button type="button" className="btn" onClick={continuePractice}>{translate(lang, isLast ? 'Finish practice' : 'Next question')}</button>
              : <button type="button" className="btn secondary" onClick={() => { setSelected(null); setChecked(false) }}>{translate(lang, 'Try again')}</button>}
          </div>
        )}
      </section>
    </div>
  )
}

// ------------------------------------------------------------------ Progress

export function LearnerProgress() {
  const { lang } = useOutletContext()
  const { lessons } = useLearnerLessons()
  const completed = getCompletedActivities()
  const recent = getRecentPractice()
  return (
    <div className="stack l-page">
      <PageHeading lang={lang} eyebrow="YOUR PROGRESS" title="My learning progress" description="See what you have practised and what you may want to try next." />
      <div className="l-stats l-progress-stats">
        <StatCard lang={lang} label="LESSONS SHARED" value={lessons.length} tone="blue" />
        <StatCard lang={lang} label="ACTIVITIES DONE" value={completed} tone="yellow" />
        <StatCard lang={lang} label="RECENT PRACTICE" value={recent?.title || 'Not yet'} tone="green" />
        <StatCard lang={lang} label="NEXT STEP" value={translate(lang, completed ? 'Try it another way' : 'Start practising')} tone="pink" />
      </div>
      <div className="l-method-grid l-progress-grid">
        <InfoNote lang={lang} title="What is going well">{completed ? translate(lang, 'You have finished {count} practice {activity}. Great work sticking with it!', { count: completed, activity: translate(lang, completed === 1 ? 'activity' : 'activities') }) : translate(lang, 'Start a short activity and your progress will show here.')}</InfoNote>
        <InfoNote lang={lang} title="What to practise next">Ask for an explanation with pictures or real objects, then try the questions again.</InfoNote>
      </div>
      <InfoNote lang={lang} title="A note about progress">Progress is a learning aid, not a label or diagnosis. Your teacher can help choose what to practise next.</InfoNote>
      <Link to="/learner/practice" className="btn l-fit-button">{translate(lang, 'Practise now')} <span aria-hidden="true">→</span></Link>
    </div>
  )
}

// ------------------------------------------------------------------ Saved learning

export function LearnerSaved() {
  const { lang } = useOutletContext()
  const [items, setItems] = useState(getSavedLearning())
  const [status, setStatus] = useState('')

  const removeItem = (id) => {
    const next = items.filter((item) => item.id !== id)
    if (!saveLearningItems(next)) return setStatus(translate(lang, 'We could not update your saved learning. Please try again.'))
    setItems(next)
    setStatus(translate(lang, 'Removed from your saved learning.'))
  }

  return (
    <div className="stack l-page">
      <PageHeading lang={lang} eyebrow="YOUR FAVOURITES" title="My saved learning" description="Return to lessons you want to use again." />
      {items.length > 0
        ? <div className="l-list">{items.map((item) => (
            <LessonCard lang={lang} key={item.id} title={item.title} subject={`${item.subject} • ${item.type}`} status="Saved"
              to={lessonLink(item.id)} onRemove={() => removeItem(item.id)} />
          ))}</div>
        : <EmptyState lang={lang} icon="♡" title="No saved learning yet" action={<Link className="btn" to="/learner/topic">{translate(lang, 'Explore a topic')}</Link>}>{translate(lang, 'Save a lesson and it will be waiting here for you.')}</EmptyState>}
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
    setStatus(translate(lang, saveLearningPreferences(preferences) ? 'Your learning preferences are saved.' : 'We could not save your preferences. Please try again.'))
  }

  return (
    <div className="stack l-page">
      <PageHeading lang={lang} eyebrow="MAKE IT YOURS" title="Language & learning preferences" description="Choose how you would like Mothusi to present your lessons." />
      <section className="l-panel l-preferences-grid">
        <label className="l-field"><span>{translate(lang, 'My learning language')}</span>
          <select value={lang} onChange={(event) => setLang(event.target.value)}>
            {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </label>
        <label className="l-field"><span>{translate(lang, 'Text size')}</span>
          <select value={preferences.textSize} onChange={(event) => setPreferences((current) => ({ ...current, textSize: event.target.value }))}>
            <option value="normal">{translate(lang, 'Normal')}</option>
            <option value="large">{translate(lang, 'Large')}</option>
          </select>
        </label>
        <fieldset className="l-preference-group"><legend>{translate(lang, 'How I like to learn')}</legend>
          {STYLES.map((style) => (
            <label key={style.id}><input type="checkbox" checked={preferences.styles.includes(style.id)} onChange={() => toggleStyle(style.id)} />{translate(lang, style.label)}</label>
          ))}
        </fieldset>
      </section>
      <InfoNote lang={lang} title="Language quality">This portal has built-in translations for some lesson text. Other text without a translation, especially teacher-written titles and objectives, stays in its original language.</InfoNote>
      <button type="button" className="btn l-fit-button" onClick={save}>{translate(lang, 'Save preferences')}</button>
      {status && <p className="l-inline-status" role="status">{status}</p>}
    </div>
  )
}

// ------------------------------------------------------------------ Profile

export function LearnerProfile() {
  const { lang, profile } = useOutletContext()
  const preferences = getLearningPreferences()
  const selectedStyles = STYLES.filter((s) => preferences.styles.includes(s.id)).map((s) => translate(lang, s.label))
  const p = profile || {}

  return (
    <div className="stack l-page">
      <PageHeading lang={lang} eyebrow="YOUR PROFILE" title="My learner profile" description="Your learning details and preferences. School details are managed by your teacher." />
      <section className="l-panel l-profile-card">
        <div className="l-profile-avatar" aria-hidden="true">{p.fullName?.trim()?.[0]?.toUpperCase() || 'L'}</div>
        <div className="l-profile-details">
          <ProfileDetail lang={lang} label="Display name" value={p.fullName || 'Learner'} />
          <ProfileDetail lang={lang} label="Grade" value={p.grade || 'Not set'} />
          <ProfileDetail lang={lang} label="Age" value={p.age ? translate(lang, '{count} years old', { count: p.age }) : translate(lang, 'Not set')} />
          <ProfileDetail lang={lang} label="Learner code" value={p.code || translate(lang, 'Not added')} />
          <ProfileDetail lang={lang} label="Learning language" value={languageLabel(p.language || 'en')} />
          <ProfileDetail lang={lang} label="Learning preferences" value={selectedStyles.length ? selectedStyles.join(' • ') : translate(lang, 'Choose what helps you learn')} />
        </div>
      </section>
      <InfoNote lang={lang} title="Privacy & safety">You can update your language and learning preferences. School, class and teacher details are managed by authorised school staff.</InfoNote>
      <Link className="btn l-fit-button" to="/learner/preferences">{translate(lang, 'Update preferences')}</Link>
    </div>
  )
}

// ------------------------------------------------------------------ shared pieces

const lessonLink = (runId, style) => {
  const q = new URLSearchParams({ lesson: runId, ...(style ? { style } : {}) })
  return `/learner/lesson?${q}`
}

function PageHeading({ lang, eyebrow, title, description }) {
  return <header className="l-page-heading"><span className="l-eyebrow">{translate(lang, eyebrow)}</span><h1>{translate(lang, title)}</h1><p>{translate(lang, description)}</p></header>
}

function LessonCard({ lang, title, subject, status, to, onRemove }) {
  return (
    <article className="l-lesson-card">
      <span className="l-lesson-icon" aria-hidden="true">✦</span>
      <div className="l-lesson-copy"><h2>{title}</h2><p>{subject}</p></div>
      <span className="l-status-pill">{translate(lang, status)}</span>
      {to && <Link className="l-open-link" to={to}>{translate(lang, 'Open')} <span aria-hidden="true">→</span></Link>}
      {onRemove && <button type="button" className="l-open-link" onClick={onRemove}>{translate(lang, 'Remove')}</button>}
    </article>
  )
}

function EmptyState({ lang, icon, title, children, action }) {
  return <div className="l-empty"><span aria-hidden="true">{icon}</span><h2>{translate(lang, title)}</h2><p>{translate(lang, children)}</p>{action}</div>
}

function StatCard({ lang, label, value, tone }) {
  return <div className={`l-stat-card stat-${tone}`}><span className="l-stat-label">{translate(lang, label)}</span><strong>{value}</strong></div>
}

function ProfileDetail({ lang, label, value }) {
  return <div className="l-profile-detail"><span>{translate(lang, label)}</span><strong>{value}</strong></div>
}

function InfoNote({ lang, title, children, translateContent = true }) {
  return <aside className="l-info-note"><strong>{translate(lang, title)}</strong><p>{translateContent ? translate(lang, children) : children}</p></aside>
}
