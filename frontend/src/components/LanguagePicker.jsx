// Language is always chosen by the teacher or learner, never inferred.
export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'tn', label: 'Setswana' },
  { code: 'zu', label: 'isiZulu' },
  { code: 'xh', label: 'isiXhosa' },
]

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
