import { useTeacher } from './TeacherContext.jsx'
import { useSignOut } from '../services/AuthContext.jsx'
import { THEME_OPTIONS, useThemePref } from '../services/theme.js'

export default function Settings() {
  const { prefs, updatePrefs } = useTeacher()
  const [theme, setTheme] = useThemePref()
  const signOut = useSignOut()

  return (
    <div className="stack">
      <div className="t-page-head">
        <div>
          <h1>Settings</h1>
          <p className="muted">Choose how Mothusi looks and behaves for you. These settings stay on this device.</p>
        </div>
      </div>

      <section className="card stack">
        <h2>Appearance</h2>
        <fieldset className="t-fieldset">
          <legend>Colour theme</legend>
          {THEME_OPTIONS.map((o) => (
            <label key={o.value} className="t-check">
              <input type="radio" name="theme" checked={theme === o.value} onChange={() => setTheme(o.value)} />
              {o.label}
            </label>
          ))}
        </fieldset>
        <label className="t-check">
          <input type="checkbox" checked={prefs.largeText} onChange={(e) => updatePrefs({ largeText: e.target.checked })} />
          Use larger text
        </label>
      </section>

      <section className="card stack">
        <h2>Menu</h2>
        <fieldset className="t-fieldset">
          <legend>When I open Mothusi on a computer</legend>
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
        <h2>While Mothusi prepares a lesson</h2>
        <label className="t-check">
          <input type="checkbox" checked={!!prefs.agentDetail} onChange={(e) => updatePrefs({ agentDetail: e.target.checked })} />
          Always show how the agents worked (every step, check and correction)
        </label>
        <p className="muted">When this is off, you see a short progress view. You can open the full view at any time.</p>
      </section>

      <section className="card stack">
        <h2>Privacy</h2>
        <p>Only record what helps you teach. Never add diagnoses: Mothusi removes diagnostic labels before its agents see a profile.</p>
        <p className="muted">Your classes, learner profiles and lesson plans are saved to your Mothusi account, so they follow you to any device.</p>
      </section>

      <div><button type="button" className="btn secondary" onClick={signOut}>Log out</button></div>
    </div>
  )
}
