// The agent team, in workflow order. key selects the agent's colour in the timeline and graph.
export const AGENTS = [
  { name: 'Orchestrator', key: 'orch', role: 'Plans the work and routes it between agents' },
  { name: 'Progress Tracker', key: 'track', role: 'Remembers what worked in earlier lessons' },
  { name: 'Lesson Analyst', key: 'analyst', role: 'Finds what the lesson demands of learners' },
  { name: 'Needs Matcher', key: 'match', role: 'Matches demands to learner support profiles' },
  { name: 'Adaptation Designer', key: 'design', role: 'Designs practical classroom adaptations' },
  { name: 'Reviewer', key: 'review', role: 'Checks constraints, quality and translations' },
  { name: 'Personalisation Agent', key: 'person', role: 'Writes learner-facing material' },
  { name: 'Language Agent', key: 'lang', role: 'Translates into the selected language' },
  { name: 'Pack Builder', key: 'pack', role: 'Assembles the teacher-support pack' },
]
export const AGENT_KEY = Object.fromEntries(AGENTS.map((a) => [a.name, a.key]))
