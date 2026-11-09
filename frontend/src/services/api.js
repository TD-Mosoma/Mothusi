// One place for backend calls. Everything here is simulated for now.
// Replace each function with a fetch() to the FastAPI endpoints once the contract is agreed.
 
const delay = (ms) => new Promise((r) => setTimeout(r, ms))
 
export const MAX_RETRIES = 3
 
// Agent workflow stages shown in the teacher portal.
export const WORKFLOW_STAGES = [
  { key: 'analysis', label: 'Lesson analysis', desc: 'identifying objectives and lesson demands', done: () => 'objectives and lesson demands identified' },
  { key: 'matching', label: 'Learner needs matching', desc: 'matching support profiles to lesson demands', done: (c) => `${c.learners} profiles matched to lesson demands` },
  { key: 'design', label: 'Adaptation design', desc: 'generating practical strategies', done: () => 'practical strategies generated' },
  { key: 'personalise', label: 'Personalised resources', desc: 'alternative explanations and activities', done: () => 'alternative explanations and activities prepared' },
  { key: 'review', label: 'Quality review', desc: 'feasibility and learning-goal checks', done: () => 'feasibility and learning-goal checks passed' },
  { key: 'pack', label: 'Teacher pack', desc: 'preparing editable lesson plan', done: () => 'editable lesson plan ready for your review' },
]
 
// Builds the draft the teacher will review. Replace with the Pack Builder agent's output.
function buildDraft(input, classLearners) {
  const m = Number(input.lessonMinutes) || 45
  const intro = Math.max(2, Math.round(m * 0.12))
  const modelling = Math.round(m * 0.22)
  const guided = Math.round(m * 0.34)
  const exit = Math.max(2, m - intro - modelling - guided)
 
  const ad = (id, learner, text) => ({ id, learner, text, original: text, edited: false, removed: false })
  const adaptations = classLearners.map((l, i) =>
    ad(`a${i + 1}`, l.name, l.support ? `Support ${l.name}: ${l.support}` : `Break instructions into short steps for ${l.name}`)
  )
  if (input.noPrinter) adaptations.push(ad('a-print', 'Whole class', 'Draw examples on the board instead of using printed worksheets'))
  if (input.noisyHall) adaptations.push(ad('a-noise', 'Whole class', 'Use hand signals and written cues instead of long spoken instructions'))
  if (adaptations.length === 0) adaptations.push(ad('a1', 'Whole class', 'Break instructions into short steps'))
 
  return {
    flow: [
      { label: 'Introduction', min: intro },
      { label: 'Modelling', min: modelling },
      { label: 'Guided practice', min: guided },
      { label: 'Exit check', min: exit },
    ],
    adaptations,
    feasibility: [
      input.noPrinter ? 'No printer respected' : 'Printing available',
      `${m}-minute lesson`,
      `${input.supportMinutes}-minute individual support limit`,
    ],
    checks: ['Learning objective retained', 'Constraints checked', 'Recommendations linked to profiles'],
  }
}
 
// onStep(index, { status: 'running' | 'retry' | 'done' | 'failed', detail? })
export async function generateLessonDraft(input, classLearners, onStep) {
  for (let i = 0; i < WORKFLOW_STAGES.length; i++) {
    const stage = WORKFLOW_STAGES[i]
    onStep(i, { status: 'running' })
    await delay(800)
 
    // Demo of the Reviewer rejecting an unrealistic activity and the plan being corrected.
    if (stage.key === 'review' && Number(input.supportMinutes) <= 10) {
      onStep(i, {
        status: 'retry',
        detail: `Check failed: a first activity needed 20 minutes of one-to-one time, but only ${input.supportMinutes} are available. Retrying (1 of ${MAX_RETRIES}) with a shorter activity.`,
      })
      await delay(1500)
    }
    onStep(i, { status: 'done', detail: stage.done({ learners: classLearners.length }) })
  }
  return buildDraft(input, classLearners)
}
 
export async function recheckLesson(/* lesson */) {
  await delay(900)
  return { ok: true }
}
 
export async function submitFeedback(/* { lessonId, feedback } */) {
  await delay(300)
  return { ok: true }
}
