import { useEffect, useState } from 'react'
import { getLearnerLesson, getLearnerLink, getLearnerProgress, listLearnerLessons } from '../services/api.js'
import { translateMaterial } from './translations.js'

// A lesson the learner's own teacher approved for their class: a specific one when runId is given,
// otherwise the most recent. Personalised when the learner joined with a personal code.
// refreshKey (for example the joined class id) reloads the lesson when it changes.
export function useLearnerLesson(lang, runId, refreshKey) {
  const [state, setState] = useState({ loading: true, lesson: null, error: '' })

  useEffect(() => {
    let alive = true
    setState((s) => ({ ...s, loading: true, error: '' }))
    getLearnerLesson({ language: lang, runId })
      .then((lesson) => {
        if (!alive) return
        let nextLesson = lesson
        // Built-in translations exist only for the offline demo model's own text. Live lessons show
        // translations that passed the Language Agent's back-translation check, or English.
        if (lesson?.offline_demo && lesson.note === 'language_unavailable' && lang !== 'en') {
          const material = translateMaterial(lesson.material, lang)
          if (JSON.stringify(material) !== JSON.stringify(lesson.material)) {
            nextLesson = { ...lesson, material, note: 'local_translation' }
          }
        }
        setState({ loading: false, lesson: nextLesson, error: '' })
      })
      .catch((e) => alive && setState({ loading: false, lesson: null, error: e.message }))
    return () => { alive = false }
  }, [lang, runId, refreshKey])

  return state
}

// Every lesson the teacher has shared with learners, newest first.
export function useLearnerLessons(refreshKey) {
  const [state, setState] = useState({ loading: true, lessons: [], error: '' })

  useEffect(() => {
    let alive = true
    setState((s) => ({ ...s, loading: true }))
    listLearnerLessons()
      .then((lessons) => alive && setState({ loading: false, lessons, error: '' }))
      .catch((e) => alive && setState({ loading: false, lessons: [], error: e.message }))
    return () => { alive = false }
  }, [refreshKey])

  return state
}

// The class the learner joined with their teacher's code, or null if they have not joined one yet.
export function useLearnerLink() {
  const [state, setState] = useState({ loading: true, link: null, error: '' })
  const reload = () => getLearnerLink()
    .then((link) => setState({ loading: false, link, error: '' }))
    .catch((e) => setState({ loading: false, link: null, error: e.message }))
  useEffect(() => { reload() }, [])
  return { ...state, reload, setLink: (link) => setState({ loading: false, link, error: '' }) }
}

// The learner's own practice record, kept on the server so it follows them to any device.
export function useLearnerProgress(refreshKey) {
  const [state, setState] = useState({ progress: null, error: '' })
  useEffect(() => {
    let alive = true
    getLearnerProgress()
      .then((progress) => alive && setState({ progress, error: '' }))
      .catch((e) => alive && setState({ progress: null, error: e.message }))
    return () => { alive = false }
  }, [refreshKey])
  return state
}
