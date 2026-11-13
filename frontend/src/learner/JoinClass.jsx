import { useState } from 'react'
import { joinClass } from '../services/api.js'
import { translate } from './translations.js'

// Learners enter the code their teacher gave them to see that class's lessons.
export default function JoinClass({ lang, onJoined, compact = false }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      onJoined(await joinClass(code))
      setCode('')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className={`l-join ${compact ? 'compact' : ''}`} onSubmit={submit}>
      <label className="l-field">
        <span>{translate(lang, 'Code from your teacher')}</span>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="ABCD-2345"
          maxLength={12}
          autoComplete="off"
          spellCheck={false}
          required
        />
      </label>
      <button type="submit" className="btn" disabled={saving || code.replace(/[^A-Z0-9]/g, '').length < 8}>
        {saving ? translate(lang, 'Joining…') : translate(lang, 'Join my class')}
      </button>
      {error && <p className="l-inline-status" role="alert">{error}</p>}
    </form>
  )
}
