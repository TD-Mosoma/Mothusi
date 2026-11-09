import { Link } from 'react-router-dom'
import { useTeacher } from './TeacherContext.jsx'

export default function Settings() {
  const { prefs, updatePrefs } = useTeacher()

  return (
    <div className="stack">
      <div className="t-page-head">
        <div>
          <h1>Settings</h1>
          <p className="muted">Choose how the teacher portal looks and behaves for you.</p>
        </div>
      </div>

      <section className="card stack">
        <h2>Menu</h2>
        <fieldset className="t-fieldset">
          <legend>When I open the portal on a computer</legend>
          <label className="t-check">
            <input type="radio" name="menu" checked={prefs.menuDefault === 'open'} onChange={() => updatePrefs({ menuDefault: 'open' })} />
            Show the menu
          </label>
          <label className="t-check">
            <input type="radio" name="menu" checked={prefs.menuDefault === 'closed'} onChange={() => updatePrefs({ menuDefault: 'closed' })} />
            Hide the menu
          </label>
        </fieldset>
        <p className="muted">You can always show or hide the menu with the button at the top left.</p>
      </section>

      <section className="card stack">
        <h2>Reading</h2>
        <label className="t-check">
          <input type="checkbox" checked={prefs.largeText} onChange={(e) => updatePrefs({ largeText: e.target.checked })} />
          Use larger text
        </label>
      </section>

      <section className="card stack">
        <h2>Privacy</h2>
        <p>Learner profiles in this demo use made-up data. Only record what helps you teach, and never add diagnoses.</p>
      </section>

      <div><Link to="/" className="btn secondary">Log out</Link></div>
    </div>
  )
}
