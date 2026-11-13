// Learner-side progress, saved items and preferences. These stay on the learner's device.
const ACCOUNT_KEY = 'mothusi.learnerProfile'

function read(key, fallback) {
  try {
    const value = localStorage.getItem(key)
    return value === null ? fallback : JSON.parse(value)
  } catch {
    return fallback
  }
}

const accountKey = (key) => {
  const email = read(ACCOUNT_KEY, null)?.email || 'guest'
  return `${key}.${encodeURIComponent(email.toLowerCase())}`
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export const getCompletedActivities = () => read(accountKey('mothusi.learnerCompleted'), 0)
export const getRecentPractice = () => read(accountKey('mothusi.learnerRecentPractice'), null)
export const getSavedLearning = () => read(accountKey('mothusi.learnerSaved'), [])
export const getLearningPreferences = () => ({
  styles: ['pictures', 'shortSteps'],
  textSize: 'normal',
  ...read(accountKey('mothusi.learnerPreferences'), {}),
})

export function completeLearnerActivity(lesson) {
  write(accountKey('mothusi.learnerRecentPractice'), { runId: lesson.run_id, title: lesson.topic, at: new Date().toISOString() })
  return write(accountKey('mothusi.learnerCompleted'), getCompletedActivities() + 1)
}

export const saveLearningItems = (items) => write(accountKey('mothusi.learnerSaved'), items)
export const saveLearningPreferences = (preferences) => write(accountKey('mothusi.learnerPreferences'), preferences)
export const saveLearnerReflection = (reflection) => write(accountKey('mothusi.learnerReflection'), reflection)
