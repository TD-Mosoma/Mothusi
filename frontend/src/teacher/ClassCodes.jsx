import { useCallback, useEffect, useRef, useState } from 'react'
import { getRoster, issueJoinCode, resetLearnerPictures, revokeJoinCode, unlinkLearner } from '../services/api.js'
import { formatDate } from './format.js'

// Codes the teacher hands out so learners can join a class (class code) or a learner profile (personal code).
export function useRoster() {
  const [roster, setRoster] = useState({ codes: [], learners: [], picture_profiles: [] })
  const [error, setError] = useState('')
  const reload = useCallback(() => getRoster().then((r) => { setRoster(r); setError('') }, (e) => setError(e.message)), [])
  useEffect(() => { reload() }, [reload])

  const act = async (fn) => {
    setError('')
    try {
      await fn()
      await reload()
    } catch (e) {
      setError(e.message)
    }
  }
  return {
    roster,
    error,
    issue: (args) => act(() => issueJoinCode(args)),
    revoke: (code) => act(() => revokeJoinCode(code)),
    unlink: (accountId) => act(() => unlinkLearner(accountId)),
    resetPictures: (profileId) => act(() => resetLearnerPictures(profileId)),
  }
}

function CodeChip({ code }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard unavailable: the code is still visible */ }
  }
  return (
    <span className="t-code">
      <code>{code}</code>
      <button type="button" className="btn ghost small" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
    </span>
  )
}

export function ClassCodeCard({ cls, rosterApi }) {
  const { roster, issue, revoke, unlink } = rosterApi
  const classCode = roster.codes.find((c) => c.class_id === cls.id && !c.learner_profile_id)
  const joined = roster.learners.filter((l) => l.class_id === cls.id)
  const [showing, setShowing] = useState(false)

  return (
    <section className="card stack t-codes">
      <div className="t-codes-head">
        <div>
          <h2>Learner sign-in for {cls.name}</h2>
          <p className="muted small-text">
            Young learners sign in with the class code, then tap their name and three pictures. Older learners can also
            use the code when they create an account. A personal code (in the table below) links one learner to their own profile.
          </p>
        </div>
        <div className="row tight">
          {classCode ? (
            <>
              <CodeChip code={classCode.code} />
              <button type="button" className="btn small" onClick={() => setShowing(true)}>Show on screen</button>
              <button type="button" className="btn secondary small" onClick={() => issue({ classId: cls.id, className: cls.name })}>New code</button>
              <button type="button" className="btn ghost small" onClick={() => revoke(classCode.code)}>Turn off</button>
            </>
          ) : (
            <button type="button" className="btn small" onClick={() => issue({ classId: cls.id, className: cls.name })}>Create class code</button>
          )}
        </div>
      </div>
      {showing && classCode && <CodeOnScreen code={classCode.code} className={cls.name} onClose={() => setShowing(false)} />}
      <details className="t-joined">
        <summary>{joined.length} learner account{joined.length === 1 ? '' : 's'} joined</summary>
        {joined.length === 0 && <p className="muted small-text">No learners have joined yet.</p>}
        <ul className="t-list">
          {joined.map((l) => (
            <li key={l.account_id} className="t-list-row">
              <span>
                <strong>{l.name}</strong>
                <span className="muted small-text"> • {l.learner_label ? `linked to ${l.learner_label}` : 'class code'} • joined {formatDate(l.joined_at)}</span>
              </span>
              <button type="button" className="btn ghost small"
                onClick={() => window.confirm(`Remove ${l.name} from ${cls.name}? They will no longer see this class's lessons.`) && unlink(l.account_id)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      </details>
    </section>
  )
}

export function LearnerCodeCell({ cls, learner, rosterApi }) {
  const { roster, issue, unlink, resetPictures } = rosterApi
  const linked = roster.learners.find((l) => l.class_id === cls.id && l.learner_profile_id === learner.id)
  const code = roster.codes.find((c) => c.class_id === cls.id && c.learner_profile_id === learner.id)
  const pictures = (roster.picture_profiles || []).includes(learner.id)
  const create = () => issue({ classId: cls.id, className: cls.name, learnerProfileId: learner.id, learnerLabel: learner.name })

  if (pictures) {
    return (
      <span className="t-code-cell">
        <span className="chip ok">Signs in with pictures</span>
        <button type="button" className="btn ghost small"
          onClick={() => window.confirm(`Reset ${learner.name}'s pictures? They will choose three new pictures next time they sign in.`) && resetPictures(learner.id)}>
          Reset pictures
        </button>
      </span>
    )
  }
  if (linked) {
    return (
      <span className="t-code-cell">
        <span className="chip ok">Linked: {linked.name}</span>
        <button type="button" className="btn ghost small"
          onClick={() => window.confirm(`Unlink ${linked.name} from ${learner.name}'s profile?`) && unlink(linked.account_id)}>Unlink</button>
      </span>
    )
  }
  if (code) {
    return (
      <span className="t-code-cell">
        <CodeChip code={code.code} />
        <button type="button" className="btn ghost small" onClick={create}>New code</button>
      </span>
    )
  }
  return <button type="button" className="btn secondary small" onClick={create}>Create code</button>
}

// The class code, large enough to read from the back of the classroom.
function CodeOnScreen({ code, className, onClose }) {
  const ref = useRef(null)
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    ref.current?.focus()
    const onKey = (e) => { if (e.key === 'Escape') close.current() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
  const site = window.location.host
  return (
    <div className="t-onscreen" role="dialog" aria-modal="true" aria-label={`Class code for ${className}`}>
      <button type="button" className="t-onscreen-close btn secondary" onClick={onClose} ref={ref}>Close</button>
      <p className="t-onscreen-class">{className}</p>
      <p className="t-onscreen-code" aria-label={code.split('').join(' ')}>{code}</p>
      <ol className="t-onscreen-steps">
        <li>Go to <strong>{site}/join</strong></li>
        <li>Type this code</li>
        <li>Tap your name</li>
        <li>Tap your three pictures</li>
      </ol>
    </div>
  )
}
