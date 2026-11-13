import { useEffect, useState } from 'react'
import { getClassInsights } from '../services/api.js'

// What learners did with approved lessons, from the learner portal. Refreshes every minute while open.
export function useClassInsights(classId) {
  const [state, setState] = useState({ loading: true, data: null, error: '' })
  useEffect(() => {
    if (!classId) return undefined
    let alive = true
    const load = () => getClassInsights(classId)
      .then((data) => alive && setState({ loading: false, data, error: '' }))
      .catch((e) => alive && setState((s) => ({ ...s, loading: false, error: e.message })))
    load()
    const t = setInterval(load, 60000)
    return () => { alive = false; clearInterval(t) }
  }, [classId])
  return state
}

const add = (a = {}, b = {}) => {
  const out = { ...a }
  for (const [k, v] of Object.entries(b)) out[k] = (out[k] || 0) + v
  return out
}

// One lesson can have several versions (runs); learners may have opened any of them.
export function lessonInsight(data, lesson) {
  if (!data || !lesson) return null
  const ids = [...new Set([lesson.runId, ...(lesson.runs || []).map((r) => r.runId)].filter(Boolean))]
  const parts = ids.map((id) => data.lessons[id]).filter(Boolean)
  if (!parts.length) return { opened: 0, practised: 0, questions: {}, feelings: {}, helped: {}, explain_styles: {} }
  const questions = {}
  for (const p of parts) {
    for (const [key, q] of Object.entries(p.questions)) {
      questions[key] = { first_try: (questions[key]?.first_try || 0) + q.first_try, missed: (questions[key]?.missed || 0) + q.missed }
    }
  }
  return {
    opened: parts.reduce((n, p) => n + p.opened, 0),
    practised: parts.reduce((n, p) => n + p.practised, 0),
    questions,
    feelings: parts.reduce((acc, p) => add(acc, p.feelings), {}),
    helped: parts.reduce((acc, p) => add(acc, p.helped), {}),
    explain_styles: parts.reduce((acc, p) => add(acc, p.explain_styles), {}),
  }
}

// The question most learners got wrong at their first try, with its wording when known.
export function mostMissed(insight, lesson) {
  const entries = Object.entries(insight?.questions || {}).filter(([, q]) => q.missed > 0)
  if (!entries.length) return null
  const [key, q] = entries.sort((a, b) => b[1].missed - a[1].missed)[0]
  const practice = lesson?.wholeClass?.material?.practice || []
  const prompt = /^\d+$/.test(key) ? practice[Number(key)]?.prompt || `Question ${Number(key) + 1}` : key
  return { prompt, missed: q.missed, tried: q.missed + q.first_try }
}

const STYLE_WORDS = { simpler: 'simpler words', visual: 'pictures', practical: 'something to do with their hands' }

// "4 asked for pictures, 1 for simpler words"
export function explainSummary(styles = {}) {
  const parts = Object.entries(styles).filter(([k, n]) => k && k !== 'null' && n > 0).sort((a, b) => b[1] - a[1])
  if (!parts.length) return ''
  return parts.map(([k, n], i) => `${n}${i === 0 ? ' asked for ' : ' for '}${STYLE_WORDS[k] || k}`).join(', ')
}

export function feelingSummary(feelings = {}) {
  const order = ['Easy', 'Just right', 'Difficult']
  return order.filter((f) => feelings[f]).map((f) => `${feelings[f]} ${f.toLowerCase()}`).join(' • ')
}

export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

// For one learner: "pictures (2), simpler words"
export function asksFor(styles = {}) {
  return Object.entries(styles).filter(([k, n]) => k && k !== 'null' && n > 0).sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${STYLE_WORDS[k] || k}${n > 1 ? ` (${n})` : ''}`).join(', ')
}
