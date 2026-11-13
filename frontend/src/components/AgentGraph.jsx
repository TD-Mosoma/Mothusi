import { useEffect, useMemo, useState } from 'react'
import { getGraph } from '../services/api.js'
import { AGENT_KEY } from './agents.js'

// Positions for the LangGraph nodes (the structure itself comes from the backend).
const W = 1150
const H = 460
const BOX = { w: 144, h: 54 }
const POS = {
  __start__: [36, 100], screen: [148, 100], recall: [328, 100], plan: [508, 100], analyse: [688, 100], match: [868, 100],
  design: [1060, 100], review: [1060, 250], route: [778, 250], personalise: [778, 390], translate: [508, 390],
  pack: [260, 390], __end__: [70, 390],
}
const ARCS = { 'analyse>design': 'over', 'personalise>pack': 'under' }
const isTerminal = (id) => id === '__start__' || id === '__end__'

let cached = null
const loadGraph = () => (cached ||= getGraph().catch((e) => { cached = null; throw e }))

function edgePath(source, target, arc) {
  const [sx, sy] = POS[source]
  const [tx, ty] = POS[target]
  if (arc) {
    const dir = arc === 'over' ? -1 : 1
    const y1 = sy + dir * BOX.h / 2
    const y2 = ty + dir * BOX.h / 2
    const cy = (arc === 'over' ? Math.min(y1, y2) : Math.max(y1, y2)) + dir * 60
    const cx = (sx + tx) / 2
    return { d: `M ${sx} ${y1} Q ${cx} ${cy} ${tx} ${y2}`, mid: [cx, (y1 + y2) / 4 + cy / 2] }
  }
  const clip = (x, y, ox, oy, terminal) => {
    const dx = ox - x
    const dy = oy - y
    if (terminal) {
      const len = Math.hypot(dx, dy) || 1
      return [x + (dx / len) * 14, y + (dy / len) * 14]
    }
    const scale = Math.min(Math.abs((BOX.w / 2 + 4) / (dx || 1e-6)), Math.abs((BOX.h / 2 + 4) / (dy || 1e-6)))
    return [x + dx * scale, y + dy * scale]
  }
  const [x1, y1] = clip(sx, sy, tx, ty, isTerminal(source))
  const [x2, y2] = clip(tx, ty, sx, sy, isTerminal(target))
  // Labels on short horizontal edges sit above the boxes so they stay readable.
  const mid = sy === ty ? [(x1 + x2) / 2, sy - BOX.h / 2 - 4] : [(x1 + x2) / 2, (y1 + y2) / 2]
  return { d: `M ${x1} ${y1} L ${x2} ${y2}`, mid }
}

function runState(events) {
  const sequence = []
  const rejections = {}
  for (const e of events) {
    if (!e.node) continue
    if (sequence[sequence.length - 1] !== e.node) sequence.push(e.node)
    if (e.type === 'check_failed') rejections[e.node] = (rejections[e.node] || 0) + 1
  }
  const finished = events.some((e) => e.type === 'run_completed' || e.type === 'run_failed')
  const completed = events.some((e) => e.type === 'run_completed')
  const path = sequence.length ? ['__start__', ...sequence, ...(completed ? ['__end__'] : [])] : []
  const visits = {}
  const traversed = {}
  path.forEach((n, i) => {
    visits[n] = (visits[n] || 0) + 1
    if (i > 0) traversed[`${path[i - 1]}>${n}`] = (traversed[`${path[i - 1]}>${n}`] || 0) + 1
  })
  const active = !finished && sequence.length ? sequence[sequence.length - 1] : null
  const lastEdge = path.length > 1 ? `${path[path.length - 2]}>${path[path.length - 1]}` : null
  return { visits, traversed, active, finished, lastEdge, rejections }
}

export default function AgentGraph({ events }) {
  const [graph, setGraph] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => { loadGraph().then(setGraph, (e) => setError(e.message)) }, [])
  const state = useMemo(() => runState(events), [events])

  if (error) return <p className="muted small-text">Workflow graph unavailable: {error}</p>
  if (!graph) return null
  const known = graph.nodes.filter((n) => POS[n.id])

  return (
    <figure className="ag">
      <figcaption className="ag-caption">
        <strong>Workflow graph</strong>
        <span className="muted small-text">LangGraph state graph. Dashed arrows are decisions; highlighted arrows are the path this run took.</span>
      </figcaption>
      <div className="ag-scroll">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Agent workflow graph showing which agents have run">
          <defs>
            {['idle', 'done', 'live'].map((k) => (
              <marker key={k} id={`ag-arrow-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" className={`ag-arrowhead ${k}`} />
              </marker>
            ))}
          </defs>

          {graph.edges.filter((e) => POS[e.source] && POS[e.target]).map((e) => {
            const key = `${e.source}>${e.target}`
            const { d, mid } = edgePath(e.source, e.target, ARCS[key])
            const count = state.traversed[key] || 0
            const live = !state.finished && key === state.lastEdge
            const kind = live ? 'live' : count ? 'done' : 'idle'
            return (
              <g key={key} className={`ag-edge ${kind} ${e.conditional ? 'conditional' : ''}`}>
                <path d={d} markerEnd={`url(#ag-arrow-${kind})`} />
                {(e.label || count > 1) && (
                  <text x={mid[0]} y={mid[1] - 6} textAnchor="middle" className="ag-edge-label">
                    {e.label}{count > 1 ? ` ×${count}` : ''}
                  </text>
                )}
              </g>
            )
          })}

          {known.map((n) => {
            const [x, y] = POS[n.id]
            const visits = state.visits[n.id] || 0
            const status = state.active === n.id ? 'active' : visits ? 'visited' : state.finished ? 'skipped' : 'pending'
            if (isTerminal(n.id)) {
              return (
                <g key={n.id} className={`ag-terminal ${status}`}>
                  <circle cx={x} cy={y} r="12" />
                  <text x={x} y={y + 30} textAnchor="middle" className="ag-terminal-label">{n.id === '__start__' ? 'Teacher' : 'Pack'}</text>
                </g>
              )
            }
            const rejected = state.rejections[n.id]
            return (
              <g key={n.id} className={`ag-node ${status}`} data-agent={AGENT_KEY[n.agent] || 'orch'}>
                <title>{`${n.agent}: ${n.label} (${status})`}</title>
                <rect x={x - BOX.w / 2} y={y - BOX.h / 2} width={BOX.w} height={BOX.h} rx="12" />
                <rect className="ag-band" x={x - BOX.w / 2} y={y - BOX.h / 2} width="6" height={BOX.h} rx="3" />
                <text x={x - BOX.w / 2 + 16} y={y - 5} className="ag-node-agent">{n.agent}</text>
                <text x={x - BOX.w / 2 + 16} y={y + 14} className="ag-node-label">{n.label}</text>
                {visits > 1 && <text x={x + BOX.w / 2} y={y - BOX.h / 2 - 6} textAnchor="end" className="ag-badge">×{visits}</text>}
                {rejected > 0 && (
                  <text x={x + BOX.w / 2 - 8} y={y + BOX.h / 2 - 7} textAnchor="end" className="ag-badge bad">{rejected} rejected</text>
                )}
              </g>
            )
          })}
        </svg>
      </div>
    </figure>
  )
}
