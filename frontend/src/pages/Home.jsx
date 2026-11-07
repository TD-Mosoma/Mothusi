import { Link } from 'react-router-dom'
import './Home.css'

export default function Home() {
  return (
    <main className="home">
      <header className="home-head">
        <h1>Mothusi</h1>
        <p className="muted">Your classroom colleague. Choose where to start.</p>
      </header>
      <div className="home-split">
        <Link to="/learner" className="home-door learner">
          <h2>I am a learner</h2>
          <p>Learn at your own pace, in your own language.</p>
        </Link>
        <Link to="/teacher" className="home-door teacher">
          <h2>I am a teacher</h2>
          <p>Plan lessons that work for every learner in your class.</p>
        </Link>
      </div>
    </main>
  )
}
