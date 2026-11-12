const COMPLETED_KEY = 'mothusi.learnerCompleted'
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
export const getSavedLearning = () => read(SAVED_KEY, [])
export const getLearningPreferences = () => read(PREFERENCES_KEY, {
  styles: ['pictures', 'shortSteps'],
  textSize: 'normal',
  alsoLanguage: 'none',
})

export function completeLearnerActivity() {
  return write(COMPLETED_KEY, getCompletedActivities() + 1)
}

export function saveLearningItems(items) {
  return write(SAVED_KEY, items)
}

export function saveLearningPreferences(preferences) {
  return write(PREFERENCES_KEY, preferences)
}

export function saveLearnerReflection(reflection) {
  return write(REFLECTION_KEY, reflection)
}
