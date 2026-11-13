import { useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { LANGUAGES, languageLabel } from '../teacher/curriculum.js'
import { getLearningPreferences, getSavedLearning, saveLearningItems, saveLearningPreferences } from '../services/learnerPortal.js'
import { useLearnerLesson, useLearnerLessons, useLearnerLink, useLearnerProgress } from './useLearnerLesson.js'
import PracticeSession from './PracticeSession.jsx'
import { THEME_OPTIONS, useThemePref } from '../services/theme.js'
import JoinClass from './JoinClass.jsx'
import { translate, translateMaterial } from './translations.js'

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
  const { loading, lesson } = useLearnerLesson(lang)
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
  const { lang } = useOutletContext()
  const { loading, lesson } = useLearnerLesson(lang)

  if (loading) return <p className="l-inline-status">{translate(lang, 'Getting your lesson ready…')}</p>
  if (!lesson) {
    return (
      <div className="stack l-page">
        <PageHeading lang={lang} eyebrow="PRACTICE" title="Practice" description="Short questions to check your understanding." />
        <EmptyState lang={lang} icon="✎" title="Nothing to practise yet">When your teacher shares a lesson, its practice questions will appear here.</EmptyState>
      </div>
    )
  }
  const material = lesson.offline_demo ? translateMaterial(lesson.material, lang) : lesson.material
  const contentLang = lesson.note === 'local_translation' ? lang : lesson.language || 'en'
  return (
    <div className="stack l-page">
      <PageHeading lang={lang} eyebrow="PRACTICE" title={translate(lang, 'Practise {topic}', { topic: lesson.topic.toLowerCase() })}
        description="Try one question at a time. You can ask for a hint before answering." />
      <PracticeSession key={lesson.run_id} lesson={lesson} questions={material.practice} lang={lang} contentLang={contentLang} />
    </div>
  )
}

// ------------------------------------------------------------------ Progress

export function LearnerProgress() {
  const { lang } = useOutletContext()
  const { lessons } = useLearnerLessons()
  const { progress, error } = useLearnerProgress()
  const done = progress?.practice_done || 0
  const recent = progress?.recent
  return (
    <div className="stack l-page">
      <PageHeading lang={lang} eyebrow="YOUR PROGRESS" title="My learning progress" description="See what you have practised and what you may want to try next." />
      {error && <p className="l-inline-status" role="status">{translate(lang, 'We cannot load your progress right now.')}</p>}
      <div className="l-stats l-progress-stats">
        <StatCard lang={lang} label="LESSONS SHARED" value={lessons.length} tone="blue" />
        <StatCard lang={lang} label="ACTIVITIES DONE" value={progress ? done : '…'} tone="yellow" />
        <StatCard lang={lang} label="RIGHT FIRST TIME" value={progress ? (progress.questions_tried ? `${progress.first_try_correct} / ${progress.questions_tried}` : translate(lang, 'Not yet')) : '…'} tone="green" />
        <StatCard lang={lang} label="RECENT PRACTICE" value={recent?.topic || translate(lang, 'Not yet')} tone="pink" />
      </div>
      <div className="l-method-grid l-progress-grid">
        <InfoNote lang={lang} title="What is going well">{done ? translate(lang, 'You have finished {count} practice {activity}. Great work sticking with it!', { count: done, activity: translate(lang, done === 1 ? 'activity' : 'activities') }) : translate(lang, 'Start a short activity and your progress will show here.')}</InfoNote>
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
  const [theme, setTheme] = useThemePref()

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
        <label className="l-field"><span>{translate(lang, 'Colours')}</span>
          <select value={theme} onChange={(event) => setTheme(event.target.value)}>
            {THEME_OPTIONS.map((o) => <option key={o.value} value={o.value}>{translate(lang, o.label)}</option>)}
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
  const { link, loading: linkLoading, setLink } = useLearnerLink()
  const classValue = linkLoading ? '…'
    : link ? `${link.class_name} (${link.teacher_name})` : translate(lang, 'Not joined yet')

  return (
    <div className="stack l-page">
      <PageHeading lang={lang} eyebrow="YOUR PROFILE" title="My learner profile" description="Your learning details and preferences. School details are managed by your teacher." />
      <section className="l-panel l-profile-card">
        <div className="l-profile-avatar" aria-hidden="true">{p.fullName?.trim()?.[0]?.toUpperCase() || 'L'}</div>
        <div className="l-profile-details">
          <ProfileDetail lang={lang} label="Display name" value={p.fullName || 'Learner'} />
          <ProfileDetail lang={lang} label="Grade" value={p.grade || 'Not set'} />
          <ProfileDetail lang={lang} label="Age" value={p.age ? translate(lang, '{count} years old', { count: p.age }) : translate(lang, 'Not set')} />
          <ProfileDetail lang={lang} label="My class" value={classValue} />
          <ProfileDetail lang={lang} label="Learning language" value={languageLabel(p.language || 'en')} />
          <ProfileDetail lang={lang} label="Learning preferences" value={selectedStyles.length ? selectedStyles.join(' • ') : translate(lang, 'Choose what helps you learn')} />
        </div>
      </section>
      <section className="l-panel stack">
        <h2>{translate(lang, link ? 'Change class' : 'Join your class')}</h2>
        <p className="muted">{translate(lang, link
          ? 'If your teacher gives you a new code, type it here.'
          : 'Ask your teacher for your class code, then type it here to see your lessons.')}</p>
        <JoinClass lang={lang} onJoined={setLink} />
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
