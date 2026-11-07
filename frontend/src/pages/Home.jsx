import { Link } from 'react-router-dom'
import Header from '../components/Header.jsx'
import Footer from '../components/Footer.jsx'
import learnerImg from '../assets/learner-portal.jpeg'
import teacherImg from '../assets/teacher-side.jpeg'
import howItWorksImg from '../assets/how-it-works.jpeg'
import './Home.css'

export default function Home() {
  return (
    <div className="home">
      <Header />

      <main>
        {/* 1. Landing */}
        <section className="hero">
          <div className="hero-inner">
            <h1>Teachers should not have to do everything alone.</h1>
            <p className="hero-sub">
              Mothusi is an intelligent classroom colleague. It helps teachers support every learner,
              without adding more admin work.
            </p>
            <div className="hero-actions">
              <a href="#choose" className="btn">Get started</a>
              <a href="#journey" className="btn secondary">See how it works</a>
            </div>
          </div>
        </section>

        {/* 2. What Mothusi is about */}
        <section id="about" className="section">
          <div className="section-inner">
            <h2>What is Mothusi?</h2>
            <p className="section-lead">
              Mothusi means "helper" in Setswana. It works alongside teachers to turn what learners need
              into practical things to do in the classroom.
            </p>
            <div className="about-grid">
              <div className="about-item">
                <h3>A helper for teachers</h3>
                <p>Looks at your lesson and your learners, then suggests changes that fit your classroom.</p>
              </div>
              <div className="about-item">
                <h3>Learning that fits each child</h3>
                <p>Offers different explanations, activities and questions for the same learning goal.</p>
              </div>
              <div className="about-item">
                <h3>Learning in your language</h3>
                <p>Learners choose the language they like to learn in, and lessons follow their interests.</p>
              </div>
            </div>
            <p className="about-note">
              Teachers always stay in charge. Mothusi suggests and prepares support, and never diagnoses learners.
            </p>
          </div>
        </section>

        {/* 3. How it works (picture) */}
        <section id="journey" className="section section-tint">
          <div className="section-inner">
            <h2>How it works</h2>
            <div className="how-scroll">
              <img
                className="how-img"
                src={howItWorksImg}
                alt="How Mothusi works in four steps. One: the teacher shares a lesson, adding lesson information, learner needs and classroom details. Two: Mothusi prepares support, suggesting practical changes, checking its work and building a lesson-support pack. Three: learners learn their way, getting explanations and activities linked to their own language and interests. Four: the teacher gives feedback on what worked and what did not, for a better future plan."
              />
            </div>
          </div>
        </section>

        {/* 4. Choose a portal (unchanged) */}
        <section id="choose" className="choose">
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
        </section>
      </main>

      <Footer />
    </div>
  )
}