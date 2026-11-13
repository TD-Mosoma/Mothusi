import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../services/AuthContext.jsx'
import { getPictureRoster, pictureLogin, setupPictures } from '../services/api.js'
import BrandLogo from '../components/BrandLogo.jsx'
import LanguagePicker from '../components/LanguagePicker.jsx'
import { PICTURES, PICTURE_LABELS, Picture } from '../components/Pictures.jsx'
import { translate } from './translations.js'
import './learner.css'
import './picture-sign-in.css'

// Sign-in for young learners who cannot type a password: the class code, then their name, then three pictures.
// The first time, they choose three pictures and tap them again to confirm.
const CODE_LENGTH = 8

export default function PictureSignIn() {
  const [params] = useSearchParams()
  const [lang, setLang] = useState('en')
  const t = (text, values) => translate(lang, text, values)
  const navigate = useNavigate()
  const { startSession } = useAuth()

  const [step, setStep] = useState('code') // code | name | pictures
  const [code, setCode] = useState(params.get('code') || '')
  const [roster, setRoster] = useState(null)
  const [learner, setLearner] = useState(null)
  const [mode, setMode] = useState('login') // login | choose | confirm
  const [chosen, setChosen] = useState([])
  const [picked, setPicked] = useState([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const heading = useRef(null)

  useEffect(() => { heading.current?.focus() }, [step, mode])

  const typed = code.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const findClass = async (event) => {
    event?.preventDefault()
    setBusy(true); setMessage('')
    try {
      const r = await getPictureRoster(code)
      setRoster(r)
      if (r.learners.length === 1) chooseLearner(r.learners[0])
      else setStep('name')
    } catch (e) {
      setMessage(e.status === 400 ? t('That code is not right. Check it with your teacher.') : e.message)
    } finally {
      setBusy(false)
    }
  }

  const chooseLearner = (l) => {
    setLearner(l)
    setMode(l.has_pictures ? 'login' : 'choose')
    setPicked([]); setChosen([]); setMessage('')
    setStep('pictures')
  }

  const finish = (session) => {
    startSession(session)
    navigate('/learner', { replace: true })
  }

  const submit = async (pictures) => {
    setBusy(true)
    try {
      if (mode === 'login') {
        finish(await pictureLogin({ code, learnerId: learner.id, pictures }))
      } else {
        finish(await setupPictures({ code, learnerId: learner.id, pictures }))
      }
    } catch (e) {
      setPicked([])
      if (e.status === 401) setMessage(t('Not quite. Try again.'))
      else if (e.status === 423) setMessage(t('Too many tries. Ask your teacher, or wait 10 minutes.'))
      else if (e.status === 409) {
        setMode(mode === 'login' ? 'choose' : 'login'); setChosen([])
        setMessage(mode === 'login' ? t('Choose your pictures for the first time.') : t('You already have pictures. Tap them to sign in.'))
      } else setMessage(e.message)
    } finally {
      setBusy(false)
    }
  }

  const tap = (name) => {
    if (busy || picked.length >= 3) return
    const next = [...picked, name]
    setPicked(next)
    setMessage('')
    if (next.length < 3) return
    if (mode === 'choose') {
      setTimeout(() => { setChosen(next); setPicked([]); setMode('confirm') }, 350)
    } else if (mode === 'confirm') {
      if (next.join() === chosen.join()) submit(next)
      else setTimeout(() => { setPicked([]); setChosen([]); setMode('choose'); setMessage(t('Those did not match. Choose three pictures again.')) }, 350)
    } else {
      submit(next)
    }
  }

  const prompt = {
    login: t('Tap your three pictures'),
    choose: t('Choose three pictures you will remember'),
    confirm: t('Tap the same three pictures again'),
  }[mode]

  return (
    <main className="theme-learner ps-shell">
      <header className="ps-top">
        <Link to="/" aria-label={t('Mothusi home')}><BrandLogo /></Link>
        <LanguagePicker value={lang} onChange={setLang} />
      </header>

      <section className="ps-card" aria-live="polite">
        {step === 'code' && (
          <form onSubmit={findClass} className="ps-stack">
            <h1 tabIndex={-1} ref={heading}>{t('Type your class code')}</h1>
            <p className="muted">{t('Your teacher shows it on the board.')}</p>
            <input
              className="ps-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABCD-2345" maxLength={12} autoComplete="off" autoCapitalize="characters" spellCheck={false}
              aria-label={t('Class code')} autoFocus
            />
            <button type="submit" className="btn ps-big" disabled={busy || typed.length < CODE_LENGTH}>
              {busy ? t('Looking…') : t('Next')} <span aria-hidden="true">→</span>
            </button>
          </form>
        )}

        {step === 'name' && roster && (
          <div className="ps-stack">
            <p className="l-eyebrow">{roster.class_name}</p>
            <h1 tabIndex={-1} ref={heading}>{t('Tap your name')}</h1>
            {roster.learners.length === 0 && <p>{t('Your teacher has not added your name yet. Please ask your teacher.')}</p>}
            <div className="ps-names">
              {roster.learners.map((l) => (
                <button key={l.id} type="button" className="ps-name" onClick={() => chooseLearner(l)}>
                  <span className="ps-initial" aria-hidden="true">{l.name.trim()[0]?.toUpperCase()}</span>
                  {l.name}
                </button>
              ))}
            </div>
            <button type="button" className="btn ghost" onClick={() => { setStep('code'); setRoster(null) }}>{t('Back')}</button>
          </div>
        )}

        {step === 'pictures' && learner && (
          <div className="ps-stack">
            <p className="l-eyebrow">{t('Hello, {name}!', { name: learner.name })}</p>
            <h1 tabIndex={-1} ref={heading}>{prompt}</h1>
            <div className="ps-slots" aria-label={t('{count} of 3 chosen', { count: picked.length })}>
              {[0, 1, 2].map((i) => (
                <span key={i} className={`ps-slot ${picked[i] ? 'full' : ''}`}>
                  {picked[i] ? (mode === 'login' ? <span className="ps-dot" /> : <Picture name={picked[i]} size={40} />) : i + 1}
                </span>
              ))}
            </div>
            <div className="ps-grid" role="group" aria-label={t('Pictures')}>
              {PICTURES.map((p) => (
                <button key={p} type="button" className="ps-pic" onClick={() => tap(p)} disabled={busy}
                  aria-label={t(PICTURE_LABELS[p])}>
                  <Picture name={p} />
                  <span>{t(PICTURE_LABELS[p])}</span>
                </button>
              ))}
            </div>
            <div className="ps-row">
              {picked.length > 0 && <button type="button" className="btn secondary" onClick={() => setPicked([])}>{t('Start again')}</button>}
              <button type="button" className="btn ghost" onClick={() => (roster?.learners.length > 1 ? setStep('name') : setStep('code'))}>
                {t('That is not me')}
              </button>
            </div>
            {mode !== 'login' && <p className="muted small-text">{t('Keep your pictures secret, like a password.')}</p>}
          </div>
        )}

        {message && <p className="ps-message" role="alert">{message}</p>}
      </section>

      <p className="ps-foot muted">
        {t('Have an email and password?')} <Link to="/login">{t('Log in')}</Link>
        {' • '}<Link to="/learner/onboarding">{t('Create an account')}</Link>
      </p>
    </main>
  )
}
