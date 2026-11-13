import { useState } from 'react'
import FractionCircle from '../components/FractionCircle.jsx'
import { languageLabel } from './curriculum.js'

const TRANSLATION_NOTE = {
  checked: { tone: 'ok', text: 'Back-translation check passed. AI draft: ask a fluent speaker to read it before class.' },
  needs_review: { tone: 'warn', text: 'The meaning check found problems. A fluent speaker must review it.' },
  failed: { tone: 'warn', text: 'Translation failed. Learners will see English.' },
  unavailable: { tone: '', text: 'Not translated (offline model). Learners will see English with a note.' },
}

// Teacher preview of the learner-facing material, including any translation.
export default function LearnerMaterialView({ material, translation }) {
  const [showTranslated, setShowTranslated] = useState(false)
  const translated = translation?.material
  const shown = showTranslated && translated ? translated : material
  const note = translation ? TRANSLATION_NOTE[translation.status] : null

  return (
    <details className="t-material">
      <summary>Learner material: “{material.title}”</summary>
      {translation && (
        <div className="row tight">
          <span className={`chip ${note?.tone || ''}`}>{languageLabel(translation.language)}: {translation.status.replace('_', ' ')}</span>
          {translated && (
            <button type="button" className="btn ghost small" onClick={() => setShowTranslated((v) => !v)}>
              {showTranslated ? 'Show English' : `Show ${languageLabel(translation.language)}`}
            </button>
          )}
        </div>
      )}
      {note && <p className="muted small-text">{note.text}</p>}
      {showTranslated && translation?.back_translation && (
        <p className="small-text"><strong>Back-translation:</strong> {translation.back_translation}</p>
      )}
      {translation?.issues?.length > 0 && <p className="small-text">Issues: {translation.issues.join('; ')}</p>}

      <div className="stack t-material-body">
        <div>{shown.explanation.map((s, i) => <p key={i}>{s}</p>)}</div>
        <p><strong>Everyday example:</strong> {shown.everyday_example}</p>
        <p><strong>Activity:</strong> {shown.activity}</p>
        <ol className="t-practice">
          {shown.practice.map((q, i) => (
            <li key={i}>
              <span>{q.prompt}</span>
              <div className="row tight">
                {q.options.map((o, j) => (
                  <span key={j} className={`t-option ${j === q.answer_index ? 'answer' : ''}`}>
                    {o.fraction && <FractionCircle parts={o.fraction.parts} shaded={o.fraction.shaded} size={44} />}
                    {o.text}
                  </span>
                ))}
              </div>
              {q.hint && <span className="muted small-text">Hint: {q.hint}</span>}
            </li>
          ))}
        </ol>
        {material.teacher_tip && <p className="t-note">Tip: {material.teacher_tip}</p>}
      </div>
    </details>
  )
}
