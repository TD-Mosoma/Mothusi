import { useEffect, useState } from 'react'
import { getRun, streamRun } from '../services/api.js'

// Live events for one agent run. status: idle | connecting | running | done | failed | disconnected
export function useRunStream(runId) {
  const [events, setEvents] = useState([])
  const [status, setStatus] = useState(runId ? 'connecting' : 'idle')
  const [run, setRun] = useState(null)

  useEffect(() => {
    if (!runId) {
      setStatus('idle')
      return undefined
    }
    setEvents([])
    setRun(null)
    setStatus('connecting')
    const seen = new Set()
    const close = streamRun(runId, {
      onEvent: (e) => {
        if (seen.has(e.seq)) return
        seen.add(e.seq)
        setEvents((prev) => [...prev, e])
        setStatus('running')
      },
      onEnd: () =>
        getRun(runId)
          .then((r) => { setRun(r); setStatus(r.status === 'failed' ? 'failed' : 'done') })
          .catch(() => setStatus('disconnected')),
      onError: () => setStatus('disconnected'),
    })
    return close
  }, [runId])

  return { events, status, run }
}
