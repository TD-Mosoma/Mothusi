import { Link } from 'react-router-dom'
import learnerImg from '../assets/learner-portal.jpeg'
import teacherImg from '../assets/teacher-side.jpeg'
import './Home.css'

export default function Home() {
  return (
    <main className="home">
      <header className="home-head">
        <h1>Mothusi</h1>
        <p className="muted">Your classroom colleague. Choose where to start.</p>
      </header>

      <div className="home-split">
        <Link to="/learner/onboarding" className="home-door learner">
          <img
            src={learnerImg}
            alt="Learner portal: a smiling learner using a tablet, surrounded by books, a globe, stars and numbers"
          />
          <span className="home-cta">I am a learner</span>
        </Link>

        <Link to="/teacher/onboarding" className="home-door teacher">
          <img
            src={teacherImg}
            alt="Teacher side: a teacher planning lessons on a computer and tablet"
          />
          <span className="home-cta">I am a teacher</span>
        </Link>
      </div>
    </main>
  )
}
