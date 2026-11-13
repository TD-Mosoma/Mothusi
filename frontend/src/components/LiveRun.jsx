import { useState } from 'react'
import AgentProgress from './AgentProgress.jsx'
import AgentTimeline from './AgentTimeline.jsx'

// The simple progress view, with the full record of how the agents worked one click away.
export default function LiveRun({ events, status, showDetail = false, compact = false, title }) {
  const [detail, setDetail] = useState(showDetail)
  return (
    <div className="stack">
      <AgentProgress events={events} status={status} heading={title} />
      <div>
        <button type="button" className="btn ghost small" aria-expanded={detail} onClick={() => setDetail((d) => !d)}>
          {detail ? 'Hide how the agents worked' : 'Show how the agents worked'}
        </button>
      </div>
      {detail && <AgentTimeline events={events} status={status} compact={compact} title={title} />}
    </div>
  )
}
