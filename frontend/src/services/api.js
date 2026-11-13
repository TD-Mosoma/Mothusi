// All calls to the Mothusi backend. In development Vite proxies /api to the FastAPI server.
const BASE = import.meta.env.VITE_API_URL || ''
const TOKEN_KEY = 'mothusi.authToken'

export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message)
    this.status = status
  }
}

const messageFrom = (data) => {
  const d = data?.detail
  if (typeof d === 'string') return d
  if (Array.isArray(d) && d[0]?.msg) return d[0].msg.replace(/^Value error, /, '')
  return null
}

async function request(path, { method = 'GET', body, headers = {} } = {}) {
  let res
  try {
    const token = sessionStorage.getItem(TOKEN_KEY)
    res = await fetch(BASE + path, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError('Mothusi cannot reach its server. Check that the backend is running.')
  }
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(messageFrom(data) || `Request failed (${res.status}).`, res.status)
  return data
}

export const getAuthToken = () => sessionStorage.getItem(TOKEN_KEY)
export const setAuthToken = (token) => sessionStorage.setItem(TOKEN_KEY, token)
export const clearAuthToken = () => sessionStorage.removeItem(TOKEN_KEY)

export const registerLearner = (body) => request('/api/auth/register/learner', { method: 'POST', body })
export const registerTeacher = (body) => request('/api/auth/register/teacher', { method: 'POST', body })
export const login = (body) => request('/api/auth/login', { method: 'POST', body })
export const getCurrentUser = () => request('/api/auth/me').then((r) => r.user)
export const logout = () => request('/api/auth/logout', { method: 'POST' })
export const updateAccountProfile = (profile) =>
  request('/api/auth/profile', { method: 'PATCH', body: profile }).then((r) => r.user)
export const forgotPassword = (email) => request('/api/auth/forgot', { method: 'POST', body: { email } })
export const resetPassword = (token, password) => request('/api/auth/reset', { method: 'POST', body: { token, password } })

// Picture sign-in for young learners: class code, then their name, then three pictures in order.
export const getPictureRoster = (code) => request('/api/auth/picture/roster', { method: 'POST', body: { code } })
export const setupPictures = ({ code, learnerId, pictures }) =>
  request('/api/auth/picture/setup', { method: 'POST', body: { code, learner_id: learnerId, pictures } })
export const pictureLogin = ({ code, learnerId, pictures }) =>
  request('/api/auth/picture/login', { method: 'POST', body: { code, learner_id: learnerId, pictures } })

// ---------------------------------------------------------------- runs

export const getHealth = () => request('/api/health')
export const getGraph = () => request('/api/graph')
export const listRuns = (limit = 50) => request(`/api/runs?limit=${limit}`).then((r) => r.runs)
export const getRun = (id, { events = false } = {}) => request(`/api/runs/${id}${events ? '?events=true' : ''}`)

export const startPlan = (payload) => request('/api/runs', { method: 'POST', body: payload }).then((r) => r.run_id)
export const startReplan = (runId, { constraints, teacherNote = '', lessonId }) =>
  request(`/api/runs/${runId}/replan`, {
    method: 'POST', body: { constraints: constraints || null, teacher_note: teacherNote, lesson_id: lessonId },
  }).then((r) => r.run_id)
export const startRecheck = (runId, adaptations) =>
  request(`/api/runs/${runId}/recheck`, { method: 'POST', body: { adaptations: adaptations.map(toBackendAdaptation) } })
    .then((r) => r.run_id)
export const approveRun = (runId) => request(`/api/runs/${runId}/approve`, { method: 'POST' })
export const submitFeedback = (payload) => request('/api/feedback', { method: 'POST', body: payload }).then((r) => r.run_id)
export const getMemory = (learnerIds) =>
  request(`/api/memory?${learnerIds.map((id) => `learner_id=${encodeURIComponent(id)}`).join('&')}`).then((r) => r.feedback)

// ---------------------------------------------------------------- learner portal

// The server decides which lessons a learner may see from the code their teacher gave them.
export const getLearnerLesson = ({ language, runId }) => {
  const q = new URLSearchParams({ language: language || 'en', ...(runId ? { run_id: runId } : {}) })
  return request(`/api/learner/lesson?${q}`).then((r) => r.lesson)
}
export const listLearnerLessons = () => request('/api/learner/lessons').then((r) => r.lessons)
export const getLearnerLink = () => request('/api/learner/link').then((r) => r.link)
export const joinClass = (code) => request('/api/learner/join', { method: 'POST', body: { code } }).then((r) => r.link)
export const checkJoinCode = (code) => request('/api/auth/check-code', { method: 'POST', body: { code } }).then((r) => r.valid)
export const askForExplanation = ({ runId, language, style, interests = [] }) =>
  request('/api/learner/explain', {
    method: 'POST', body: { run_id: runId, language: language || 'en', style, interests },
  }).then((r) => r.run_id)

export const recordActivity = (runId, kind, data = {}) =>
  request('/api/learner/activity', { method: 'POST', body: { run_id: runId, kind, data } }).catch(() => null)
export const getLearnerProgress = () => request('/api/learner/progress')

// ---------------------------------------------------------------- teacher workspace (stored on the server)

const WORKSPACE_KIND = { classes: 'classes', learners: 'profiles', lessons: 'lessons' }
export const loadWorkspace = () => request('/api/teacher/workspace')
export const saveWorkspaceDoc = (kind, doc) =>
  request(`/api/teacher/workspace/${WORKSPACE_KIND[kind]}/${encodeURIComponent(doc.id)}`, { method: 'PUT', body: doc })
export const deleteWorkspaceDoc = (kind, id) =>
  request(`/api/teacher/workspace/${WORKSPACE_KIND[kind]}/${encodeURIComponent(id)}`, { method: 'DELETE' })
export const resetLearnerPictures = (profileId) =>
  request(`/api/teacher/workspace/profiles/${encodeURIComponent(profileId)}/reset-pictures`, { method: 'POST' })
export const getClassInsights = (classId) => request(`/api/teacher/insights?class_id=${encodeURIComponent(classId)}`)

// ---------------------------------------------------------------- teaching materials (teacher)

export const listResources = () => request('/api/teacher/resources').then((r) => r.resources)
export const uploadResource = (body) => request('/api/teacher/resources', { method: 'POST', body })
export const getResourceText = (id) => request(`/api/teacher/resources/${encodeURIComponent(id)}/text`).then((r) => r.text)
export const deleteResource = (id) => request(`/api/teacher/resources/${encodeURIComponent(id)}`, { method: 'DELETE' })
// Files need the session header, so they are fetched as a blob and opened from memory.
export async function openResourceFile(id) {
  const token = getAuthToken()
  const res = await fetch(`${BASE}/api/teacher/resources/${encodeURIComponent(id)}/file`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  }).catch(() => null)
  if (!res?.ok) throw new ApiError('This file could not be opened.', res?.status || 0)
  return URL.createObjectURL(await res.blob())
}

// ---------------------------------------------------------------- classroom codes (teacher)

export const getRoster = () => request('/api/teacher/roster')
export const issueJoinCode = ({ classId, className, learnerProfileId = null, learnerLabel = null }) =>
  request('/api/teacher/join-codes', {
    method: 'POST',
    body: { class_id: classId, class_name: className, learner_profile_id: learnerProfileId, learner_label: learnerLabel },
  })
export const revokeJoinCode = (code) => request(`/api/teacher/join-codes/${encodeURIComponent(code)}`, { method: 'DELETE' })
export const unlinkLearner = (accountId) => request(`/api/teacher/learners/${encodeURIComponent(accountId)}`, { method: 'DELETE' })

// ---------------------------------------------------------------- live events

// Fetch is used instead of EventSource so the authenticated session can be sent in a header.
export function streamRun(runId, { onEvent, onEnd, onError, learner = false }) {
  let closed = false
  let controller
  let lastEventId = 0
  const connect = async () => {
    while (!closed) {
      try {
        controller = new AbortController()
        const token = getAuthToken()
        const res = await fetch(`${BASE}/api/${learner ? 'learner/' : ''}runs/${runId}/events`, {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(lastEventId ? { 'Last-Event-ID': String(lastEventId) } : {}),
          },
          signal: controller.signal,
        })
        if (!res.ok) {
          const data = await res.json().catch(() => null)
          throw new ApiError(messageFrom(data) || `Request failed (${res.status}).`, res.status)
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        while (!closed) {
          const { value, done } = await reader.read()
          buffer += decoder.decode(value || new Uint8Array(), { stream: !done })
          const frames = buffer.split(/\r?\n\r?\n/)
          buffer = frames.pop() || ''
          for (const frame of frames) {
            let eventName = 'message'
            let data = ''
            for (const line of frame.split(/\r?\n/)) {
              if (line.startsWith('id:')) lastEventId = Number(line.slice(3).trim()) || lastEventId
              else if (line.startsWith('event:')) eventName = line.slice(6).trim()
              else if (line.startsWith('data:')) data += `${line.slice(5).trimStart()}\n`
            }
            if (eventName === 'end') {
              closed = true
              await reader.cancel()
              onEnd?.()
              return
            }
            if (data) onEvent?.(JSON.parse(data))
          }
          if (done) break
        }
      } catch (error) {
        if (closed || error.name === 'AbortError') return
        if (error.status) {
          onError?.(error)
          return
        }
      }
      if (!closed) await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }
  connect()
  return () => {
    closed = true
    controller?.abort()
  }
}

// Resolves with the finished run; onEvent receives every event as it happens.
// Learners follow their own explanation runs through the learner endpoints.
export function runToCompletion(runId, onEvent, { learner = false } = {}) {
  const fetchRun = () => (learner ? request(`/api/learner/runs/${runId}`) : getRun(runId))
  return new Promise((resolve, reject) => {
    streamRun(runId, {
      onEvent,
      learner,
      onEnd: () => fetchRun().then(resolve, reject),
      onError: reject,
    })
  })
}

// ---------------------------------------------------------------- mapping

export function buildLessonRequest(form, classLearners, { lessonId, offline }) {
  return {
    grade: form.grade,
    subject: form.subject,
    topic: form.topic.trim(),
    objectives: form.objectives.trim(),
    content: form.notes.trim(),
    learners: classLearners.map((l) => ({
      id: l.id, code: l.code, name: l.name, strengths: l.strengths || '', support: l.support || '', language: l.language || 'en',
    })),
    constraints: constraintsFromForm(form),
    lesson_id: lessonId,
    class_id: form.classId,
    offline: !!offline,
  }
}

export const constraintsFromForm = (f) => ({
  class_size: Number(f.learnerCount),
  lesson_minutes: Number(f.lessonMinutes),
  support_minutes: Number(f.supportMinutes),
  prep_minutes: Number(f.prepMinutes ?? 30),
  has_printer: !f.noPrinter,
  has_devices: !!f.hasDevices,
  noisy_venue: !!f.noisyHall,
  notes: f.conditionNotes || '',
})

export const formFromConstraints = (c) => ({
  learnerCount: c.class_size,
  lessonMinutes: c.lesson_minutes,
  supportMinutes: c.support_minutes,
  prepMinutes: c.prep_minutes ?? 30,
  noPrinter: !c.has_printer,
  hasDevices: c.has_devices,
  noisyHall: c.noisy_venue,
  conditionNotes: c.notes || '',
})

export function toFrontendAdaptation(a, names) {
  return {
    id: a.id,
    learnerId: a.learner_id,
    learner: a.learner_id === 'whole_class' ? 'Whole class' : names[a.learner_id] || a.learner_id,
    strategy: a.strategy,
    text: a.instruction,
    original: a.instruction,
    teacherMinutes: a.teacher_minutes,
    prepMinutes: a.prep_minutes ?? 0,
    materials: a.materials || [],
    phase: a.phase || '',
    addresses: a.addresses || '',
    revision: a.revision || 1,
    edited: false,
    removed: false,
  }
}

export function toBackendAdaptation(a) {
  return {
    id: a.id,
    learner_id: a.learnerId,
    phase: a.phase || '',
    strategy: a.strategy,
    instruction: a.text,
    teacher_minutes: Number(a.teacherMinutes) || 0,
    prep_minutes: Number(a.prepMinutes) || 0,
    materials: a.materials || [],
    addresses: a.addresses || '',
    revision: a.revision || 1,
  }
}

// The parts of a finished plan run that the lesson pages show.
export function lessonFieldsFromRun(run) {
  const { pack, state, changes = [], warnings = [] } = run.result
  const names = Object.fromEntries(pack.learners.map((l) => [l.id, l.name]))
  return {
    runId: run.id,
    model: run.model,
    status: 'awaiting_review',
    needsRecheck: false,
    objectiveSummary: pack.objective,
    successCriteria: pack.success_criteria,
    vocabulary: pack.key_vocabulary,
    demands: pack.demands,
    flow: pack.flow.map((p) => ({ label: p.label, min: p.minutes, activity: p.activity })),
    adaptations: state.adaptations.map((a) => toFrontendAdaptation(a, names)),
    checks: pack.checks,
    warnings,
    changes: changes.map((c) => ({ ...c, learner: c.learner_id === 'whole_class' ? 'Whole class' : names[c.learner_id] || c.learner_id })),
    learnersPack: pack.learners,
    wholeClass: pack.whole_class,
    memoryApplied: pack.memory_applied,
    stats: pack.stats,
    constraints: pack.constraints,
    markdown: pack.markdown,
  }
}
