// Saved lessons and learning preferences. These stay on the learner's device; practice and progress are
// recorded on the server (see recordActivity in api.js).
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

export const getSavedLearning = () => read(accountKey('mothusi.learnerSaved'), [])
export const getLearningPreferences = () => ({
  styles: ['pictures', 'shortSteps'],
  textSize: 'normal',
  ...read(accountKey('mothusi.learnerPreferences'), {}),
})

export const saveLearningItems = (items) => write(accountKey('mothusi.learnerSaved'), items)
export const saveLearningPreferences = (preferences) => write(accountKey('mothusi.learnerPreferences'), preferences)
