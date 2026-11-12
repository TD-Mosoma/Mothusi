import { useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import FractionCircle from '../components/FractionCircle.jsx'
import { practice } from '../services/mockData.js'
import { getLearnerProfile, saveLearnerProfile } from '../services/profile.js'
import {
  completeLearnerActivity,
  getCompletedActivities,
  getLearningPreferences,
  saveLearnerReflection,
  getSavedLearning,
  saveLearningItems,
  saveLearningPreferences,
} from '../services/learnerPortal.js'

const LEARNING_ITEMS = [
  { id: 'fractions', title: 'Fractions with pictures', subject: 'Mathematics', type: 'Explanation' },
  { id: 'sharing', title: 'Sharing equally', subject: 'Mathematics', type: 'Practical activity' },
  { id: 'fraction-practice', title: 'Fraction picture practice', subject: 'Mathematics', type: 'Practice' },
]

export function LearnerLessons() {
  return (
    <div className="stack l-page">
      <PageHeading eyebrow="YOUR CLASSROOM" title="My lessons" description="Explore the learning topics your teacher has shared with your class." />
      <div className="l-list">
        <LessonCard title="Fractions" subject="Mathematics • Grade 4" status="In progress" to="/learner/lesson" />
        <LessonCard title="Habitats" subject="Natural Sciences • Grade 4" status="Coming soon" />
        <LessonCard title="Healthy choices" subject="Life Skills • Grade 4" status="Coming soon" />
      </div>
      <InfoNote title="How lessons appear">Your teacher shares a class topic. Mothusi offers different explanations and activities to help you understand it.</InfoNote>
    </div>
  )
}

export function LearnerTopic() {
  const [saved, setSaved] = useState(getSavedLearning().some((item) => item.id === 'fractions'))
  const [notice, setNotice] = useState('')

  const toggleSaved = () => {
    const items = getSavedLearning()
    const next = saved
      ? items.filter((item) => item.id !== 'fractions')
      : [...items.filter((item) => item.id !== 'fractions'), LEARNING_ITEMS[0]]
    const didSave = saveLearningItems(next)
    if (!didSave) {
      setNotice('We could not save this just now. Please try again.')
      return
    }
    setSaved(!saved)
    setNotice(saved ? 'Removed from your saved learning.' : 'Added to your saved learning.')
  }

  return (
    <div className="stack l-page">
      <PageHeading eyebrow="PICK YOUR PATH" title="Learn a topic" description="Choose a topic from your class and explore it in a way that works for you." />
      <section className="l-panel l-topic-picker">
        <label className="l-field"><span>Choose subject</span><select defaultValue="Mathematics"><option>Mathematics</option><option disabled>Natural Sciences — coming soon</option><option disabled>Life Skills — coming soon</option></select></label>
        <label className="l-field"><span>Choose topic</span><select defaultValue="Fractions"><option>Fractions</option></select></label>
      </section>
      <div className="l-method-grid">
        <article className="l-method-card method-blue"><span aria-hidden="true">☀</span><h2>Explain it</h2><p>Read or listen to a simple explanation.</p></article>
        <article className="l-method-card method-yellow"><span aria-hidden="true">◉</span><h2>Show me</h2><p>See pictures and worked examples.</p></article>
        <article className="l-method-card method-green"><span aria-hidden="true">✎</span><h2>Let me try</h2><p>Practise with guided questions.</p></article>
      </div>
      <InfoNote title="Your learning goal">Understand how a whole can be divided into equal parts, and recognise halves, thirds and quarters.</InfoNote>
      <div className="row">
        <Link className="btn" to="/learner/lesson">Start learning <span aria-hidden="true">→</span></Link>
        <button className="btn secondary" onClick={toggleSaved}>{saved ? '♥ Saved' : '♡ Save for later'}</button>
      </div>
      {notice && <p className="l-inline-status" role="status">{notice}</p>}
    </div>
  )
}

export function LearnerPractice() {
  const [questionIndex, setQuestionIndex] = useState(0)
  const [selected, setSelected] = useState(null)
  const [checked, setChecked] = useState(false)
  const [hint, setHint] = useState(false)
  const [finished, setFinished] = useState(false)
  const [completionError, setCompletionError] = useState(false)
  const [feeling, setFeeling] = useState('')
  const [helped, setHelped] = useState([])
  const [status, setStatus] = useState('')
  const question = practice[questionIndex]
  const isCorrect = selected === question.answer
  const isLast = questionIndex === practice.length - 1

  const checkAnswer = () => {
    if (selected === null) return
    setChecked(true)
  }

  const continuePractice = () => {
    if (isLast) {
      setCompletionError(!completeLearnerActivity())
      setFinished(true)
      return
    }
    setQuestionIndex((index) => index + 1)
    setSelected(null)
    setChecked(false)
    setHint(false)
  }

  const saveReflection = () => {
    if (!feeling || helped.length === 0) {
      setStatus('Choose how the activity felt and what helped you most.')
      return
    }
    const saved = saveLearnerReflection({ feeling, helped, savedAt: new Date().toISOString() })
    setStatus(saved ? 'Thanks for sharing. Your reflection has been saved.' : 'We could not save your reflection. Please try again.')
  }

  const toggleHelped = (value) => {
    setHelped((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value])
  }

  if (finished) {
    return (
      <div className="stack l-page">
        <PageHeading eyebrow="LOOK AT YOU GO!" title="Well done — activity completed!" description="A short reflection helps you and your teacher decide what to do next." />
        <section className="l-complete-banner"><span aria-hidden="true">★</span><div><h2>You practised fractions!</h2><p>You explored equal parts and identified halves and quarters.</p></div></section>
        <div className="l-method-grid l-next-grid">
          <InfoNote title="What you practised">You explored equal parts and identified halves and quarters.</InfoNote>
          <InfoNote title="Your next step">Try comparing two fractions using pictures.</InfoNote>
        </div>
        <section className="l-panel l-reflection">
          <h2>How did this activity feel?</h2>
          <div className="l-choice-row">
            {['Easy', 'Just right', 'Difficult'].map((option) => (
              <button key={option} className={`l-choice-chip${feeling === option ? ' selected' : ''}`} aria-pressed={feeling === option} onClick={() => setFeeling(option)}>{option}</button>
            ))}
          </div>
          <h2>What helped you most?</h2>
          <div className="l-choice-row">
            {['Pictures', 'Short steps', 'Practical example', 'Another language'].map((option) => (
              <button key={option} className={`l-choice-chip${helped.includes(option) ? ' selected' : ''}`} aria-pressed={helped.includes(option)} onClick={() => toggleHelped(option)}>{option}</button>
            ))}
          </div>
          <button className="btn" onClick={saveReflection}>Save reflection</button>
          {completionError && <p className="l-inline-status" role="status">Your activity is complete, but we could not update your saved progress just now.</p>}
          {status && <p className="l-inline-status" role="status">{status}</p>}
        </section>
        <Link to="/learner/topic" className="l-text-link">Explore another topic <span aria-hidden="true">→</span></Link>
      </div>
    )
  }

  return (
    <div className="stack l-page">
      <PageHeading eyebrow={`QUESTION ${questionIndex + 1} OF ${practice.length}`} title="Practice fractions" description="Try one question at a time. You can ask for a hint before answering." />
      <section className="l-panel l-question-panel">
        <h2>{question.prompt}</h2>
        <div className="l-practice-options" role="group" aria-label="Answer choices">
          {question.options.map((option, index) => (
            <button key={index} className={`l-practice-option${selected === index ? ' selected' : ''}${checked && selected === index ? (isCorrect ? ' correct' : ' incorrect') : ''}`} onClick={() => { setSelected(index); setChecked(false) }} aria-pressed={selected === index} aria-label={`${option.shaded} of ${option.parts} parts shaded`}>
              <FractionCircle parts={option.parts} shaded={option.shaded} size={104} />
              <span>{option.shaded}/{option.parts}</span>
            </button>
          ))}
        </div>
        <div className="row">
          <button className="btn secondary" onClick={() => setHint(!hint)} aria-expanded={hint}>{hint ? 'Hide hint' : 'Show me a hint'}</button>
          {!checked && <button className="btn" disabled={selected === null} onClick={checkAnswer}>Check answer</button>}
        </div>
        {hint && <InfoNote title="A little hint">Count how many equal parts make the whole. Then count the shaded parts.</InfoNote>}
        {checked && (
          <div className={`l-feedback ${isCorrect ? 'right' : 'try'}`} role="status">
            <strong>{isCorrect ? 'You got it!' : 'Good try — have another look.'}</strong>
            <p>{isCorrect ? 'The top number shows the shaded parts. The bottom number shows all the equal parts.' : 'Count the equal pieces in the whole first, then count the shaded pieces.'}</p>
            {isCorrect
              ? <button className="btn" onClick={continuePractice}>{isLast ? 'Finish practice' : 'Next question'}</button>
              : <button className="btn secondary" onClick={() => { setSelected(null); setChecked(false) }}>Try again</button>}
          </div>
        )}
      </section>
    </div>
  )
}

export function LearnerProgress() {
  const completed = getCompletedActivities()
  return (
    <div className="stack l-page">
      <PageHeading eyebrow="YOUR PROGRESS" title="My learning progress" description="See what you have practised and what you may want to try next." />
      <div className="l-stats l-progress-stats">
        <StatCard label="TOPICS EXPLORED" value={completed ? '1' : '0'} tone="blue" />
        <StatCard label="ACTIVITIES DONE" value={completed} tone="yellow" />
        <StatCard label="RECENT PRACTICE" value={completed ? 'Fractions' : 'Not yet'} tone="green" />
        <StatCard label="NEXT STEP" value="Guided practice" tone="pink" />
      </div>
      <div className="l-method-grid l-progress-grid">
        <InfoNote title="What is going well">{completed ? 'You finished a fractions activity. Great work sticking with it!' : 'Start a short activity and your progress will show here.'}</InfoNote>
        <InfoNote title="What to practise next">Try comparing quarters and halves, and explain how you worked it out.</InfoNote>
      </div>
      <InfoNote title="A note about progress">Progress is a learning aid, not a label or diagnosis. Your teacher can help choose what to practise next.</InfoNote>
      <Link to="/learner/practice" className="btn l-fit-button">Practise now <span aria-hidden="true">→</span></Link>
    </div>
  )
}

export function LearnerSaved() {
  const [items, setItems] = useState(getSavedLearning())
  const [status, setStatus] = useState('')

  const removeItem = (id) => {
    const next = items.filter((item) => item.id !== id)
    if (!saveLearningItems(next)) {
      setStatus('We could not update your saved learning. Please try again.')
      return
    }
    setItems(next)
    setStatus('Removed from your saved learning.')
  }

  return (
    <div className="stack l-page">
      <PageHeading eyebrow="YOUR FAVOURITES" title="My saved learning" description="Return to explanations and activities you want to use again." />
      {items.length > 0
        ? <div className="l-list">{items.map((item) => <LessonCard key={item.id} title={item.title} subject={`${item.subject} • ${item.type}`} status="Saved" to="/learner/lesson" onRemove={() => removeItem(item.id)} />)}</div>
        : <div className="l-empty"><span aria-hidden="true">♡</span><h2>No saved learning yet</h2><p>Save an explanation or activity and it will be waiting here for you.</p><Link className="btn" to="/learner/topic">Explore a topic</Link></div>}
      {status && <p className="l-inline-status" role="status">{status}</p>}
      <InfoNote title="Your saved items">Save learning activities you want to come back to. You can remove them here whenever you like.</InfoNote>
    </div>
  )
}

export function LearnerPreferences() {
  const { lang, setLang } = useOutletContext()
  const [preferences, setPreferences] = useState(getLearningPreferences())
  const [status, setStatus] = useState('')
  const profile = getLearnerProfile() || {}
  const styles = [
    { id: 'pictures', label: 'Pictures and diagrams' },
    { id: 'shortSteps', label: 'Short steps' },
    { id: 'listen', label: 'Listen to explanations' },
    { id: 'practical', label: 'Practical examples' },
  ]

  const toggleStyle = (id) => setPreferences((current) => ({
    ...current,
    styles: current.styles.includes(id) ? current.styles.filter((style) => style !== id) : [...current.styles, id],
  }))

  const save = async () => {
    const savedPreferences = saveLearningPreferences(preferences)
    await saveLearnerProfile({ ...profile, language: lang, preferences })
    setStatus(savedPreferences ? 'Your learning preferences are saved.' : 'We could not save your preferences. Please try again.')
  }

  return (
    <div className={`stack l-page${preferences.textSize === 'large' ? ' l-larger-text' : ''}`}>
      <PageHeading eyebrow="MAKE IT YOURS" title="Language & learning preferences" description="Choose how you would like Mothusi to present learning materials." />
      <section className="l-panel l-preferences-grid">
        <label className="l-field"><span>My learning language</span><select value={lang} onChange={(event) => setLang(event.target.value)}><option value="en">English</option><option value="tn">Setswana</option><option value="zu">isiZulu</option><option value="xh">isiXhosa</option></select></label>
        <label className="l-field"><span>Also show in</span><select value={preferences.alsoLanguage} onChange={(event) => setPreferences((current) => ({ ...current, alsoLanguage: event.target.value }))}><option value="none">No second language</option><option value="en">English</option><option value="tn">Setswana</option><option value="zu">isiZulu</option><option value="xh">isiXhosa</option></select></label>
        <fieldset className="l-preference-group"><legend>How I like to learn</legend>
          {styles.map((style) => <label key={style.id}><input type="checkbox" checked={preferences.styles.includes(style.id)} onChange={() => toggleStyle(style.id)} />{style.label}</label>)}
        </fieldset>
        <fieldset className="l-preference-group"><legend>Reading & display</legend>
          <label className="l-field"><span>Text size</span><select value={preferences.textSize} onChange={(event) => setPreferences((current) => ({ ...current, textSize: event.target.value }))}><option value="normal">Normal</option><option value="large">Large</option></select></label>
        </fieldset>
      </section>
      <InfoNote title="Language quality">You can switch languages at any time. Some lessons may still appear in English while a translation is checked.</InfoNote>
      <button className="btn l-fit-button" onClick={save}>Save preferences</button>
      {status && <p className="l-inline-status" role="status">{status}</p>}
    </div>
  )
}

export function LearnerProfile() {
  const profile = getLearnerProfile() || {}
  const preferences = getLearningPreferences()
  const styleLabels = {
    pictures: 'Pictures',
    shortSteps: 'Short steps',
    listen: 'Listen to explanations',
    practical: 'Practical examples',
  }
  const selectedStyles = preferences.styles.map((style) => styleLabels[style]).filter(Boolean)

  return (
    <div className="stack l-page">
      <PageHeading eyebrow="YOUR PROFILE" title="My learner profile" description="Your learning details and preferences. School details are managed by your teacher." />
      <section className="l-panel l-profile-card">
        <div className="l-profile-avatar" aria-hidden="true">{profile.fullName?.trim()?.[0]?.toUpperCase() || 'L'}</div>
        <div className="l-profile-details">
          <ProfileDetail label="Display name" value={profile.fullName || 'Learner'} />
          <ProfileDetail label="Grade" value={profile.grade || 'Not set'} />
          <ProfileDetail label="Age" value={profile.age ? `${profile.age} years old` : 'Not set'} />
          <ProfileDetail label="Learning language" value={{ en: 'English', tn: 'Setswana', zu: 'isiZulu', xh: 'isiXhosa' }[profile.language] || 'English'} />
          <ProfileDetail label="Learning preferences" value={selectedStyles.length ? selectedStyles.join(' • ') : 'Choose what helps you learn'} />
        </div>
      </section>
      <InfoNote title="Privacy & safety">You can update your learning preferences. School, class and teacher details are managed by authorised school staff.</InfoNote>
      <Link className="btn l-fit-button" to="/learner/preferences">Update preferences</Link>
    </div>
  )
}

function PageHeading({ eyebrow, title, description }) {
  return <header className="l-page-heading"><span className="l-eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></header>
}

function LessonCard({ title, subject, status, to, onRemove }) {
  return (
    <article className="l-lesson-card">
      <span className="l-lesson-icon" aria-hidden="true">✦</span>
      <div className="l-lesson-copy"><h2>{title}</h2><p>{subject}</p></div>
      <span className={`l-status-pill${status === 'Coming soon' ? ' upcoming' : ''}`}>{status}</span>
      {to ? <Link className="l-open-link" to={to}>Open <span aria-hidden="true">→</span></Link> : onRemove && <button className="l-open-link" onClick={onRemove}>Remove</button>}
    </article>
  )
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
