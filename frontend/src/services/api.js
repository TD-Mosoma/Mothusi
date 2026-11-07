// One place for backend calls. Swap the mock imports for fetch() when the API contract is agreed.
import { classroom, learners, workflowSteps, recommendations } from './mockData.js'

const delay = (ms) => new Promise((r) => setTimeout(r, ms))

export async function getClassroom() { return { classroom, learners } }

export async function generateSupportPack(/* { lesson, constraints } */) {
  await delay(600)
  return { steps: workflowSteps, recommendations }
}

export async function submitFeedback(/* { recommendationId, worked } */) {
  await delay(200)
  return { ok: true }
}
