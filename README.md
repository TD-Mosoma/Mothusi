# Mothusi: your intelligent classroom colleague

*Mothusi* means "helper" in Setswana. It is a team of AI agents that works alongside **Grade 1–4 teachers** in South
Africa (CAPS). It turns learner support needs into practical classroom action. It analyses a lesson, matches it to
learner support profiles, designs adaptations that fit the teacher's real constraints, checks and corrects its own
work, writes personalised learner material and translates it into the language the teacher or learner chose.

Built for the Melsoft Academy *Colleague Zero* hackathon (13–14 November 2026).

> Teachers make every final decision. Mothusi never diagnoses learners, never uses medical or deficit labels and
> never guesses a learner's language from their name or background.

## How the agents work

Mothusi's lesson-planning workflow is a **LangGraph** state graph. The AI makes the judgement calls, and code
enforces guardrails the AI cannot talk its way past.

```mermaid
graph TD;
  start([Teacher request]) --> screen[Safety screen];
  screen --> recall[Progress Tracker: recall feedback];
  recall --> plan[Orchestrator: plan the work];
  plan --> analyse[Lesson Analyst];
  analyse -. profiles to match .-> match[Needs Matcher];
  analyse -. no profiles .-> design;
  match --> design[Adaptation Designer + check_plan tool];
  design --> review[Reviewer];
  review -. approved .-> personalise[Personalisation Agent];
  review -. rejected .-> route[Orchestrator: route decision];
  route -. revise .-> design;
  route -. re-analyse .-> analyse;
  route -. escalate to teacher .-> personalise;
  personalise -. selected languages .-> translate[Language Agent + back-translation check];
  personalise -. all English .-> pack;
  translate --> pack[Pack Builder];
  pack --> done([Teacher review]);
```

| Who decides | What |
| --- | --- |
| **Orchestrator (AI planner)** | Which learners need the most attention, who needs their own material, what the Designer must keep in mind, what could go wrong |
| **Adaptation Designer (AI + tools)** | Starts from a vetted strategy library filtered to the class and the day's conditions, drafts adaptations, tests them with the `check_plan` tool, fixes what the tool finds, then submits |
| **Reviewer (code + AI)** | Code checks: one-to-one time budget, preparation-time budget, printer, devices, noisy venue, coverage, diagnostic labels, repeats of strategies that failed. AI review: objective kept, linked to profile, right for the age |
| **Orchestrator (AI router)** | Where rejected work goes: back to the Designer, back to the Lesson Analyst, or escalated to the teacher |
| **Code guardrails** | Nothing skips the Reviewer; design rounds are capped; the lesson is re-analysed at most once; one revision is always tried before escalating; the AI never chooses a learner's language; diagnostic labels are removed before any agent sees a profile |

If the planner or router model fails, the graph falls back to a safe default route and says so in the timeline.

Every step is a timestamped event tagged with its graph node, streamed live to the teacher portal. The planner page
and **Agent Activity** show the graph with the active agent lit up and the path the run actually took, plus a full
timeline with reasoning excerpts and every routing decision. Any run can be replayed.

**Adapting when things change.** When a teacher changes a condition (for example "tomorrow is in a noisy hall") or
returns the plan with a note, Mothusi re-checks every existing adaptation, redesigns only the ones that no longer fit,
refreshes only the learner material affected, and shows what changed.

**Learning from feedback.** After teaching, the teacher rates each adaptation. The Progress Tracker stores it, and
future plans bring it in: strategies that worked are reused and strategies that did not are rejected if repeated.
The model is never retrained.

**Failing safely.** API failures are retried, malformed model output is sent back for repair, and loops are capped.
When a run cannot finish, it stops with a clear message instead of pretending to succeed.

## Run it

Backend (Python 3.10+, [uv](https://docs.astral.sh/uv/)):

```bash
cd backend
cp .env.example .env          # add NVIDIA_API_KEY; without it Mothusi uses the offline demo model
uv sync
uv run uvicorn main:app --reload --port 8000
```

Frontend (Node 20+):

```bash
cd frontend
npm install
npm run dev                   # http://localhost:5173, proxies /api to port 8000
```

Terminal demo of the full workflow: `cd backend && uv run python -m scripts.demo` (add `--offline` for the offline
model).

Tests: `cd backend && uv run pytest`.

### Models

| Setting | Default | Used for |
| --- | --- | --- |
| `MOTHUSI_LLM_MODEL` | `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning` | Planning agents (fast) |
| `MOTHUSI_LANGUAGE_MODEL` | `nvidia/nemotron-3-ultra-550b-a55b` | Translation and back-translation |
| `MOTHUSI_REASONING_TASKS` | `lesson_analyst,adaptation_designer,reviewer` | Tasks where the planning model reasons first |

Built with LangGraph (workflow graph), Pydantic (validated agent outputs), the `openai` client (NVIDIA's
OpenAI-compatible API), FastAPI with Server-Sent Events (live streaming), SQLite (runs, events, feedback) and React.

The **offline demo model** is rule-based and clearly labelled in the UI. Tick "Use the offline demo model" in the
planner to rehearse, or to use it as a fallback if the network fails during judging. It cannot translate, and it says
so.

## Demo script (about 5 minutes)

1. **Teacher portal → Lesson Planner.** Grade 4A, Mathematics, "Fractions: halves and quarters". Three synthetic
   profiles: Learner A (visual), Learner B (short structured steps), Learner C (practical, learns in Setswana).
   No printer, 40 learners, 5 minutes of one-to-one time.
2. **Start the agents.** The workflow graph lights up node by node while the timeline shows the Orchestrator's own
   plan, each agent's output and timings. With the offline model the Designer's first draft needs 20 minutes of
   one-to-one time, so the Reviewer rejects it, the router sends only that item back, and the Designer tests its fix
   with `check_plan` before resubmitting. The graph shows the design–review loop as ×2. Live models often get the
   budget right first time, either straight away or after using `check_plan`; the next step then produces real
   rejections.
3. **Review the pack.** Show the checks, the learner material and the Setswana translation with its back-translation.
4. **Classroom conditions changed → noisy venue.** Adaptations that rely on speaking or listening are rejected and
   redesigned, and the rest are kept. "What changed in version 2" lists the differences.
5. **Approve**, then open the learner portal (learner code `L-003`): the home page, My lessons, Learn a topic,
   Practice and My progress all show the approved lesson. Choosing "Show me" on Learn a topic runs the
   Personalisation Agent live.
6. **Submit feedback**, marking one strategy "Did not work". Plan the next lesson: the Progress Tracker recalls the
   feedback and the Reviewer blocks the repeat.
7. **Agent Activity:** replay any run with timestamps, reasoning excerpts and every routing decision.

## Repository layout

```
backend/
  main.py                 FastAPI app entry (uvicorn main:app)
  config.py               settings from .env
  agents/                 one module per agent
  orchestration/          LangGraph lesson workflow (graph.py), re-planning and shared steps (workflow.py),
                          run manager, event trace
  tools/                  deterministic checks, safety screening, pack rendering
  models/                 Pydantic schemas and the Grades 1–4 curriculum scope
  llm/                    NVIDIA client and the offline demo model
  storage/                SQLite store for runs, events and feedback
  api/                    HTTP routes and the live event stream (Server-Sent Events)
  scripts/demo.py         terminal demo
  tests/                  pytest suite
frontend/src/
  teacher/  learner/  components/  hooks/  services/  pages/  styles/
```

## Responsible AI

- Synthetic learner profiles only. Agents see a learner label, strengths, support notes and the selected language.
- Diagnostic labels are removed before any agent sees a profile; outputs are checked for them too.
- Translations are always marked as AI drafts for a fluent speaker to check; learners only see translations that
  passed the back-translation check.
- Teacher approval is required before material reaches learners.
