import { useEffect, useRef } from 'react'
import { useRunStream } from '../hooks/useRunStream.js'
import LiveRun from './LiveRun.jsx'

// Live progress for follow-up runs (re-plan, re-check). Calls onDone once with the finished run.
export default function InlineRun({ runId, title, onDone, onFail, showDetail = false }) {
  const { events, status, run } = useRunStream(runId)
  const reported = useRef(null)

  useEffect(() => {
    if (reported.current === runId) return
    if (status === 'done' && run) {
      reported.current = runId
      if (run.status === 'failed') onFail?.(run.error || 'Mothusi stopped before it finished.')
      else onDone(run)
    } else if (status === 'failed' || status === 'disconnected') {
      reported.current = runId
      onFail?.(run?.error || 'The connection to Mothusi was lost.')
    }
  }, [status, run, runId])

  return (
    <section className="stack" aria-label={title}>
      <h2 className="visually-hidden">{title}</h2>
      <LiveRun events={events} status={status} showDetail={showDetail} compact title={title} />
    </section>
  )
}
