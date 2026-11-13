import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Header from '../components/Header.jsx'
import Footer from '../components/Footer.jsx'
import learnerImg from '../assets/learner-portal.jpeg'
import teacherImg from '../assets/teacher-side.jpeg'
import './Home.css'

// A looping preview of what a teacher sees: the agents preparing a lesson, then the lesson card.
const DEMO_STEPS = [
  { label: 'Remembering what worked with these learners', out: 'Learner B: short steps worked last week' },
  { label: 'Reading what the lesson asks of learners', out: 'Found 5 demands: new words, drawing, sharing' },
  { label: 'Matching those demands to your learners', out: '3 learners need support in 2 phases' },
  { label: 'Designing support that fits your time', out: 'Proposed 4 adaptations (8 of 10 min)' },
  { label: 'Checking every idea against your classroom', out: 'Rejected 1: needs a printer. Fixed.' },
  { label: 'Translating into home languages', out: 'Setswana version checked' },
]

const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

function ProductPreview() {
  const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const [tick, setTick] = useState(reduced ? DEMO_STEPS.length + 2 : 0)
  useEffect(() => {
    if (reduced) return undefined
    const t = setInterval(() => setTick((n) => (n >= DEMO_STEPS.length + 4 ? 0 : n + 1)), 1100)
    return () => clearInterval(t)
  }, [reduced])
  const ready = tick >= DEMO_STEPS.length

  return (
    <div className="hp" aria-hidden="true">
      <div className="hp-panel">
        <div className="hp-head">
          <strong>{ready ? 'Your lesson plan is ready' : 'Preparing your lesson plan'}</strong>
          <span className="hp-clock">{clock(ready ? 168 : 6 + tick * 26)}</span>
        </div>
        <div className="hp-bar"><span style={{ width: `${Math.min(100, (tick / DEMO_STEPS.length) * 100)}%` }} /></div>
        <ol className="hp-steps">
          {DEMO_STEPS.map((s, i) => (
            <li key={s.label} className={i < tick ? 'done' : i === tick ? 'working' : ''}>
              <span className="hp-icon">{i < tick ? '✓' : ''}</span>
              <span><strong>{s.label}</strong>{i < tick && <small>{s.out}</small>}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className={`hp-card ${ready ? 'show' : ''}`}>
        <span className="hp-chip">Ready for review</span>
        <strong className="hp-topic">Halves and quarters</strong>
        <span className="hp-meta">Grade 2 Mathematics • 45 min</span>
        <ul>
          <li><b>Learner A</b> Fold paper strips, then shade</li>
          <li><b>Learner B</b> One instruction at a time</li>
          <li><b>Learner C</b> Explanation in Setswana</li>
        </ul>
        <span className="hp-approve">Approve</span>
      </div>
    </div>
  )
}

const HOW = [
  { n: 1, title: 'Choose your class and a topic', text: 'Pick a CAPS topic or type your own. Mothusi already knows your class, your learners’ support needs and your usual conditions.' },
  { n: 2, title: 'Eight agents plan and check', text: 'They find what the lesson demands, match it to your learners, design support that fits your time, and reject anything that breaks your limits. You can watch every step.' },
  { n: 3, title: 'You approve. Learners learn their way', text: 'Nothing reaches learners until you approve it. They open it on any phone, in their language, with read-aloud and another explanation when they need one.' },
  { n: 4, title: 'What happened shapes the next plan', text: 'Learners’ practice and your feedback go to the Progress Tracker, so the next lesson starts from what really worked.' },
]

export default function Home() {
  return (
    <div className="theme-teacher home">
      <a className="skip-link" href="#home-main">Skip to content</a>
      <Header />

      <main id="home-main" tabIndex={-1}>
        <section className="hero">
          <div className="hero-inner">
            <div className="hero-copy">
              <p className="hero-eyebrow">For Grade 1 to 4 teachers in South Africa</p>
              <h1>Teachers should not have to do everything alone.</h1>
              <p className="hero-sub">
                Mothusi is a classroom colleague. Tell it what you are teaching tomorrow; it prepares support for every
                learner who needs it, within the time and resources you really have.
              </p>
              <div className="hero-actions">
                <Link to="/teacher/onboarding" className="btn">Start as a teacher</Link>
                <Link to="/login" className="btn secondary">Log in</Link>
              </div>
              <p className="hero-learner"><Link to="/join">Learner? Sign in with your class code and pictures</Link></p>
            </div>
            <ProductPreview />
          </div>
        </section>

        <section id="about" className="section">
          <div className="section-inner">
            <h2>What is Mothusi?</h2>
            <p className="section-lead">
              Mothusi means "helper" in Setswana. It turns what your learners need into practical things to do in your
              classroom tomorrow.
            </p>
            <div className="about-grid">
              <div className="about-item">
                <span className="about-icon" aria-hidden="true">✓</span>
                <h3>A helper for teachers</h3>
                <p>Reads your lesson and your learners, then suggests changes that fit your class size, time and resources.</p>
              </div>
              <div className="about-item">
                <span className="about-icon" aria-hidden="true">✦</span>
                <h3>Learning that fits each child</h3>
                <p>Different explanations, activities and questions for the same learning goal.</p>
              </div>
              <div className="about-item">
                <span className="about-icon" aria-hidden="true">◉</span>
                <h3>Learning in your language</h3>
                <p>Learners choose the language they learn in. Translations are checked before learners see them.</p>
              </div>
            </div>
            <p className="about-note">
              Teachers always stay in charge. Mothusi suggests and prepares support, and never diagnoses learners.
            </p>
          </div>
        </section>

        <section id="journey" className="section section-tint">
          <div className="section-inner">
            <h2>How it works</h2>
            <ol className="how-steps">
              {HOW.map((s) => (
                <li key={s.n}>
                  <span className="how-n" aria-hidden="true">{s.n}</span>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="choose" className="choose" aria-label="Get started">
          <div className="home-split">
            <Link to="/join" className="home-door learner">
              <img src={learnerImg} alt="" />
              <span className="home-cta">I am a learner</span>
              <span className="home-door-note">Sign in with your class code</span>
            </Link>
            <Link to="/teacher/onboarding" className="home-door teacher">
              <img src={teacherImg} alt="" />
              <span className="home-cta">I am a teacher</span>
              <span className="home-door-note">Create your free account</span>
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}
