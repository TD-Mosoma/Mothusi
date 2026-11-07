import { Link } from 'react-router-dom'
import { classroom, learners } from '../services/mockData.js'

export default function TeacherDashboard() {
  return (
    <div className="stack">
      <h1>My classes</h1>

      <section className="card">
        <div className="row t-between">
          <div>
            <h2>{classroom.name}</h2>
            <p className="muted">{classroom.learners} learners. Next lesson: {classroom.lesson}.</p>
          </div>
          <Link to="/teacher/plan" className="btn">Plan this lesson</Link>
        </div>
      </section>

      <section className="card">
        <h2>Learner support profiles</h2>
        <p className="muted">These describe what helps each learner. They are not diagnoses.</p>
        <table className="t-table">
          <thead><tr><th>Learner</th><th>What helps</th></tr></thead>
          <tbody>
            {learners.map((l) => (
              <tr key={l.id}>
                <td>{l.name}</td>
                <td className="row">{l.supports.map((s) => <span key={s} className="chip">{s}</span>)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="btn secondary">Add a learner profile</button>
      </section>
    </div>
  )
}
