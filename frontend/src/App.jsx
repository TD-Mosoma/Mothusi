import { Routes, Route, Navigate } from 'react-router-dom'
import Home from './pages/Home.jsx'
import LearnerLayout from './learner/LearnerLayout.jsx'
import LearnerHome from './learner/LearnerHome.jsx'
import LearnerLesson from './learner/LearnerLesson.jsx'
import TeacherLayout from './teacher/TeacherLayout.jsx'
import TeacherDashboard from './teacher/TeacherDashboard.jsx'
import LessonPlanner from './teacher/LessonPlanner.jsx'
import LearnerOnboarding from './learner/LearnerOnboarding.jsx'
import TeacherOnboarding from './teacher/TeacherOnboarding.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      
      <Route path="/learner/onboarding" element={<LearnerOnboarding />} />
      <Route path="/learner" element={<LearnerLayout />}>
        <Route index element={<LearnerHome />} />
        <Route path="lesson" element={<LearnerLesson />} />
      </Route>

      <Route path="/teacher/onboarding" element={<TeacherOnboarding />} />
      <Route path="/teacher" element={<TeacherLayout />}>
        <Route index element={<TeacherDashboard />} />
        <Route path="plan" element={<LessonPlanner />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
