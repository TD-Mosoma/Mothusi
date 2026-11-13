import { Routes, Route, Navigate } from 'react-router-dom'
import Home from './pages/Home.jsx'
import LearnerLayout from './learner/LearnerLayout.jsx'
import LearnerHome from './learner/LearnerHome.jsx'
import LearnerLesson from './learner/LearnerLesson.jsx'
import LearnerOnboarding from './learner/LearnerOnboarding.jsx'
import {
  LearnerLessons,
  LearnerTopic,
  LearnerPractice,
  LearnerProgress,
  LearnerSaved,
  LearnerPreferences,
  LearnerProfile,
} from './learner/LearnerPages.jsx'
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
import AgentActivity from './teacher/AgentActivity.jsx'
import { AuthProvider } from './services/AuthContext.jsx'
import { GuestOnly, LoginPage, RequireRole } from './services/AuthRoutes.jsx'

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />

        <Route path="/learner/onboarding" element={<GuestOnly><LearnerOnboarding /></GuestOnly>} />
        <Route path="/teacher/onboarding" element={<GuestOnly><TeacherOnboarding /></GuestOnly>} />

        <Route path="/learner" element={<RequireRole role="learner"><LearnerLayout /></RequireRole>}>
          <Route index element={<LearnerHome />} />
          <Route path="lesson" element={<LearnerLesson />} />
          <Route path="lessons" element={<LearnerLessons />} />
          <Route path="topic" element={<LearnerTopic />} />
          <Route path="practice" element={<LearnerPractice />} />
          <Route path="progress" element={<LearnerProgress />} />
          <Route path="saved" element={<LearnerSaved />} />
          <Route path="preferences" element={<LearnerPreferences />} />
          <Route path="profile" element={<LearnerProfile />} />
        </Route>

        <Route path="/teacher" element={<RequireRole role="teacher"><TeacherLayout /></RequireRole>}>
          <Route index element={<TeacherDashboard />} />
          <Route path="classes" element={<MyClasses />} />
          <Route path="profiles" element={<LearnerProfiles />} />
          <Route path="plan" element={<LessonPlanner />} />
          <Route path="lessons" element={<LessonsReviews />} />
          <Route path="lessons/:id" element={<LessonReview />} />
          <Route path="lessons/:id/edit" element={<LessonEdit />} />
          <Route path="lessons/:id/feedback" element={<LessonFeedback />} />
          <Route path="activity" element={<AgentActivity />} />
          <Route path="activity/:runId" element={<AgentActivity />} />
          <Route path="resources" element={<Resources />} />
          <Route path="profile" element={<MyProfile />} />
          <Route path="settings" element={<Settings />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}
