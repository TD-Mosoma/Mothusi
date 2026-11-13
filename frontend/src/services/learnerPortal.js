// Learner-side progress, saved items and preferences. These stay on the learner's device.
const COMPLETED_KEY = 'mothusi.learnerCompleted'
const RECENT_KEY = 'mothusi.learnerRecentPractice'
const SAVED_KEY = 'mothusi.learnerSaved'
const PREFERENCES_KEY = 'mothusi.learnerPreferences'
const REFLECTION_KEY = 'mothusi.learnerReflection'

function read(key, fallback) {
  try {
    const value = localStorage.getItem(key)
    return value === null ? fallback : JSON.parse(value)
  } catch {
    return fallback
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export const getCompletedActivities = () => read(COMPLETED_KEY, 0)
export const getRecentPractice = () => read(RECENT_KEY, null)
export const getSavedLearning = () => read(SAVED_KEY, [])
export const getLearningPreferences = () => ({
  styles: ['pictures', 'shortSteps'],
  textSize: 'normal',
  ...read(PREFERENCES_KEY, {}),
})

export function completeLearnerActivity(lesson) {
  write(RECENT_KEY, { runId: lesson.run_id, title: lesson.topic, at: new Date().toISOString() })
  return write(COMPLETED_KEY, getCompletedActivities() + 1)
}

export const saveLearningItems = (items) => write(SAVED_KEY, items)
export const saveLearningPreferences = (preferences) => write(PREFERENCES_KEY, preferences)
export const saveLearnerReflection = (reflection) => write(REFLECTION_KEY, reflection)
