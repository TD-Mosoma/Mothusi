import { Routes, Route, Navigate } from 'react-router-dom'
import Home from './pages/Home.jsx'
import LearnerLayout from './learner/LearnerLayout.jsx'
import LearnerHome from './learner/LearnerHome.jsx'
import LearnerLesson from './learner/LearnerLesson.jsx'
import LearnerOnboarding from './learner/LearnerOnboarding.jsx'
import TeacherOnboarding from './teacher/TeacherOnboarding.jsx'
import TeacherLayout from './teacher/TeacherLayout.jsx'
import TeacherDashboard from './teacher/TeacherDashboard.jsx'
import MyClasses from './teacher/MyClasses.jsx'
import LearnerProfiles from './teacher/LearnerProfiles.jsx'
import LessonPlanner from './teacher/LessonPlanner.jsx'
import LessonsReviews from './teacher/LessonsReviews.jsx'
import LessonReview from './teacher/LessonReview.jsx'
import LessonEdit from './teacher/LessonEdit.jsx'
import LessonFeedback from './teacher/LessonFeedback.jsx'
import Resources from './teacher/Resources.jsx'
import MyProfile from './teacher/MyProfile.jsx'
import Settings from './teacher/Settings.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />

      <Route path="/learner/onboarding" element={<LearnerOnboarding />} />
      <Route path="/teacher/onboarding" element={<TeacherOnboarding />} />

      <Route path="/learner" element={<LearnerLayout />}>
        <Route index element={<LearnerHome />} />
        <Route path="lesson" element={<LearnerLesson />} />
      </Route>

      <Route path="/teacher" element={<TeacherLayout />}>
        <Route index element={<TeacherDashboard />} />
        <Route path="classes" element={<MyClasses />} />
        <Route path="profiles" element={<LearnerProfiles />} />
        <Route path="plan" element={<LessonPlanner />} />
        <Route path="lessons" element={<LessonsReviews />} />
        <Route path="lessons/:id" element={<LessonReview />} />
        <Route path="lessons/:id/edit" element={<LessonEdit />} />
        <Route path="lessons/:id/feedback" element={<LessonFeedback />} />
        <Route path="resources" element={<Resources />} />
        <Route path="profile" element={<MyProfile />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
