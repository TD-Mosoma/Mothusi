import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { saveTeacherProfile } from '../services/profile.js'
import './onboarding.css'

const GRADES = ['Grade R', ...Array.from({ length: 12 }, (_, i) => `Grade ${i + 1}`)]
const SUBJECTS = [
  'Mathematics', 'Mathematical Literacy', 'English', 'Afrikaans', 'Setswana', 'isiZulu', 'isiXhosa',
  'Natural Sciences', 'Life Sciences', 'Physical Sciences', 'Social Sciences', 'Geography',
  'History', 'Technology', 'Life Skills', 'Creative Arts', 'Economic and Management Sciences',
]

export default function TeacherOnboarding() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    fullName: '', email: '', password: '', grades: [], subjects: [], otherSubject: '',
  })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))
  const toggle = (key, value) =>
    setForm((f) => ({
      ...f,
      [key]: f[key].includes(value) ? f[key].filter((v) => v !== value) : [...f[key], value],
    }))

  const validate = () => {
    const e = {}
    if (form.fullName.trim().length < 2) e.fullName = 'Enter your full name.'
    if (!/^\S+@\S+\.\S+$/.test(form.email)) e.email = 'Enter a valid email address.'
    if (form.password.length < 8) e.password = 'Use at least 8 characters.'
    if (form.grades.length === 0) e.grades = 'Choose at least one grade.'
    if (form.subjects.length === 0 && !form.otherSubject.trim()) e.subjects = 'Choose at least one subject.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const submit = async (ev) => {
    ev.preventDefault()
    if (!validate()) return
    setSaving(true)
    const subjects = [...form.subjects, ...(form.otherSubject.trim() ? [form.otherSubject.trim()] : [])]
    await saveTeacherProfile({ ...form, subjects })
    navigate('/teacher')
  }

  return (
    <div className="theme-teacher tob-shell">
      <form className="tob-card" onSubmit={submit} noValidate>
        <Link to="/" className="tob-logo">Mothusi</Link>
        <h1>Set up your teacher account</h1>
        <p className="muted">This helps Mothusi suggest lessons and support for your classes.</p>

        <Field label="Full name" error={errors.fullName}>
          <input value={form.fullName} onChange={(e) => set('fullName', e.target.value)} autoComplete="name" />
        </Field>

        <Field label="Email address" error={errors.email}>
          <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" />
        </Field>

        <Field label="Password" error={errors.password} hint="At least 8 characters.">
          <input type="password" value={form.password} onChange={(e) => set('password', e.target.value)} autoComplete="new-password" />
        </Field>

        <fieldset className="tob-group">
          <legend>Grades you teach</legend>
          <div className="tob-chips">
            {GRADES.map((g) => (
              <Chip key={g} selected={form.grades.includes(g)} onClick={() => toggle('grades', g)}>{g}</Chip>
            ))}
          </div>
          {errors.grades && <p className="tob-error" role="alert">{errors.grades}</p>}
        </fieldset>

        <fieldset className="tob-group">
          <legend>Subjects you teach</legend>
          <div className="tob-chips">
            {SUBJECTS.map((s) => (
              <Chip key={s} selected={form.subjects.includes(s)} onClick={() => toggle('subjects', s)}>{s}</Chip>
            ))}
          </div>
          <Field label="Another subject (optional)">
            <input value={form.otherSubject} onChange={(e) => set('otherSubject', e.target.value)} />
          </Field>
          {errors.subjects && <p className="tob-error" role="alert">{errors.subjects}</p>}
        </fieldset>

        <button type="submit" className="btn" disabled={saving}>
          {saving ? 'Creating account...' : 'Create account'}
        </button>
      </form>
    </div>
  )
}

function Field({ label, error, hint, children }) {
  return (
    <label className="tob-field">
      {label}
      {children}
      {hint && !error && <span className="tob-hint">{hint}</span>}
      {error && <span className="tob-error" role="alert">{error}</span>}
    </label>
  )
}

function Chip({ selected, onClick, children }) {
  return (
    <button type="button" className={`tob-chip ${selected ? 'selected' : ''}`} aria-pressed={selected} onClick={onClick}>
      {children}
    </button>
  )
}