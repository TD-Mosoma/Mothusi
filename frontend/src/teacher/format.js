export const formatDate = (d) => {
  if (!d) return ''
  const date = d.length === 10 ? new Date(`${d}T00:00:00`) : new Date(d)
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export const formatDateTime = (d) =>
  new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export const tomorrowISO = () => {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

export const todayISO = () => new Date().toISOString().slice(0, 10)

export const formatSize = (bytes) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`

// tone maps to the .chip classes: '' | 'ok' | 'warn'
export const STATUS = {
  draft: { label: 'Draft', tone: '' },
  awaiting_review: { label: 'Awaiting review', tone: 'warn' },
  approved: { label: 'Approved', tone: 'ok' },
  feedback_due: { label: 'Feedback due', tone: 'warn' },
  returned: { label: 'Returned for changes', tone: '' },
  completed: { label: 'Feedback submitted', tone: 'ok' },
}

export const initialsOf = (name = '') =>
  name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() || '').join('')