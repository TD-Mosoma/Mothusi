import { Outlet, NavLink, Link } from 'react-router-dom'
import './teacher.css'

export default function TeacherLayout() {
  return (
    <div className="theme-teacher teacher-shell">
      <aside className="t-side">
        <Link to="/" className="t-logo">Mothusi</Link>
        <nav className="t-nav" aria-label="Teacher navigation">
          <NavLink to="/teacher" end>My classes</NavLink>
          <NavLink to="/teacher/plan">Plan a lesson</NavLink>
        </nav>
      </aside>
      <main className="t-main"><Outlet /></main>
    </div>
  )
}
