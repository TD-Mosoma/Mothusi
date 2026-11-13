// Mothusi currently serves Grades 1–4 (CAPS). Keep in step with backend/models/curriculum.py.
export const GRADES = ['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4']

const FOUNDATION = ['Mathematics', 'Home Language', 'First Additional Language', 'Life Skills']

export const SUBJECTS_BY_GRADE = {
  'Grade 1': FOUNDATION,
  'Grade 2': FOUNDATION,
  'Grade 3': FOUNDATION,
  'Grade 4': ['Mathematics', 'Home Language', 'First Additional Language', 'Natural Sciences and Technology', 'Social Sciences', 'Life Skills'],
}

export const SUBJECTS = [...new Set(Object.values(SUBJECTS_BY_GRADE).flat())]

export const subjectsFor = (grade) => SUBJECTS_BY_GRADE[grade] || []

// Selected by the teacher or learner. Never inferred from a name or background.
export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'tn', label: 'Setswana' },
  { code: 'zu', label: 'isiZulu' },
  { code: 'xh', label: 'isiXhosa' },
  { code: 'af', label: 'Afrikaans' },
  { code: 'st', label: 'Sesotho' },
  { code: 've', label: 'Tshivenda (Venda)' },
  { code: 'nso', label: 'Sepedi' },
  { code: 'nr', label: 'isiNdebele' },
  { code: 'ss', label: 'siSwati' },
  { code: 'ts', label: 'itsonga' },
]
export const LANGUAGE_OPTIONS = LANGUAGES.map((l) => l.label)
export const languageLabel = (code) => LANGUAGES.find((l) => l.code === code)?.label || code

export const MATERIAL_TYPES = ['CAPS document', 'Lesson notes', 'Worksheet', 'Assessment', 'Other']

export const unique = (arr) => [...new Set(arr.filter(Boolean))]
export const byGrade = (a, b) => GRADES.indexOf(a) - GRADES.indexOf(b)
