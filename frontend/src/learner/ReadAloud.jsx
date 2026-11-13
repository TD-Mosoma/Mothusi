import { languageLabel } from '../teacher/curriculum.js'
import { useReadAloud } from './speech.js'
import { translate } from './translations.js'

// "Read it to me" in the language the text is written in (contentLang), labelled in the learner's language (lang).
export default function ReadAloud({ text, lang, contentLang = 'en' }) {
  const { available, supported, speaking, speak, stop } = useReadAloud(contentLang)
  if (!supported) return null
  if (!available) {
    return (
      <p className="l-read-none small-text">
        {translate(lang, 'Reading aloud in {language} is not available on this device yet.', { language: languageLabel(contentLang) })}
      </p>
    )
  }
  return (
    <button type="button" className="btn secondary l-read" aria-pressed={speaking} onClick={() => (speaking ? stop() : speak(text))}>
      <span aria-hidden="true">{speaking ? '■' : '🔊'}</span> {translate(lang, speaking ? 'Stop reading' : 'Read it to me')}
    </button>
  )
}
