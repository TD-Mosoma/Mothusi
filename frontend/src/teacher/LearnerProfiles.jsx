import { useState } from 'react'
import { useActiveClasses, useTeacher } from './TeacherContext.jsx'
import { ClassCodeCard, LearnerCodeCell, useRoster } from './ClassCodes.jsx'
import { LANGUAGES, languageLabel } from './curriculum.js'

function ProfileForm({ initial, onSave, onCancel, onRemove }) {
  const [f, setF] = useState(initial)
  const [error, setError] = useState('')
  const set = (key, value) => setF((x) => ({ ...x, [key]: value }))

  const submit = (e) => {
    e.preventDefault()
    if (f.name.trim().length < 1) return setError('Enter a name or learner label.')
    onSave({ name: f.name.trim(), strengths: f.strengths.trim(), support: f.support.trim(), language: f.language || 'en' })
  }

  return (
    <form className="card stack" onSubmit={submit} noValidate>
      <h2>{onRemove ? 'View / edit profile' : 'Add a profile'}</h2>
      <label className="t-field">Learner
        <input value={f.name} onChange={(e) => set('name', e.target.value)} />
      </label>
      <label className="t-field">Strengths
        <input value={f.strengths} onChange={(e) => set('strengths', e.target.value)} placeholder="For example: visual thinking" />
      </label>
      <label className="t-field">Support that helps
        <textarea rows="3" value={f.support} onChange={(e) => set('support', e.target.value)} placeholder="For example: short, sequenced instructions" />
      </label>
      <label className="t-field">Learning language
        <select value={f.language || 'en'} onChange={(e) => set('language', e.target.value)}>
          {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
        </select>
        <span className="t-hint">Chosen with the learner or family. Mothusi never guesses a language from a name or background.</span>
      </label>
      <p className="t-note">
        Record strengths, learning preferences you have observed, and strategies that have helped.
        Do not add diagnoses: Mothusi removes diagnostic labels before its agents see a profile.
      </p>
      {error && <p className="t-error" role="alert">{error}</p>}
      <div className="row">
        <button type="submit" className="btn">Save profile</button>
        <button type="button" className="btn secondary" onClick={onCancel}>Cancel</button>
        {onRemove && <button type="button" className="btn danger" onClick={onRemove}>Remove profile</button>}
      </div>
    </form>
  )
}

export default function LearnerProfiles() {
  const { learners, addLearner, updateLearner, removeLearner } = useTeacher()
  const active = useActiveClasses()

  const [classId, setClassId] = useState(active[0]?.id || '')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(null) // null | 'new' | learner id

  const q = query.trim().toLowerCase()
  const rows = learners.filter(
    (l) => l.classId === classId && (!q || l.name.toLowerCase().includes(q) || l.code.toLowerCase().includes(q))
  )
  const editingLearner = learners.find((l) => l.id === editing)
  const cls = active.find((c) => c.id === classId)
  const rosterApi = useRoster()

  return (
    <div className="stack">
      <div className="t-page-head">
        <div>
          <h1>Learners &amp; codes</h1>
          <p className="muted">Support profiles for the learners you plan for, and the codes learners use to sign in.</p>
        </div>
        <button type="button" className="btn" disabled={!classId} onClick={() => setEditing('new')}>Add profile</button>
      </div>

      {active.length === 0 ? (
        <p className="card muted">Add a class first, then you can add learner profiles to it.</p>
      ) : (
        <>
          <div className="card t-form-grid">
            <label className="t-field">Select class
              <select value={classId} onChange={(e) => { setClassId(e.target.value); setEditing(null) }}>
                {active.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="t-field">Search learner
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name or learner ID" />
            </label>
          </div>

          {cls && <ClassCodeCard cls={cls} rosterApi={rosterApi} />}
          {rosterApi.error && <p className="t-error" role="alert">{rosterApi.error}</p>}

          <section className="card">
            <div className="t-table-wrap">
              <table className="t-table t-stack-sm">
                <thead>
                  <tr><th>Learner</th><th>Strengths</th><th>Support that helps</th><th>Language</th><th>Sign-in</th><th>Action</th></tr>
                </thead>
                <tbody>
                  {rows.map((l) => (
                    <tr key={l.id}>
                      <td data-label="Learner">{l.name}<br /><span className="muted small-text">{l.code}</span></td>
                      <td data-label="Strengths">{l.strengths || <span className="muted">Not added</span>}</td>
                      <td data-label="Support that helps">{l.support || <span className="muted">Not added</span>}</td>
                      <td data-label="Language">{languageLabel(l.language || 'en')}</td>
                      <td data-label="Sign-in">{cls && <LearnerCodeCell cls={cls} learner={l} rosterApi={rosterApi} />}</td>
                      <td><button type="button" className="btn secondary small" onClick={() => setEditing(l.id)}>View / Edit</button></td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr><td colSpan="6" className="muted">No learner profiles found for this class.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {editing === 'new' && (
            <ProfileForm
              initial={{ name: '', strengths: '', support: '', language: 'en' }}
              onSave={(data) => { addLearner(classId, data); setEditing(null) }}
              onCancel={() => setEditing(null)}
            />
          )}

          {editingLearner && (
            <ProfileForm
              key={editingLearner.id}
              initial={editingLearner}
              onSave={(data) => { updateLearner(editingLearner.id, data); setEditing(null) }}
              onCancel={() => setEditing(null)}
              onRemove={() => {
                removeLearner(editingLearner.id) // the toast offers Undo
                setEditing(null)
              }}
            />
          )}
        </>
      )}

      <p className="t-note">
        Safe profile design: only record what helps you teach. Learners only see lessons you approve for their class,
        and a personal code links one learner account to one profile.
      </p>
    </div>
  )
}
