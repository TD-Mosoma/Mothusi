import { useEffect, useRef } from 'react'
import { useRunStream } from '../hooks/useRunStream.js'
import AgentTimeline from './AgentTimeline.jsx'

// A compact live timeline for follow-up runs (re-plan, re-check). Calls onDone once with the finished run.
export default function InlineRun({ runId, title, onDone, onFail }) {
  const { events, status, run } = useRunStream(runId)
  const reported = useRef(null)

  useEffect(() => {
    if (reported.current === runId) return
    if (status === 'done' && run) {
      reported.current = runId
      onDone(run)
    } else if (status === 'failed' || status === 'disconnected') {
      reported.current = runId
      onFail?.(run?.error || 'The connection to Mothusi was lost.')
    }
  }, [status, run, runId])

  return <AgentTimeline events={events} status={status} title={title} compact />
}
