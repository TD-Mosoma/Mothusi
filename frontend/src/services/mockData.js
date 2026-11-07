// Synthetic data only. The brief says no real learner data during the hackathon.
// Replace each export with a call in services/api.js once the FastAPI endpoints exist.

export const classroom = {
  name: 'Grade 4 Mathematics',
  learners: 40,
  lesson: 'Introducing fractions',
}

export const learners = [
  { id: 'A', name: 'Learner A', supports: ['Visual explanations', 'Diagrams'] },
  { id: 'B', name: 'Learner B', supports: ['Short, structured instructions'] },
  { id: 'C', name: 'Learner C', supports: ['Practical examples', 'Setswana explanation'] },
]

// Learner-facing lesson content, keyed by language.
// Only English is filled in. Other languages fall back until the Language Agent
// output has been reviewed by a speaker of that language.
export const lessonText = {
  en: {
    title: 'Sharing a pizza: what is a fraction?',
    explain: [
      'A fraction is a part of a whole.',
      'Imagine one pizza cut into 4 equal slices. Each slice is 1 out of 4 parts. We write it as 1/4.',
      'If you eat 3 slices, you ate 3/4 of the pizza.',
    ],
    task: 'Find 4 things at home or in class. Share them equally between 2 friends. How many does each friend get?',
  },
}

export const practice = [
  { id: 1, prompt: 'Which picture shows 3/4?', options: [{ parts: 4, shaded: 1 }, { parts: 4, shaded: 3 }, { parts: 2, shaded: 1 }], answer: 1 },
  { id: 2, prompt: 'Which picture shows 1/2?', options: [{ parts: 4, shaded: 3 }, { parts: 3, shaded: 1 }, { parts: 2, shaded: 1 }], answer: 2 },
]

// Teacher side: the agent workflow, including the Reviewer-led self-correction.
export const workflowSteps = [
  { agent: 'Lesson Analyst', note: 'Found reading, group work and diagram-based demands.', status: 'done' },
  { agent: 'Needs Matcher', note: 'Matched lesson demands to the 3 support profiles.', status: 'done' },
  { agent: 'Adaptation Designer', note: 'Suggested a 20-minute one-to-one fraction activity.', status: 'done' },
  { agent: 'Reviewer', note: 'Rejected: needs 20 minutes of teacher time, only 5 available.', status: 'rejected' },
  { agent: 'Adaptation Designer', note: 'Revised to a 5-minute activity learners can do on their own.', status: 'done' },
  { agent: 'Reviewer', note: 'Approved: fits time, device and printer limits.', status: 'done' },
  { agent: 'Pack Builder', note: 'Lesson-support pack is ready for your review.', status: 'done' },
]

export const recommendations = [
  { id: 1, learner: 'Learner A', text: 'Use fraction circles drawn on the board and shaded step by step.' },
  { id: 2, learner: 'Learner B', text: 'Give three-step instruction cards, read aloud once, then one step at a time.' },
  { id: 3, learner: 'Learner C', text: 'Use sharing objects from the classroom. Offer the explanation in Setswana.' },
]
