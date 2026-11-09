import { createContext, useContext, useEffect, useState } from 'react'
import { getTeacherProfile, saveTeacherProfile } from '../services/profile.js'

const TeacherContext = createContext(null)
export const useTeacher = () => useContext(TeacherContext)

const STORE_KEY = 'mothusi.teacherWorkspace'
const PREFS_KEY = 'mothusi.teacherPrefs'

const read = (key) => { try { return JSON.parse(localStorage.getItem(key)) } catch { return null } }
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* storage unavailable */ } }
const uid = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const nowISO = () => new Date().toISOString()

// ---------- Synthetic starter data (replace with API data later) ----------
const seedClasses = [
  { id: 'c1', name: 'Grade 4A', grade: 'Grade 4', subjects: ['Mathematics', 'Natural Sciences'], size: 40, classTeacher: true, archived: false },
  { id: 'c2', name: 'Grade 5B', grade: 'Grade 5', subjects: ['Mathematics'], size: 28, classTeacher: false, archived: false },
  { id: 'c3', name: 'Grade 6A', grade: 'Grade 6', subjects: ['Technology'], size: 18, classTeacher: false, archived: false },
]

const seedLearners = [
  { id: 'lr1', code: 'L-001', classId: 'c1', name: 'Learner A', strengths: 'Visual thinking', support: 'Diagrams and concrete examples' },
  { id: 'lr2', code: 'L-002', classId: 'c1', name: 'Learner B', strengths: 'Routine-oriented', support: 'Short, sequenced instructions' },
  { id: 'lr3', code: 'L-003', classId: 'c1', name: 'Learner C', strengths: 'Enjoys discussion', support: 'Practical examples; selected language' },
]

const ad = (id, learner, text) => ({ id, learner, text, original: text, edited: false, removed: false })

const seedLesson = (o) => ({
  version: 1,
  needsRecheck: false,
  feedback: null,
  note: '',
  flow: [
    { label: 'Introduction', min: 5 },
    { label: 'Modelling', min: 10 },
    { label: 'Guided practice', min: 15 },
    { label: 'Exit check', min: 10 },
  ],
  feasibility: ['No printer respected', '45-minute lesson', '5-minute individual support limit'],
  checks: ['Learning objective retained', 'Constraints checked', 'Recommendations linked to profiles'],
  history: [{ at: '2026-11-06T09:00:00.000Z', by: 'Mothusi', note: 'Draft generated' }],
  ...o,
})

const seedLessons = [
  seedLesson({
    id: 'l1', title: 'Grade 4 Mathematics – Fractions', classId: 'c1', grade: 'Grade 4', subject: 'Mathematics',
    topic: 'Fractions', date: '2026-11-09', status: 'awaiting_review', objectives: 'Represent halves, thirds and quarters.',
    adaptations: [
      ad('a1', 'Learner A', 'Draw fraction bars instead of printed worksheets'),
      ad('a2', 'Learner B', 'Break instructions into short steps'),
      ad('a3', 'Learner C', 'Use practical examples and selected-language explanations'),
    ],
  }),
  seedLesson({
    id: 'l2', title: 'Grade 5 Mathematics – Decimals', classId: 'c2', grade: 'Grade 5', subject: 'Mathematics',
    topic: 'Decimals', date: '2026-11-08', status: 'approved', objectives: 'Read, write and compare decimals to two places.',
    adaptations: [ad('a1', 'Whole class', 'Compare decimals on a number line drawn on the board')],
    history: [
      { at: '2026-11-05T09:00:00.000Z', by: 'Mothusi', note: 'Draft generated' },
      { at: '2026-11-06T10:30:00.000Z', by: 'Teacher', note: 'Approved version 1' },
    ],
  }),
  seedLesson({
    id: 'l3', title: 'Grade 4 Natural Sciences – Habitats', classId: 'c1', grade: 'Grade 4', subject: 'Natural Sciences',
    topic: 'Habitats', date: '2026-11-07', status: 'feedback_due', objectives: 'Describe how animals are suited to their habitats.',
    adaptations: [
      ad('a1', 'Learner A', 'Use labelled habitat diagrams on the board'),
      ad('a2', 'Learner C', 'Link each habitat to animals the class knows'),
    ],
    history: [
      { at: '2026-11-04T09:00:00.000Z', by: 'Mothusi', note: 'Draft generated' },
      { at: '2026-11-05T11:00:00.000Z', by: 'Teacher', note: 'Approved version 1' },
    ],
  }),
]

export function TeacherProvider({ children }) {
  const [stored] = useState(() => read(STORE_KEY))
  const [classes, setClasses] = useState(stored?.classes || seedClasses)
  const [learners, setLearners] = useState(stored?.learners || seedLearners)
  const [lessons, setLessons] = useState(stored?.lessons || seedLessons)
  const [resources, setResources] = useState([]) // files live in memory only until the backend exists

  const [profile, setProfile] = useState(() => ({
    fullName: 'Thandi Mokoena',
    email: 'teacher@school.example',
    school: 'Example Primary School',
    role: 'Teacher',
    grades: ['Grade 4', 'Grade 5'],
    subjects: ['Mathematics', 'Natural Sciences'],
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
    const code = `L-${String(learners.length + 1).padStart(3, '0')}`
    setLearners((ls) => [...ls, { id: uid('lr'), code, classId, strengths: '', support: '', ...data }])
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
  const addLesson = (lesson) => {
    const id = uid('l')
    setLessons((ls) => [{ id, ...lesson }, ...ls])
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
    lessons, addLesson, updateLesson,
    resources, addResource, deleteResource,
  }
  return <TeacherContext.Provider value={value}>{children}</TeacherContext.Provider>
}
