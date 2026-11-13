import { registerLearner, registerTeacher, updateAccountProfile } from './api.js'

const LEARNER_KEY = 'mothusi.learnerProfile'
const TEACHER_KEY = 'mothusi.teacherProfile'

const read = (key) => {
  try { return JSON.parse(localStorage.getItem(key)) } catch { return null }
}

const write = (key, value) => {
  localStorage.setItem(key, JSON.stringify(value))
}

const safeProfile = (profile) => {
  const { password, confirmPassword, ...safe } = profile
  return safe
}

export function cacheAccountProfile(user) {
  if (!user?.profile) return
  const key = user.role === 'learner' ? LEARNER_KEY : TEACHER_KEY
  write(key, { ...user.profile, email: user.email })
}

export async function registerLearnerProfile(profile) {
  const { email, password, ...details } = profile
  const session = await registerLearner({ email, password, profile: safeProfile(details) })
  cacheAccountProfile(session.user)
  return session
}

export async function registerTeacherProfile(profile) {
  const { email, password, ...details } = profile
  const session = await registerTeacher({ email, password, profile: safeProfile(details) })
  cacheAccountProfile(session.user)
  return session
}

export async function saveLearnerProfile(profile) {
  const user = await updateAccountProfile(safeProfile(profile))
  cacheAccountProfile(user)
  return { ok: true, profile: user.profile }
}

export async function saveTeacherProfile(profile) {
  const user = await updateAccountProfile(safeProfile(profile))
  cacheAccountProfile(user)
  return { ok: true, profile: user.profile }
}

export const getLearnerProfile = () => read(LEARNER_KEY)
export const getTeacherProfile = () => read(TEACHER_KEY)

export function clearAccountProfile(role) {
  try {
    localStorage.removeItem(role === 'learner' ? LEARNER_KEY : TEACHER_KEY)
    return true
  } catch {
    return false
  }
}
