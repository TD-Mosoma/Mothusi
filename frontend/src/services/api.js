// All calls to the Mothusi backend. In development Vite proxies /api to the FastAPI server.
const BASE = import.meta.env.VITE_API_URL || ''

export class ApiError extends Error {}

const messageFrom = (data) => {
  const d = data?.detail
  if (typeof d === 'string') return d
  if (Array.isArray(d) && d[0]?.msg) return d[0].msg.replace(/^Value error, /, '')
  return null
}

async function request(path, { method = 'GET', body } = {}) {
  let res
  try {
    res = await fetch(BASE + path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError('Mothusi cannot reach its server. Check that the backend is running.')
  }
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(messageFrom(data) || `Request failed (${res.status}).`)
  return data
}

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

export const getLearnerLesson = ({ code, language, runId }) => {
  const q = new URLSearchParams({ language: language || 'en', ...(code ? { code } : {}), ...(runId ? { run_id: runId } : {}) })
  return request(`/api/learner/lesson?${q}`).then((r) => r.lesson)
}
export const listLearnerLessons = () => request('/api/learner/lessons').then((r) => r.lessons)
export const askForExplanation = ({ runId, code, language, style, interests = [] }) =>
  request('/api/learner/explain', {
    method: 'POST', body: { run_id: runId, learner_code: code || null, language: language || 'en', style, interests },
  }).then((r) => r.run_id)

// ---------------------------------------------------------------- live events

// Streams a run's events. EventSource reconnects on its own and resumes from the last event it saw.
export function streamRun(runId, { onEvent, onEnd, onError }) {
  const source = new EventSource(`${BASE}/api/runs/${runId}/events`)
  source.onmessage = (msg) => onEvent?.(JSON.parse(msg.data))
  source.addEventListener('end', () => { source.close(); onEnd?.() })
  source.onerror = () => {
    if (source.readyState === EventSource.CLOSED) onError?.(new ApiError('Lost the live connection to Mothusi.'))
  }
  return () => source.close()
}

// Resolves with the finished run; onEvent receives every event as it happens.
export function runToCompletion(runId, onEvent) {
  return new Promise((resolve, reject) => {
    streamRun(runId, {
      onEvent,
      onEnd: () => getRun(runId).then(resolve, reject),
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
