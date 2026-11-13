import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { saveLearnerProfile } from '../services/profile.js'
import './onboarding.css'

import { GRADES, LANGUAGES } from '../teacher/curriculum.js'

const AGES = [6, 7, 8, 9, 10, 11]
const INTERESTS = [
  { id: 'football', label: 'Football', icon: '⚽' },
  { id: 'music', label: 'Music', icon: '🎵' },
  { id: 'animals', label: 'Animals', icon: '🐘' },
  { id: 'art', label: 'Drawing', icon: '🎨' },
  { id: 'space', label: 'Space', icon: '🚀' },
  { id: 'cooking', label: 'Cooking', icon: '🍳' },
  { id: 'games', label: 'Games', icon: '🎮' },
  { id: 'dancing', label: 'Dancing', icon: '💃' },
  { id: 'nature', label: 'Nature', icon: '🌳' },
]
const MAX_INTERESTS = 3

export default function LearnerOnboarding() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [data, setData] = useState({
    fullName: '', age: null, grade: '', language: '', interests: [], code: '',
  })

  const set = (key, value) => setData((d) => ({ ...d, [key]: value }))

  const toggleInterest = (id) => {
    setData((d) => {
      const has = d.interests.includes(id)
      if (has) return { ...d, interests: d.interests.filter((i) => i !== id) }
      if (d.interests.length >= MAX_INTERESTS) return d
      return { ...d, interests: [...d.interests, id] }
    })
  }

  // One entry per screen
  const steps = [
    {
      title: 'What is your name?',
      valid: data.fullName.trim().length > 1,
      body: (
        <input
          className="ob-input"
          value={data.fullName}
          onChange={(e) => set('fullName', e.target.value)}
          placeholder="Type your full name"
          autoComplete="name"
          autoFocus
        />
      ),
    },
    {
      title: 'How old are you?',
      valid: data.age !== null,
      body: (
        <div className="ob-grid small">
          {AGES.map((a) => (
            <Choice key={a} selected={data.age === a} onClick={() => set('age', a)}>{a}</Choice>
          ))}
        </div>
      ),
    },
    {
      title: 'Which grade are you in?',
      valid: !!data.grade,
      body: (
        <div className="ob-grid">
          {GRADES.map((g) => (
            <Choice key={g} selected={data.grade === g} onClick={() => set('grade', g)}>{g}</Choice>
          ))}
        </div>
      ),
    },
    {
      title: 'Which language do you like to learn in?',
      valid: !!data.language,
      body: (
        <div className="ob-grid">
          {LANGUAGES.map((l) => (
            <Choice key={l.code} selected={data.language === l.code} onClick={() => set('language', l.code)}>
              {l.label}
            </Choice>
          ))}
        </div>
      ),
    },
    {
      title: 'Do you have a learner code?',
      hint: 'Your teacher can give you a code like L-003. It helps Mothusi show your own lesson. You can skip this.',
      valid: true,
      body: (
        <input
          className="ob-input"
          value={data.code}
          onChange={(e) => set('code', e.target.value.toUpperCase().trim())}
          placeholder="L-000"
          aria-label="Learner code"
        />
      ),
    },
    {
      title: 'What do you love?',
      hint: `Pick up to ${MAX_INTERESTS}. When you ask for another explanation, Mothusi uses things you like.`,
      valid: data.interests.length > 0,
      body: (
        <div className="ob-grid">
          {INTERESTS.map((i) => (
            <Choice
              key={i.id}
              selected={data.interests.includes(i.id)}
              onClick={() => toggleInterest(i.id)}
              disabled={!data.interests.includes(i.id) && data.interests.length >= MAX_INTERESTS}
            >
              <span className="ob-icon" aria-hidden="true">{i.icon}</span>
              {i.label}
            </Choice>
          ))}
        </div>
      ),
    },
  ]

  const isDone = step === steps.length
  const current = steps[step]

  const finish = async () => {
    await saveLearnerProfile(data)
    navigate('/learner')
  }

  return (
    <div className="theme-learner ob-shell">
      <div className="ob-card">
        {!isDone && (
          <>
            <div
              className="ob-progress"
              role="progressbar"
              aria-valuemin={1}
              aria-valuemax={steps.length}
              aria-valuenow={step + 1}
              aria-label={`Question ${step + 1} of ${steps.length}`}
            >
              <div className="ob-progress-fill" style={{ width: `${((step + 1) / steps.length) * 100}%` }} />
            </div>

            <h1>{current.title}</h1>
            {current.hint && <p className="muted">{current.hint}</p>}

            <div className="ob-body">{current.body}</div>

            <div className="ob-actions">
              {step > 0
                ? <button className="btn secondary" onClick={() => setStep(step - 1)}>Back</button>
                : <span />}
              <button className="btn" disabled={!current.valid} onClick={() => setStep(step + 1)}>Next</button>
            </div>
          </>
        )}

        {isDone && (
          <div className="ob-done">
            <h1>All done, {data.fullName.trim().split(' ')[0]}!</h1>
            <p>Your lessons are ready for you.</p>
            <button className="btn" onClick={finish}>Start learning</button>
          </div>
        )}
      </div>
    </div>
  )
}

function Choice({ selected, onClick, disabled, children }) {
  return (
    <button
      type="button"
      className={`ob-choice ${selected ? 'selected' : ''}`}
      aria-pressed={selected}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}