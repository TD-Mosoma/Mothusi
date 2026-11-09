export const GRADES = ['Grade R', ...Array.from({ length: 12 }, (_, i) => `Grade ${i + 1}`)]

export const SUBJECTS = [
  'Mathematics', 'Mathematical Literacy', 'English', 'Afrikaans', 'Setswana', 'isiZulu', 'isiXhosa',
  'Natural Sciences', 'Life Sciences', 'Physical Sciences', 'Social Sciences', 'Geography',
  'History', 'Technology', 'Life Skills', 'Creative Arts', 'Economic and Management Sciences',
]

export const LANGUAGE_OPTIONS = ['English', 'Setswana', 'isiZulu', 'isiXhosa']

export const MATERIAL_TYPES = ['Curriculum document', 'Lesson notes', 'Worksheet', 'Assessment', 'Other']

export const unique = (arr) => [...new Set(arr.filter(Boolean))]
export const byGrade = (a, b) => GRADES.indexOf(a) - GRADES.indexOf(b)