import { useEffect, useState } from 'react'

// Light, dark or follow the device. Applied to <html data-theme> so both portals share it.
// index.html applies the saved choice before the first paint to avoid a flash.
const KEY = 'mothusi.theme'
const media = () => window.matchMedia('(prefers-color-scheme: dark)')

export const getThemePref = () => {
  try { return ['light', 'dark', 'system'].includes(localStorage.getItem(KEY)) ? localStorage.getItem(KEY) : 'system' } catch { return 'system' }
}

export function applyTheme(pref = getThemePref()) {
  const dark = pref === 'dark' || (pref === 'system' && media().matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0F1A1C' : '#1B6E71')
}

export function useThemePref() {
  const [pref, setPrefState] = useState(getThemePref)
  useEffect(() => {
    applyTheme(pref)
    if (pref !== 'system') return undefined
    const mq = media()
    const onChange = () => applyTheme('system')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [pref])
  const setPref = (next) => {
    try { localStorage.setItem(KEY, next) } catch { /* the choice lasts for this visit */ }
    setPrefState(next)
  }
  return [pref, setPref]
}

export const THEME_OPTIONS = [
  { value: 'system', label: 'Match my device' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]
