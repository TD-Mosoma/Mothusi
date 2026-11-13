import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { getTeacherProfile, saveTeacherProfile } from '../services/profile.js'
import { useAuth } from '../services/AuthContext.jsx'
import {
  deleteResource as apiDeleteResource, deleteWorkspaceDoc, getAuthToken, getRun, lessonFieldsFromRun, listResources,
  loadWorkspace, saveWorkspaceDoc, uploadResource,
} from '../services/api.js'
import { GRADES, SUBJECTS } from './curriculum.js'

const TeacherContext = createContext(null)
export const useTeacher = () => useContext(TeacherContext)

const LEGACY_KEY = 'mothusi.teacherWorkspace.v2' // workspaces kept in the browser before they moved to the server
const PREFS_KEY = 'mothusi.teacherPrefs'
const KINDS = ['classes', 'learners', 'lessons']

const read = (key) => { try { return JSON.parse(localStorage.getItem(key)) } catch { return null } }
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* storage unavailable */ } }
const forget = (key) => { try { localStorage.removeItem(key) } catch { /* storage unavailable */ } }
export const uid = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const nowISO = () => new Date().toISOString()
const lessonTime = (l) => l.createdAt || l.history?.[0]?.at || l.date || ''

// ---------- The sample class: made-up learners so a new teacher can try Mothusi before adding a real class. ----------
const SAMPLE_LEARNERS = [
  { name: 'Learner A', strengths: 'Visual thinking', support: 'Visual explanations and diagrams', language: 'en' },
  { name: 'Learner B', strengths: 'Likes routine', support: 'Short, structured instructions', language: 'en' },
  { name: 'Learner C', strengths: 'Enjoys discussion', support: 'Practical examples with real objects', language: 'tn' },
]
// Starter data that older versions of Mothusi placed in every new workspace.
const LEGACY_SAMPLE_CLASSES = { c1: 'Grade 4A', c2: 'Grade 3B', c3: 'Grade 1C' }
const LEGACY_SAMPLE_LEARNERS = { lr1: 'Learner A', lr2: 'Learner B', lr3: 'Learner C', lr4: 'Learner D', lr5: 'Learner E' }

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

const fromLegacy = (legacy) => ({
  classes: (legacy.classes || []).map((c) => (LEGACY_SAMPLE_CLASSES[c.id] === c.name ? { ...c, sample: true } : c)),
  learners: (legacy.learners || []).map((l) => (LEGACY_SAMPLE_LEARNERS[l.id] === l.name ? { ...l, sample: true } : l)),
  lessons: legacy.lessons || [],
})

// The finished plan run, folded into the lesson that was waiting for it.
export function lessonFromRun(lesson, run) {
  return {
    ...lessonFieldsFromRun(run),
    runs: lesson.runs?.length ? lesson.runs : [{ runId: run.id, kind: 'plan', at: run.created_at, version: 1 }],
    history: [...(lesson.history || []), { at: nowISO(), by: 'Mothusi', note: 'Draft prepared by the agent team', runId: run.id }],
    error: '',
  }
}

export function TeacherProvider({ children }) {
  const { user } = useAuth()
  const legacyKey = `${LEGACY_KEY}.${user.id}`
  const prefsKey = `${PREFS_KEY}.${user.id}`

  const [workspace, setWorkspace] = useState('loading') // loading | ready | error
  const [loadError, setLoadError] = useState('')
  const [classes, setClasses] = useState([])
  const [learners, setLearners] = useState([])
  const [lessons, setLessons] = useState([])
  const [saveState, setSaveState] = useState('saved') // saved | saving | error
  const [resources, setResources] = useState([])
  const [resourcesError, setResourcesError] = useState('')
  const [toast, setToast] = useState(null)

  const [profile, setProfile] = useState(() => withinScope({
    fullName: user.profile?.fullName || 'Teacher',
    email: user.email,
    school: '',
    role: 'Teacher',
    grades: DEFAULT_GRADES,
    subjects: DEFAULT_SUBJECTS,
    language: 'English',
    defaultConditions: '',
    photoUrl: '',
    ...(getTeacherProfile() || {}),
  }))
  const [profileSaveError, setProfileSaveError] = useState('')
  const [prefs, setPrefs] = useState(() => ({ menuDefault: 'open', largeText: false, agentDetail: false, ...(read(prefsKey) || {}) }))
  useEffect(() => { write(prefsKey, prefs) }, [prefsKey, prefs])

  // ---------- Loading the workspace from the server ----------
  const sent = useRef({ classes: new Map(), learners: new Map(), lessons: new Map() }) // what the server has
  const migrating = useRef(false)
  const load = useCallback(async () => {
    setWorkspace('loading')
    setLoadError('')
    try {
      const ws = await loadWorkspace()
      let data = { classes: ws.classes, learners: ws.profiles, lessons: ws.lessons }
      for (const kind of KINDS) sent.current[kind] = new Map(data[kind].map((d) => [d.id, JSON.stringify(d)]))
      const legacy = read(legacyKey)
      const serverEmpty = KINDS.every((k) => data[k].length === 0)
      if (serverEmpty && legacy && KINDS.some((k) => legacy[k]?.length)) {
        data = fromLegacy(legacy) // saved to the server by the sync below, then removed from this browser
        migrating.current = true
      }
      setClasses(data.classes)
      setLearners(data.learners)
      setLessons([...data.lessons].sort((a, b) => lessonTime(b).localeCompare(lessonTime(a))))
      setWorkspace('ready')
    } catch (e) {
      setLoadError(e.message)
      setWorkspace('error')
    }
  }, [legacyKey])
  useEffect(() => { load() }, [load])

  // ---------- Saving changes: compare with what the server has, send only what changed ----------
  const pending = useRef(new Map())
  const timer = useRef(null)
  const flushing = useRef(false)

  const flush = useCallback(async () => {
    if (flushing.current) return
    flushing.current = true
    clearTimeout(timer.current)
    let failed = false
    while (pending.current.size) {
      const batch = [...pending.current.values()]
      pending.current.clear()
      setSaveState('saving')
      for (const item of batch) {
        try {
          if (item.doc) await saveWorkspaceDoc(item.kind, item.doc)
          else await deleteWorkspaceDoc(item.kind, item.id)
          if (item.doc) sent.current[item.kind].set(item.id, item.json)
          else sent.current[item.kind].delete(item.id)
        } catch {
          failed = true
          const key = `${item.kind}:${item.id}`
          if (!pending.current.has(key)) pending.current.set(key, item) // a newer change wins
        }
      }
      if (failed) break
    }
    flushing.current = false
    if (failed) {
      setSaveState('error')
      timer.current = setTimeout(flush, 5000)
    } else {
      setSaveState('saved')
      if (migrating.current) { migrating.current = false; forget(legacyKey) }
    }
  }, [legacyKey])

  const queue = useCallback((kind, list) => {
    const known = sent.current[kind]
    const ids = new Set()
    for (const doc of list) {
      ids.add(doc.id)
      const json = JSON.stringify(doc)
      if (known.get(doc.id) !== json) pending.current.set(`${kind}:${doc.id}`, { kind, id: doc.id, doc, json })
      else pending.current.delete(`${kind}:${doc.id}`)
    }
    for (const id of known.keys()) {
      if (!ids.has(id)) pending.current.set(`${kind}:${id}`, { kind, id, doc: null })
    }
    if (pending.current.size) {
      setSaveState('saving')
      clearTimeout(timer.current)
      timer.current = setTimeout(flush, 450)
    }
  }, [flush])

  useEffect(() => { if (workspace === 'ready') queue('classes', classes) }, [workspace, classes, queue])
  useEffect(() => { if (workspace === 'ready') queue('learners', learners) }, [workspace, learners, queue])
  useEffect(() => { if (workspace === 'ready') queue('lessons', lessons) }, [workspace, lessons, queue])

  // Leaving the page: send anything still waiting.
  useEffect(() => {
    const kinds = { classes: 'classes', learners: 'profiles', lessons: 'lessons' }
    const onHide = () => {
      const token = getAuthToken()
      for (const item of pending.current.values()) {
        fetch(`${import.meta.env.VITE_API_URL || ''}/api/teacher/workspace/${kinds[item.kind]}/${encodeURIComponent(item.id)}`, {
          method: item.doc ? 'PUT' : 'DELETE',
          keepalive: true,
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: item.doc ? item.json : undefined,
        }).catch(() => {})
      }
    }
    window.addEventListener('pagehide', onHide)
    return () => { window.removeEventListener('pagehide', onHide); clearTimeout(timer.current) }
  }, [])

  // ---------- Toasts (with an optional undo) ----------
  const notify = useCallback((message, action = null) => {
    setToast({ id: Date.now(), message, action })
  }, [])
  useEffect(() => {
    if (!toast) return undefined
    const t = setTimeout(() => setToast(null), toast.action ? 9000 : 4500)
    return () => clearTimeout(t)
  }, [toast])

  // ---------- Profile and preferences ----------
  const updateProfile = async (patch) => {
    const previous = profile
    const next = { ...profile, ...patch }
    setProfile(next)
    const { photoUrl, ...persistable } = next // photos stay on this device
    try {
      await saveTeacherProfile(persistable)
      setProfileSaveError('')
    } catch (error) {
      setProfile(previous)
      setProfileSaveError(error.message)
    }
  }
  const updatePrefs = (patch) => setPrefs((p) => ({ ...p, ...patch }))

  // ---------- Classes ----------
  const addClass = (data) => {
    const id = uid('c')
    setClasses((cs) => [...cs, { id, archived: false, createdAt: nowISO(), ...data }])
    return id
  }
  const updateClass = (id, patch) => setClasses((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)))

  const addSampleClass = () => {
    const id = uid('c')
    setClasses((cs) => [...cs, {
      id, name: 'Grade 4A (Sample)', grade: 'Grade 4', subjects: ['Mathematics', 'Home Language', 'Natural Sciences and Technology'],
      size: 40, classTeacher: true, archived: false, sample: true, createdAt: nowISO(),
    }])
    setLearners((ls) => {
      let all = ls
      for (const l of SAMPLE_LEARNERS) all = [...all, { id: uid('lr'), code: nextCode(all), classId: id, sample: true, ...l }]
      return all
    })
    return id
  }
  const removeClass = (id) => {
    setClasses((cs) => cs.filter((c) => c.id !== id))
    setLearners((ls) => ls.filter((l) => l.classId !== id))
    setLessons((ls) => ls.filter((l) => l.classId !== id))
  }

  // ---------- Learners ----------
  const addLearner = (classId, data) => {
    const id = uid('lr')
    setLearners((ls) => [...ls, { id, code: nextCode(ls), classId, strengths: '', support: '', language: 'en', ...data }])
    return id
  }
  const updateLearner = (id, patch) => setLearners((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  const removeLearner = (id) => {
    const removed = learners.find((x) => x.id === id)
    if (!removed) return
    setLearners((ls) => ls.filter((x) => x.id !== id))
    notify(`Removed ${removed.name}'s profile.`, {
      label: 'Undo',
      run: () => setLearners((ls) => (ls.some((x) => x.id === id) ? ls : [...ls, removed])),
    })
  }

  // ---------- Lessons ----------
  const newLessonId = () => uid('l')
  const addLesson = (lesson) => {
    const id = lesson.id || newLessonId()
    setLessons((ls) => [{ createdAt: nowISO(), ...lesson, id }, ...ls.filter((l) => l.id !== id)])
    return id
  }
  // patch can be an object or a function (lesson) => object
  const updateLesson = useCallback((id, patch) =>
    setLessons((ls) => ls.map((l) => (l.id === id ? { ...l, ...(typeof patch === 'function' ? patch(l) : patch) } : l))), [])
  const removeLesson = (id) => setLessons((ls) => ls.filter((l) => l.id !== id))

  // Lessons that are still being prepared finish here, even if the teacher left the planner.
  const preparingKey = lessons.filter((l) => l.status === 'preparing' && l.runId).map((l) => `${l.id}:${l.runId}`).join(',')
  useEffect(() => {
    if (workspace !== 'ready' || !preparingKey) return undefined
    const waiting = preparingKey.split(',').map((pair) => pair.split(':'))
    let alive = true
    const check = async () => {
      for (const [lessonId, runId] of waiting) {
        try {
          const run = await getRun(runId)
          if (!alive || run.status === 'running') continue
          updateLesson(lessonId, (cur) => {
            if (cur.status !== 'preparing' || cur.runId !== runId) return {}
            if (run.status === 'failed' || !run.result?.pack) {
              return { status: 'failed', error: run.error || 'Mothusi stopped before the lesson was ready.' }
            }
            return lessonFromRun(cur, run)
          })
        } catch (e) {
          if (alive && e.status === 404) {
            updateLesson(lessonId, (cur) => (cur.status === 'preparing' ? { status: 'failed', error: 'This preparation was lost.' } : {}))
          }
        }
      }
    }
    check()
    const t = setInterval(check, 4000)
    return () => { alive = false; clearInterval(t) }
  }, [workspace, preparingKey, updateLesson])

  // ---------- Resources (files and their readable text live on the server) ----------
  const reloadResources = useCallback(() => listResources()
    .then((rs) => { setResources(rs); setResourcesError('') }, (e) => setResourcesError(e.message)), [])
  useEffect(() => { reloadResources() }, [reloadResources])

  const addResource = async ({ file, ...meta }) => {
    const content = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result).split(',')[1] || '')
      reader.onerror = () => reject(new Error('This file could not be read on your device.'))
      reader.readAsDataURL(file)
    })
    const saved = await uploadResource({ ...meta, filename: file.name, content_base64: content })
    setResources((rs) => [saved, ...rs.filter((r) => r.id !== saved.id)])
    return saved
  }
  const deleteResource = async (id) => {
    await apiDeleteResource(id)
    setResources((rs) => rs.filter((r) => r.id !== id))
  }

  const value = {
    workspace, loadError, reload: load, saveState,
    profile, updateProfile, profileSaveError, prefs, updatePrefs,
    classes, addClass, updateClass, addSampleClass, removeClass,
    learners, addLearner, updateLearner, removeLearner,
    lessons, addLesson, updateLesson, removeLesson, newLessonId,
    resources, resourcesError, addResource, deleteResource, reloadResources,
    toast, notify, dismissToast: () => setToast(null),
  }
  return <TeacherContext.Provider value={value}>{children}</TeacherContext.Provider>
}

// Classes the teacher can plan for, sample classes last.
export const useActiveClasses = () => {
  const { classes } = useTeacher()
  return useMemo(() => classes.filter((c) => !c.archived).sort((a, b) => Number(!!a.sample) - Number(!!b.sample)), [classes])
}
