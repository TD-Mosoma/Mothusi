import { useEffect, useState } from 'react'

// Read-aloud with the device's own voices. Most devices have English voices; few have voices for
// South African languages, so the button says so honestly instead of reading in the wrong language.
const BCP47 = { en: 'en', af: 'af', zu: 'zu', xh: 'xh', st: 'st', tn: 'tn', nso: 'nso', ve: 've', ts: 'ts', ss: 'ss', nr: 'nr' }

const supported = () => typeof window !== 'undefined' && 'speechSynthesis' in window

function pickVoice(voices, lang) {
  const code = BCP47[lang] || lang
  const matches = voices.filter((v) => v.lang?.toLowerCase().split(/[-_]/)[0] === code)
  if (!matches.length) return null
  return matches.find((v) => /ZA$/i.test(v.lang)) || matches.find((v) => v.localService) || matches[0]
}

export function useReadAloud(lang) {
  const [voices, setVoices] = useState(() => (supported() ? window.speechSynthesis.getVoices() : []))
  const [speaking, setSpeaking] = useState(false)

  useEffect(() => {
    if (!supported()) return undefined
    const load = () => setVoices(window.speechSynthesis.getVoices())
    load()
    window.speechSynthesis.addEventListener('voiceschanged', load)
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', load)
      window.speechSynthesis.cancel()
    }
  }, [])

  const voice = pickVoice(voices, lang)
  const speak = (text) => {
    if (!voice || !text) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.voice = voice
    u.lang = voice.lang
    u.rate = 0.9 // a little slower for young readers
    u.onend = () => setSpeaking(false)
    u.onerror = () => setSpeaking(false)
    setSpeaking(true)
    window.speechSynthesis.speak(u)
  }
  const stop = () => { if (supported()) window.speechSynthesis.cancel(); setSpeaking(false) }

  return { available: supported() && !!voice, supported: supported(), speaking, speak, stop }
}
