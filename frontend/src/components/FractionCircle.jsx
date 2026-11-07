// A circle split into equal slices with some shaded. Used in the learner portal
// (and reusable on the teacher side for previews). Pure SVG, no libraries.
export default function FractionCircle({ parts = 4, shaded = 1, size = 140, label }) {
  const r = 60
  const cx = 70
  const cy = 70
  const slices = Array.from({ length: parts }, (_, i) => {
    const a0 = (i / parts) * 2 * Math.PI - Math.PI / 2
    const a1 = ((i + 1) / parts) * 2 * Math.PI - Math.PI / 2
    const x0 = cx + r * Math.cos(a0)
    const y0 = cy + r * Math.sin(a0)
    const x1 = cx + r * Math.cos(a1)
    const y1 = cy + r * Math.sin(a1)
    const large = 1 / parts > 0.5 ? 1 : 0
    const d = parts === 1
      ? `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0`
      : `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`
    return <path key={i} d={d} fill={i < shaded ? '#3AA0E8' : '#FFFFFF'} stroke="#1D6FB0" strokeWidth="3" strokeLinejoin="round" />
  })
  return (
    <svg width={size} height={size} viewBox="0 0 140 140" role="img" aria-label={label || `${shaded} of ${parts} parts shaded`}>
      {slices}
    </svg>
  )
}
