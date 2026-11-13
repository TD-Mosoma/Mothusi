import { LANGUAGES } from '../teacher/curriculum.js'

export default function LanguagePicker({ value, onChange }) {
  return (
    <div role="radiogroup" aria-label="Choose your language" className="lang-picker">
      {LANGUAGES.map((l) => (
        <button
          key={l.code}
          role="radio"
          aria-checked={value === l.code}
          className={`lang-btn ${value === l.code ? 'active' : ''}`}
          onClick={() => onChange(l.code)}
        >
          {l.label}
        </button>
      ))}
    </div>
  )
}
