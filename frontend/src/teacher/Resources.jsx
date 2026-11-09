import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTeacher } from './TeacherContext.jsx'
import { MATERIAL_TYPES, unique, byGrade } from './curriculum.js'
import { formatDate, formatSize } from './format.js'

const ACCEPT = '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.png,.jpg,.jpeg'
const MAX_BYTES = 10 * 1024 * 1024

export default function Resources() {
  const { profile, resources, addResource, deleteResource } = useTeacher()
  const fileRef = useRef(null)

  const grades = [...profile.grades].sort(byGrade)
  const subjects = profile.subjects

  const [form, setForm] = useState({
    grade: grades[0] || '', subject: subjects[0] || '', type: MATERIAL_TYPES[0], title: '', topic: '', file: null,
  })
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const [fGrade, setFGrade] = useState('all')
  const [fSubject, setFSubject] = useState('all')

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  const pickFile = (e) => {
    const file = e.target.files?.[0] || null
    setDone('')
    if (file && file.size > MAX_BYTES) {
      setError('That file is larger than 10 MB. Choose a smaller file.')
      e.target.value = ''
      set('file', null)
      return
    }
    setError('')
    setForm((f) => ({ ...f, file, title: f.title || (file ? file.name.replace(/\.[^.]+$/, '') : '') }))
  }

  const submit = (e) => {
    e.preventDefault()
    if (!form.grade || !form.subject) return setError('Choose a grade and a subject.')
    if (!form.file) return setError('Choose a file to upload.')
    if (form.title.trim().length < 2) return setError('Give the material a title.')
    setError('')
    addResource({
      file: form.file, grade: form.grade, subject: form.subject, type: form.type,
      title: form.title.trim(), topic: form.topic.trim(),
    })
    setDone(`"${form.title.trim()}" was added to ${form.grade} ${form.subject}.`)
    setForm((f) => ({ ...f, title: '', topic: '', file: null }))
    if (fileRef.current) fileRef.current.value = ''
  }

  const remove = (r) => {
    if (window.confirm(`Delete "${r.title}"?`)) deleteResource(r.id)
  }

  const shown = resources.filter(
    (r) => (fGrade === 'all' || r.grade === fGrade) && (fSubject === 'all' || r.subject === fSubject)
  )
  const groups = unique(shown.map((r) => `${r.grade}|${r.subject}`))
    .sort((a, b) => byGrade(a.split('|')[0], b.split('|')[0]) || a.localeCompare(b))

  const filterGrades = unique(resources.map((r) => r.grade)).sort(byGrade)
  const filterSubjects = unique(resources.map((r) => r.subject))

  return (
    <div className="stack">
      <div className="t-page-head">
        <div>
          <h1>Resources</h1>
          <p className="muted">Upload curriculum and teaching materials for the grades and subjects you teach.</p>
        </div>
      </div>

      <form className="card stack" onSubmit={submit} noValidate>
        <h2>Upload material</h2>
        <div className="t-form-grid">
          <label className="t-field">Grade
            <select value={form.grade} onChange={(e) => set('grade', e.target.value)}>
              {grades.map((g) => <option key={g}>{g}</option>)}
            </select>
          </label>
          <label className="t-field">Subject
            <select value={form.subject} onChange={(e) => set('subject', e.target.value)}>
              {subjects.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label className="t-field">Material type
            <select value={form.type} onChange={(e) => set('type', e.target.value)}>
              {MATERIAL_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
        </div>

        <div className="t-form-grid">
          <label className="t-field">Title
            <input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="For example: Term 4 fractions plan" />
          </label>
          <label className="t-field">Curriculum topic (optional)
            <input value={form.topic} onChange={(e) => set('topic', e.target.value)} placeholder="For example: Fractions" />
          </label>
        </div>

        <label className="t-field">File
          <input ref={fileRef} type="file" accept={ACCEPT} onChange={pickFile} />
          <span className="t-hint">PDF, Word, PowerPoint, Excel, text or image files up to 10 MB.</span>
        </label>

        {error && <p className="t-error" role="alert">{error}</p>}
        {done && <p className="t-success" role="status">{done}</p>}

        <div className="row">
          <button type="submit" className="btn">Upload</button>
          <span className="muted">
            Need another grade or subject? Update it in <Link to="/teacher/profile">My Profile</Link>.
          </span>
        </div>
        <p className="t-hint">Uploads are kept in this browser until the account is connected to storage.</p>
      </form>

      <section className="card stack">
        <h2>Your materials</h2>

        {resources.length > 0 && (
          <div className="t-form-grid">
            <label className="t-field">Show grade
              <select value={fGrade} onChange={(e) => setFGrade(e.target.value)}>
                <option value="all">All grades</option>
                {filterGrades.map((g) => <option key={g}>{g}</option>)}
              </select>
            </label>
            <label className="t-field">Show subject
              <select value={fSubject} onChange={(e) => setFSubject(e.target.value)}>
                <option value="all">All subjects</option>
                {filterSubjects.map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
          </div>
        )}

        {resources.length === 0 && <p className="muted">Nothing uploaded yet. Add your first material above.</p>}
        {resources.length > 0 && shown.length === 0 && <p className="muted">No materials match these filters.</p>}

        {groups.map((key) => {
          const [grade, subject] = key.split('|')
          return (
            <div key={key} className="stack">
              <h3>{grade} {subject}</h3>
              <ul className="t-list">
                {shown.filter((r) => r.grade === grade && r.subject === subject).map((r) => (
                  <li key={r.id} className="t-resource">
                    <div>
                      <strong>{r.title}</strong>
                      <div className="row tight">
                        <span className="chip">{r.type}</span>
                        {r.topic && <span className="chip">{r.topic}</span>}
                      </div>
                      <span className="muted small-text">{r.fileName} • {formatSize(r.size)} • Added {formatDate(r.uploadedAt)}</span>
                    </div>
                    <div className="row tight">
                      <a href={r.url} target="_blank" rel="noreferrer" className="btn secondary small">Open</a>
                      <button type="button" className="btn danger small" onClick={() => remove(r)}>Delete</button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </section>
    </div>
  )
}
