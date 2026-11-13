import { useEffect, useState } from 'react'
import { getLearnerLesson, listLearnerLessons } from '../services/api.js'

// A lesson the teacher approved: a specific one when runId is given, otherwise the most recent.
// Personalised when the learner's code matches a profile in that lesson.
export function useLearnerLesson(code, lang, runId) {
  const [state, setState] = useState({ loading: true, lesson: null, error: '' })

  useEffect(() => {
    let alive = true
    setState((s) => ({ ...s, loading: true, error: '' }))
    getLearnerLesson({ code, language: lang, runId })
      .then((lesson) => alive && setState({ loading: false, lesson, error: '' }))
      .catch((e) => alive && setState({ loading: false, lesson: null, error: e.message }))
    return () => { alive = false }
  }, [code, lang, runId])

  return state
}

// Every lesson the teacher has shared with learners, newest first.
export function useLearnerLessons() {
  const [state, setState] = useState({ loading: true, lessons: [], error: '' })

  useEffect(() => {
    let alive = true
    listLearnerLessons()
      .then((lessons) => alive && setState({ loading: false, lessons, error: '' }))
      .catch((e) => alive && setState({ loading: false, lessons: [], error: e.message }))
    return () => { alive = false }
  }, [])

  return state
}
