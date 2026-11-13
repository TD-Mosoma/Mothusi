// Draws a lesson as a single image a teacher can share (for example on WhatsApp) or keep on their phone.
const W = 1080
const PAD = 72
const COLORS = { teal: '#1B6E71', deep: '#124A4F', orange: '#EE7A36', sun: '#F5B940', ink: '#16343A', soft: '#546A6D', tint: '#E9F1F0', line: '#D6E2E1' }

function wrap(ctx, text, maxWidth) {
  const words = String(text || '').split(/\s+/).filter(Boolean)
  const lines = []
  let line = ''
  for (const w of words) {
    const test = line ? `${line} ${w}` : w
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w } else line = test
  }
  if (line) lines.push(line)
  return lines
}

const loadImage = (src) => new Promise((resolve) => {
  const img = new Image()
  img.onload = () => resolve(img)
  img.onerror = () => resolve(null)
  img.src = src
})

export async function drawLessonCard(lesson, { logo } = {}) {
  await document.fonts?.ready
  const display = '"Lexend", system-ui, sans-serif'
  const body = '"Atkinson Hyperlegible", system-ui, sans-serif'
  const adaptations = (lesson.adaptations || []).filter((a) => !a.removed)
  const names = Object.fromEntries((lesson.learnersPack || []).map((l) => [l.id, l.name]))

  // Measure first, then draw on a canvas of the right height.
  const measure = document.createElement('canvas').getContext('2d')
  const blocks = []
  const add = (font, color, text, gap = 8, width = W - PAD * 2, indent = 0) => {
    measure.font = font
    const lines = wrap(measure, text, width - indent)
    blocks.push({ font, color, lines, gap, indent, lineHeight: parseInt(font.match(/(\d+)px/)[1], 10) * 1.35 })
  }
  add(`600 54px ${display}`, COLORS.ink, lesson.topic, 10)
  add(`400 28px ${body}`, COLORS.soft, `${lesson.grade} ${lesson.subject} • ${(lesson.flow || []).reduce((n, f) => n + Number(f.min || 0), 0)} minutes`, 28)
  add(`700 26px ${display}`, COLORS.teal, 'LEARNERS WILL', 6)
  add(`400 32px ${body}`, COLORS.ink, lesson.objectiveSummary || lesson.objectives, 30)
  if (lesson.flow?.length) {
    add(`700 26px ${display}`, COLORS.teal, 'LESSON FLOW', 6)
    for (const f of lesson.flow) add(`400 30px ${body}`, COLORS.ink, `${f.min} min  ${f.label}${f.activity ? `: ${f.activity}` : ''}`, 6, W - PAD * 2, 0)
    blocks[blocks.length - 1].gap = 30
  }
  if (adaptations.length) {
    add(`700 26px ${display}`, COLORS.teal, 'SUPPORT', 6)
    for (const a of adaptations.slice(0, 8)) {
      const who = a.learnerId === 'whole_class' ? 'Whole class' : names[a.learnerId] || a.learner
      add(`400 28px ${body}`, COLORS.ink, `${who}: ${a.strategy} (${a.teacherMinutes} min)`, 6)
    }
    blocks[blocks.length - 1].gap = 30
  }
  if (lesson.vocabulary?.length) {
    add(`700 26px ${display}`, COLORS.teal, 'KEY WORDS', 6)
    add(`400 30px ${body}`, COLORS.ink, lesson.vocabulary.join(' • '), 30)
  }

  const header = 150
  const footer = 110
  const content = blocks.reduce((h, b) => h + b.lines.length * b.lineHeight + b.gap, 0)
  const H = Math.max(1080, header + PAD + content + footer)
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = COLORS.deep
  ctx.fillRect(0, 0, W, header)
  const stripe = ctx.createLinearGradient(0, 0, W, 0)
  stripe.addColorStop(0, COLORS.teal); stripe.addColorStop(0.6, COLORS.sun); stripe.addColorStop(1, COLORS.orange)
  ctx.fillStyle = stripe
  ctx.fillRect(0, header, W, 10)

  const img = logo ? await loadImage(logo) : null
  if (img) {
    // The logo's dark outline needs a light badge on the dark header.
    const box = 96
    const top = (header - box) / 2
    ctx.fillStyle = '#FFFFFF'
    ctx.beginPath()
    if (ctx.roundRect) ctx.roundRect(PAD, top, box, box, 22)
    else ctx.rect(PAD, top, box, box)
    ctx.fill()
    const h = 76
    const w = (img.width / img.height) * h
    ctx.drawImage(img, PAD + (box - w) / 2, top + (box - h) / 2, w, h)
  }
  ctx.fillStyle = '#FFFFFF'
  ctx.font = `600 44px ${display}`
  ctx.fillText('Lesson card', img ? PAD + 124 : PAD, header / 2 + 15)
  ctx.font = `400 26px ${body}`
  ctx.textAlign = 'right'
  ctx.fillText(lesson.date || '', W - PAD, header / 2 + 10)
  ctx.textAlign = 'left'

  let y = header + PAD
  for (const b of blocks) {
    ctx.font = b.font
    ctx.fillStyle = b.color
    for (const line of b.lines) {
      y += b.lineHeight * 0.8
      ctx.fillText(line, PAD + b.indent, y)
      y += b.lineHeight * 0.2
    }
    y += b.gap
  }

  ctx.fillStyle = COLORS.tint
  ctx.fillRect(0, H - footer, W, footer)
  ctx.fillStyle = COLORS.soft
  ctx.font = `400 24px ${body}`
  ctx.fillText(`Prepared with Mothusi and approved by the teacher • Version ${lesson.version || 1}`, PAD, H - footer / 2 + 8)

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}

// On a phone, open the share sheet (for example to WhatsApp); on a computer, or where sharing files is not
// supported, download the image.
export async function shareLessonCard(lesson, options) {
  const blob = await drawLessonCard(lesson, options)
  if (!blob) throw new Error('The lesson card could not be drawn on this device.')
  const name = `${(lesson.topic || 'lesson').replace(/[^\w -]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'lesson'}-card.png`
  const file = new File([blob], name, { type: 'image/png' })
  const phone = window.matchMedia('(pointer: coarse)').matches // computers download; phones open the share sheet
  if (phone && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: lesson.topic })
      return 'shared'
    } catch (e) {
      if (e.name === 'AbortError') return 'cancelled'
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
  return 'downloaded'
}
