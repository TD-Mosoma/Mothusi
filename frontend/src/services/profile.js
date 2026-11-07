// Temporary storage in the browser. Replace each function with a real API call
// (FastAPI / Supabase) once the backend is ready.

const LEARNER_KEY = 'mothusi.learnerProfile'
const TEACHER_KEY = 'mothusi.teacherProfile'

const read = (key) => {
  try { return JSON.parse(localStorage.getItem(key)) } catch { return null }
}
const write = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* storage unavailable */ }
}

export async function saveLearnerProfile(profile) {
  // TODO: POST /learners
  write(LEARNER_KEY, profile)
  return { ok: true }
}

export async function saveTeacherProfile({ password, ...profile }) {
  // TODO: send the password to your auth provider (e.g. Supabase auth).
  // It is deliberately NOT saved in the browser.
  write(TEACHER_KEY, profile)
  return { ok: true }
}

export const getLearnerProfile = () => read(LEARNER_KEY)
export const getTeacherProfile = () => read(TEACHER_KEY)