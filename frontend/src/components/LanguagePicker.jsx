import { useEffect, useRef, useState } from 'react'
import { LANGUAGES } from '../teacher/curriculum.js'
import { translate } from '../learner/translations.js'

export default function LanguagePicker({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const pickerRef = useRef(null)
  const selected = LANGUAGES.find((language) => language.code === value) || LANGUAGES[0]

  useEffect(() => {
    const closeOnOutsideClick = (event) => {
      if (!pickerRef.current?.contains(event.target)) setOpen(false)
    }
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [])

  return (
    <div className="lang-picker" ref={pickerRef}>
      <button
        type="button"
        className="lang-btn lang-current"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${translate(value, 'Choose your language')}: ${selected.label}`}
        onClick={() => setOpen((isOpen) => !isOpen)}
      >
        {selected.label}<span aria-hidden="true">{open ? '⌃' : '⌄'}</span>
      </button>
      {open && (
        <div role="menu" aria-label={translate(value, 'Choose your language')} className="lang-options">
          {LANGUAGES.map((language) => (
            <button
              key={language.code}
              type="button"
              role="menuitemradio"
              aria-checked={value === language.code}
              className={`lang-option ${value === language.code ? 'active' : ''}`}
              onClick={() => {
                onChange(language.code)
                setOpen(false)
              }}
            >
              {language.label}
              {value === language.code && <span aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
