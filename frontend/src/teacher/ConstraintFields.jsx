// Classroom conditions the agents must plan around. Used when planning and when conditions change.
export default function ConstraintFields({ form, set, errors = {}, legend = 'Classroom conditions' }) {
  return (
    <fieldset className="t-fieldset">
      <legend>{legend}</legend>
      <label className="t-check">
        <input type="checkbox" checked={form.noPrinter} onChange={(e) => set('noPrinter', e.target.checked)} />
        No printer available
      </label>
      <label className="t-check">
        <input type="checkbox" checked={form.hasDevices} onChange={(e) => set('hasDevices', e.target.checked)} />
        Learners have devices (tablets or computers)
      </label>
      <label className="t-check">
        <input type="checkbox" checked={form.noisyHall} onChange={(e) => set('noisyHall', e.target.checked)} />
        Lesson is in a noisy venue (for example a shared hall)
      </label>
      <div className="t-form-grid">
        <label className="t-field">Learners
          <input type="number" min="1" max="80" value={form.learnerCount} onChange={(e) => set('learnerCount', e.target.value)} />
          {errors.learnerCount && <span className="t-error" role="alert">{errors.learnerCount}</span>}
        </label>
        <label className="t-field">Lesson length (minutes)
          <input type="number" min="10" max="120" value={form.lessonMinutes} onChange={(e) => set('lessonMinutes', e.target.value)} />
          {errors.lessonMinutes && <span className="t-error" role="alert">{errors.lessonMinutes}</span>}
        </label>
        <label className="t-field">One-to-one time you have (minutes, whole lesson)
          <input type="number" min="0" max="60" value={form.supportMinutes} onChange={(e) => set('supportMinutes', e.target.value)} />
          {errors.supportMinutes && <span className="t-error" role="alert">{errors.supportMinutes}</span>}
        </label>
        <label className="t-field">Preparation time you have (minutes)
          <input type="number" min="0" max="240" value={form.prepMinutes ?? 30} onChange={(e) => set('prepMinutes', e.target.value)} />
          {errors.prepMinutes && <span className="t-error" role="alert">{errors.prepMinutes}</span>}
        </label>
      </div>
      <label className="t-field">Anything else Mothusi should know (optional)
        <input value={form.conditionNotes || ''} onChange={(e) => set('conditionNotes', e.target.value)}
          placeholder="For example: we share the hall with another class" />
      </label>
    </fieldset>
  )
}
