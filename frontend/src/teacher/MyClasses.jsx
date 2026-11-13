import { useState } from 'react'
import { useTeacher } from './TeacherContext.jsx'
import { GRADES, subjectsFor } from './curriculum.js'

// Used for both "Add class" and "Edit class"
function ClassForm({ initial, submitLabel, onSave, onCancel }) {
  const { profile } = useTeacher()
  const [f, setF] = useState(initial)
  const [error, setError] = useState('')

  const grades = GRADES.filter((g) => profile.grades.includes(g) || g === initial.grade)
  const subjects = subjectsFor(f.grade)
  const set = (key, value) => setF((x) => ({ ...x, [key]: value }))
  const setGrade = (grade) => setF((x) => ({ ...x, grade, subjects: x.subjects.filter((s) => subjectsFor(grade).includes(s)) }))
  const toggleSubject = (s) =>
    setF((x) => ({ ...x, subjects: x.subjects.includes(s) ? x.subjects.filter((v) => v !== s) : [...x.subjects, s] }))

  const submit = (e) => {
    e.preventDefault()
    if (f.name.trim().length < 2) return setError('Give the class a name, for example Grade 3B.')
    if (!f.grade) return setError('Choose a grade.')
    if (f.subjects.length === 0) return setError('Choose at least one subject.')
    setError('')
    onSave({ ...f, name: f.name.trim(), size: Math.max(0, Number(f.size) || 0) })
  }

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <div className="t-form-grid">
        <label className="t-field">Class name
          <input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Grade 3B" />
        </label>
        <label className="t-field">Grade
          <select value={f.grade} onChange={(e) => setGrade(e.target.value)}>
            {grades.map((g) => <option key={g}>{g}</option>)}
          </select>
        </label>
        <label className="t-field">Number of learners
          <input type="number" min="0" value={f.size} onChange={(e) => set('size', e.target.value)} />
        </label>
      </div>

      <fieldset className="t-fieldset">
        <legend>Subjects you teach this class (CAPS subjects for {f.grade || 'the grade'})</legend>
        <div className="t-toggles">
          {subjects.map((s) => (
            <button key={s} type="button" className={`t-toggle ${f.subjects.includes(s) ? 'on' : ''}`}
              aria-pressed={f.subjects.includes(s)} onClick={() => toggleSubject(s)}>{s}</button>
          ))}
        </div>
      </fieldset>

      <label className="t-check">
        <input type="checkbox" checked={f.classTeacher} onChange={(e) => set('classTeacher', e.target.checked)} />
        I am the class teacher
      </label>

      {error && <p className="t-error" role="alert">{error}</p>}
      <div className="row">
        <button type="submit" className="btn">{submitLabel}</button>
        {onCancel && <button type="button" className="btn secondary" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  )
}

function ClassDetail({ cls, onArchived }) {
  const { updateClass, learners, addLearner, removeLearner } = useTeacher()
  const [newName, setNewName] = useState('')
  const [saved, setSaved] = useState(false)
  const classLearners = learners.filter((l) => l.classId === cls.id)

  const add = (e) => {
    e.preventDefault()
    if (newName.trim().length < 1) return
    addLearner(cls.id, { name: newName.trim() })
    setNewName('')
  }

  const remove = (l) => {
    if (window.confirm(`Remove ${l.name} from ${cls.name}?`)) removeLearner(l.id)
  }

  const archive = () => {
    if (window.confirm(`Archive ${cls.name}? Its lesson history is kept and you can restore it later.`)) {
      updateClass(cls.id, { archived: true })
      onArchived()
    }
  }

  return (
    <section className="card stack" aria-label={`Manage ${cls.name}`}>
      <h2>Manage {cls.name}</h2>

      <ClassForm
        initial={{ name: cls.name, grade: cls.grade, subjects: cls.subjects, size: cls.size, classTeacher: !!cls.classTeacher }}
        submitLabel="Save class"
        onSave={(data) => { updateClass(cls.id, data); setSaved(true) }}
      />
      {saved && <p className="t-success" role="status">Class saved.</p>}

      <div className="stack">
        <h3>Learners with support profiles</h3>
        {classLearners.length === 0 && <p className="muted">No learner profiles yet. Add one below.</p>}
        <ul className="t-list">
          {classLearners.map((l) => (
            <li key={l.id} className="t-list-row">
              <span>{l.name}</span>
              <button type="button" className="btn secondary small" onClick={() => remove(l)}>Remove</button>
            </li>
          ))}
        </ul>
        <form className="row" onSubmit={add}>
          <label className="t-field grow">Add a learner
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Learner name" />
          </label>
          <button type="submit" className="btn secondary">Add learner</button>
        </form>
        <p className="muted">Add strengths and support details in Learner Profiles.</p>
      </div>

      <div className="t-danger-zone">
        <button type="button" className="btn danger" onClick={archive}>Archive class</button>
      </div>
    </section>
  )
}

export default function MyClasses() {
  const { profile, classes, addClass, updateClass } = useTeacher()
  const [selectedId, setSelectedId] = useState(null)
  const [adding, setAdding] = useState(false)

  const active = classes.filter((c) => !c.archived)
  const archived = classes.filter((c) => c.archived)
  const selected = active.find((c) => c.id === selectedId)

  return (
    <div className="stack">
      <div className="t-page-head">
        <div>
          <h1>My Classes</h1>
          <p className="muted">Manage the classes and grade groups you currently teach.</p>
        </div>
        <button type="button" className="btn" onClick={() => { setAdding(true); setSelectedId(null) }}>+ Add class</button>
      </div>

      {adding && (
        <section className="card stack">
          <h2>Add a class</h2>
          <ClassForm
            initial={{ name: '', grade: profile.grades[0] || '', subjects: [], size: 30, classTeacher: false }}
            submitLabel="Add class"
            onSave={(data) => { setSelectedId(addClass(data)); setAdding(false) }}
            onCancel={() => setAdding(false)}
          />
        </section>
      )}

      {active.length === 0 && !adding && (
        <p className="card muted">You have no active classes. Choose "+ Add class" to create one.</p>
      )}

      <div className="t-class-grid">
        {active.map((c) => (
          <article key={c.id} className={`card t-class-card ${c.id === selectedId ? 'selected' : ''}`}>
            <h2>{c.name}</h2>
            <p className="muted">{c.subjects.join(', ')}</p>
            <p>{c.size} learners{c.classTeacher ? ' • Class teacher' : ''}</p>
            <button type="button" className="btn secondary small" aria-pressed={c.id === selectedId}
              onClick={() => { setSelectedId(c.id === selectedId ? null : c.id); setAdding(false) }}>
              {c.id === selectedId ? 'Close' : 'Manage'}
            </button>
          </article>
        ))}
      </div>

      {selected && <ClassDetail key={selected.id} cls={selected} onArchived={() => setSelectedId(null)} />}

      {!selected && (
        <p className="t-note">
          Choose Manage on a class to edit it, assign subjects, add or remove learners, or archive it.
        </p>
      )}

      {archived.length > 0 && (
        <section className="card stack">
          <h2>Archived classes</h2>
          <ul className="t-list">
            {archived.map((c) => (
              <li key={c.id} className="t-list-row">
                <span>{c.name} <span className="muted">({c.grade})</span></span>
                <button type="button" className="btn secondary small" onClick={() => updateClass(c.id, { archived: false })}>Restore</button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
