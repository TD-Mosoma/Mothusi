import { Link } from 'react-router-dom'
import { useRef, useState } from 'react'
import { useTeacher } from './TeacherContext.jsx'
import { GRADES, SUBJECTS, LANGUAGE_OPTIONS, unique } from './curriculum.js'
import { initialsOf } from './format.js'

function Assignments({ profile, onSave, onCancel }) {
  const [grades, setGrades] = useState(profile.grades)
  const [subjects, setSubjects] = useState(profile.subjects)
  const [error, setError] = useState('')

  const subjectOptions = unique([...SUBJECTS, ...profile.subjects])
  const flip = (list, setList, v) => setList(list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  const save = () => {
    if (grades.length === 0) return setError('Choose at least one grade.')
    if (subjects.length === 0) return setError('Choose at least one subject.')
    onSave({ grades, subjects })
  }

  return (
    <section className="card stack">
      <h2>Edit teaching assignments</h2>
      <p className="muted">Update the grades and subjects used when Mothusi prepares your lessons.</p>

      <fieldset className="t-fieldset">
        <legend>Grades I teach</legend>
        <div className="t-toggles">
          {GRADES.map((g) => (
            <button key={g} type="button" className={`t-toggle ${grades.includes(g) ? 'on' : ''}`}
              aria-pressed={grades.includes(g)} onClick={() => flip(grades, setGrades, g)}>{g}</button>
          ))}
        </div>
      </fieldset>

      <fieldset className="t-fieldset">
        <legend>Subjects I teach</legend>
        <div className="t-toggles">
          {subjectOptions.map((s) => (
            <button key={s} type="button" className={`t-toggle ${subjects.includes(s) ? 'on' : ''}`}
              aria-pressed={subjects.includes(s)} onClick={() => flip(subjects, setSubjects, s)}>{s}</button>
          ))}
        </div>
      </fieldset>

      <p className="t-note">Changes update your lesson planner options. Existing lesson plans and class history stay as they are.</p>
      {error && <p className="t-error" role="alert">{error}</p>}
      <div className="row">
        <button type="button" className="btn" onClick={save}>Save changes</button>
        <button type="button" className="btn secondary" onClick={onCancel}>Cancel</button>
      </div>
    </section>
  )
}

export default function MyProfile() {
  const { profile, updateProfile } = useTeacher()
  const photoRef = useRef(null)
  const [f, setF] = useState({
    fullName: profile.fullName, email: profile.email, school: profile.school,
    role: profile.role, language: profile.language, defaultConditions: profile.defaultConditions,
  })
  const [editingAssignments, setEditingAssignments] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const set = (key, value) => { setSaved(false); setF((x) => ({ ...x, [key]: value })) }

  const save = (e) => {
    e.preventDefault()
    if (f.fullName.trim().length < 2) return setError('Enter your full name.')
    if (!/^\S+@\S+\.\S+$/.test(f.email)) return setError('Enter a valid email address.')
    setError('')
    updateProfile({ ...f, fullName: f.fullName.trim(), email: f.email.trim() })
    setSaved(true)
  }

  const changePhoto = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) return setError('Choose an image file for your photo.')
    setError('')
    if (profile.photoUrl) URL.revokeObjectURL(profile.photoUrl)
    updateProfile({ photoUrl: URL.createObjectURL(file) })
  }

  return (
    <div className="stack">
      <div className="t-page-head">
        <div>
          <h1>Profile</h1>
          <p className="muted">Manage your details, teaching assignments and planning preferences.</p>
        </div>
      </div>

      <form className="card stack" onSubmit={save} noValidate>
        <div className="row">
          <span className="t-avatar">
            {profile.photoUrl ? <img src={profile.photoUrl} alt="Your profile" /> : initialsOf(profile.fullName)}
          </span>
          <div>
            <button type="button" className="btn secondary small" onClick={() => photoRef.current?.click()}>Change photo</button>
            <input ref={photoRef} type="file" accept="image/*" onChange={changePhoto} hidden />
          </div>
        </div>

        <div className="t-form-grid">
          <label className="t-field">Full name
            <input value={f.fullName} onChange={(e) => set('fullName', e.target.value)} autoComplete="name" />
          </label>
          <label className="t-field">Email
            <input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" />
          </label>
          <label className="t-field">School
            <input value={f.school} onChange={(e) => set('school', e.target.value)} />
          </label>
          <label className="t-field">Role
            <input value={f.role} onChange={(e) => set('role', e.target.value)} />
          </label>
          <label className="t-field">Preferred language
            <select value={f.language} onChange={(e) => set('language', e.target.value)}>
              {LANGUAGE_OPTIONS.map((l) => <option key={l}>{l}</option>)}
            </select>
          </label>
          <div className="t-field">Classroom conditions
            <p className="t-static muted">Saved for each class when you plan. See them in <Link to="/teacher/classes">Classes</Link>.</p>
          </div>
        </div>

        <div className="t-assign">
          <div>
            <strong>Grades taught</strong>
            <p>{profile.grades.join(' • ')}</p>
          </div>
          <div>
            <strong>Subjects taught</strong>
            <p>{profile.subjects.join(' • ')}</p>
          </div>
          <button type="button" className="btn secondary small" onClick={() => setEditingAssignments(true)}>Edit</button>
        </div>

        {error && <p className="t-error" role="alert">{error}</p>}
        {saved && <p className="t-success" role="status">Profile saved.</p>}
        <div className="row">
          <button type="submit" className="btn">Save profile</button>
        </div>
        <p className="t-hint">Grade and subject changes update your lesson planner options and class assignments.</p>
      </form>

      {editingAssignments && (
        <Assignments
          profile={profile}
          onSave={(data) => { updateProfile(data); setEditingAssignments(false) }}
          onCancel={() => setEditingAssignments(false)}
        />
      )}
    </div>
  )
}
