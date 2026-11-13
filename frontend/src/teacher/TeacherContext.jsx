import { createContext, useContext, useEffect, useState } from 'react'
import { getTeacherProfile, saveTeacherProfile } from '../services/profile.js'
import { GRADES, SUBJECTS } from './curriculum.js'

const TeacherContext = createContext(null)
export const useTeacher = () => useContext(TeacherContext)

const STORE_KEY = 'mothusi.teacherWorkspace.v2'
const PREFS_KEY = 'mothusi.teacherPrefs'

const read = (key) => { try { return JSON.parse(localStorage.getItem(key)) } catch { return null } }
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* storage unavailable */ } }
const uid = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const nowISO = () => new Date().toISOString()

// ---------- Synthetic starter data. No real learner information is used. ----------
const seedClasses = [
  { id: 'c1', name: 'Grade 4A', grade: 'Grade 4', subjects: ['Mathematics', 'Home Language', 'Natural Sciences and Technology'], size: 40, classTeacher: true, archived: false },
  { id: 'c2', name: 'Grade 3B', grade: 'Grade 3', subjects: ['Mathematics', 'First Additional Language', 'Life Skills'], size: 34, classTeacher: false, archived: false },
  { id: 'c3', name: 'Grade 1C', grade: 'Grade 1', subjects: ['Mathematics', 'Life Skills'], size: 28, classTeacher: false, archived: false },
]

const seedLearners = [
  { id: 'lr1', code: 'L-001', classId: 'c1', name: 'Learner A', strengths: 'Visual thinking', support: 'Visual explanations and diagrams', language: 'en' },
  { id: 'lr2', code: 'L-002', classId: 'c1', name: 'Learner B', strengths: 'Likes routine', support: 'Short, structured instructions', language: 'en' },
  { id: 'lr3', code: 'L-003', classId: 'c1', name: 'Learner C', strengths: 'Enjoys discussion', support: 'Practical examples with real objects', language: 'tn' },
  { id: 'lr4', code: 'L-004', classId: 'c2', name: 'Learner D', strengths: 'Enjoys movement', support: 'Hands-on activities and short tasks', language: 'zu' },
  { id: 'lr5', code: 'L-005', classId: 'c3', name: 'Learner E', strengths: 'Loves drawing', support: 'Pictures with every new word', language: 'xh' },
]

// Older saved profiles may list grades or subjects outside Grades 1–4.
const DEFAULT_GRADES = ['Grade 1', 'Grade 3', 'Grade 4']
const DEFAULT_SUBJECTS = ['Mathematics', 'Home Language', 'First Additional Language', 'Life Skills', 'Natural Sciences and Technology']
const withinScope = (p) => {
  const grades = (p.grades || []).filter((g) => GRADES.includes(g))
  const subjects = (p.subjects || []).filter((x) => SUBJECTS.includes(x))
  return { ...p, grades: grades.length ? grades : DEFAULT_GRADES, subjects: subjects.length ? subjects : DEFAULT_SUBJECTS }
}

const nextCode = (learners) => {
  const max = learners.reduce((n, l) => Math.max(n, Number(l.code?.slice(2)) || 0), 0)
  return `L-${String(max + 1).padStart(3, '0')}`
}

export function TeacherProvider({ children }) {
  const [stored] = useState(() => read(STORE_KEY))
  const [classes, setClasses] = useState(stored?.classes || seedClasses)
  const [learners, setLearners] = useState(stored?.learners || seedLearners)
  const [lessons, setLessons] = useState(stored?.lessons || [])
  const [resources, setResources] = useState([]) // files live in memory only until the backend exists

  const [profile, setProfile] = useState(() => withinScope({
    fullName: 'Thandi Mokoena',
    email: 'teacher@school.example',
    school: 'Example Primary School',
    role: 'Teacher',
    grades: DEFAULT_GRADES,
    subjects: DEFAULT_SUBJECTS,
    language: 'English',
    defaultConditions: '40 learners • limited printing',
    photoUrl: '',
    ...(getTeacherProfile() || {}),
  }))

  const [prefs, setPrefs] = useState(() => ({ menuDefault: 'open', largeText: false, ...(read(PREFS_KEY) || {}) }))

  useEffect(() => { write(STORE_KEY, { classes, learners, lessons }) }, [classes, learners, lessons])
  useEffect(() => { write(PREFS_KEY, prefs) }, [prefs])

  // ---------- Profile and preferences ----------
  const updateProfile = (patch) => {
    const next = { ...profile, ...patch }
    setProfile(next)
    const { photoUrl, ...persistable } = next // photos stay in memory for now
    saveTeacherProfile(persistable)
  }
  const updatePrefs = (patch) => setPrefs((p) => ({ ...p, ...patch }))

  // ---------- Classes ----------
  const addClass = (data) => {
    const id = uid('c')
    setClasses((cs) => [...cs, { id, archived: false, ...data }])
    return id
  }
  const updateClass = (id, patch) => setClasses((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)))

  // ---------- Learners ----------
  const addLearner = (classId, data) => {
    setLearners((ls) => [...ls, { id: uid('lr'), code: nextCode(ls), classId, strengths: '', support: '', language: 'en', ...data }])
    setClasses((cs) => cs.map((c) => (c.id === classId ? { ...c, size: Number(c.size || 0) + 1 } : c)))
  }
  const updateLearner = (id, patch) => setLearners((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  const removeLearner = (id) => {
    const l = learners.find((x) => x.id === id)
    if (!l) return
    setLearners((ls) => ls.filter((x) => x.id !== id))
    setClasses((cs) => cs.map((c) => (c.id === l.classId ? { ...c, size: Math.max(0, Number(c.size || 0) - 1) } : c)))
  }

  // ---------- Lessons ----------
  const newLessonId = () => uid('l')
  const addLesson = (lesson) => {
    const id = lesson.id || newLessonId()
    setLessons((ls) => [{ ...lesson, id }, ...ls.filter((l) => l.id !== id)])
    return id
  }
  // patch can be an object or a function (lesson) => object
  const updateLesson = (id, patch) =>
    setLessons((ls) => ls.map((l) => (l.id === id ? { ...l, ...(typeof patch === 'function' ? patch(l) : patch) } : l)))

  // ---------- Resources ----------
  const addResource = ({ file, ...meta }) => {
    const url = URL.createObjectURL(file)
    setResources((rs) => [
      { id: uid('r'), ...meta, fileName: file.name, size: file.size, url, uploadedAt: nowISO() },
      ...rs,
    ])
  }
  const deleteResource = (id) => {
    setResources((rs) => {
      const r = rs.find((x) => x.id === id)
      if (r) URL.revokeObjectURL(r.url)
      return rs.filter((x) => x.id !== id)
    })
  }

  const value = {
    profile, updateProfile, prefs, updatePrefs,
    classes, addClass, updateClass,
    learners, addLearner, updateLearner, removeLearner,
    lessons, addLesson, updateLesson, newLessonId,
    resources, addResource, deleteResource,
  }
  return <TeacherContext.Provider value={value}>{children}</TeacherContext.Provider>
}
