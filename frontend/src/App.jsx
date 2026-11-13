import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Home from './pages/Home.jsx'
import { AuthProvider } from './services/AuthContext.jsx'
import { ForgotPasswordPage, GuestOnly, LoginPage, RequireRole, ResetPasswordPage } from './services/AuthRoutes.jsx'

// Each portal loads only when it is opened, so learners on mobile data never download the teacher portal.
const LearnerLayout = lazy(() => import('./learner/LearnerLayout.jsx'))
const LearnerHome = lazy(() => import('./learner/LearnerHome.jsx'))
const LearnerLesson = lazy(() => import('./learner/LearnerLesson.jsx'))
const LearnerOnboarding = lazy(() => import('./learner/LearnerOnboarding.jsx'))
const TeacherOnboarding = lazy(() => import('./teacher/TeacherOnboarding.jsx'))
const TeacherLayout = lazy(() => import('./teacher/TeacherLayout.jsx'))
const TeacherDashboard = lazy(() => import('./teacher/TeacherDashboard.jsx'))
const MyClasses = lazy(() => import('./teacher/MyClasses.jsx'))
const LearnerProfiles = lazy(() => import('./teacher/LearnerProfiles.jsx'))
const LessonPlanner = lazy(() => import('./teacher/LessonPlanner.jsx'))
const LessonsReviews = lazy(() => import('./teacher/LessonsReviews.jsx'))
const LessonReview = lazy(() => import('./teacher/LessonReview.jsx'))
const LessonEdit = lazy(() => import('./teacher/LessonEdit.jsx'))
const LessonFeedback = lazy(() => import('./teacher/LessonFeedback.jsx'))
const Resources = lazy(() => import('./teacher/Resources.jsx'))
const MyProfile = lazy(() => import('./teacher/MyProfile.jsx'))
const Settings = lazy(() => import('./teacher/Settings.jsx'))
const AgentActivity = lazy(() => import('./teacher/AgentActivity.jsx'))
const ClassInsights = lazy(() => import('./teacher/ClassInsights.jsx'))
const TeachMode = lazy(() => import('./teacher/TeachMode.jsx'))
const PictureSignIn = lazy(() => import('./learner/PictureSignIn.jsx'))
const LearnerLessons = lazy(() => import('./learner/LearnerPages.jsx').then((m) => ({ default: m.LearnerLessons })))
const LearnerTopic = lazy(() => import('./learner/LearnerPages.jsx').then((m) => ({ default: m.LearnerTopic })))
const LearnerPractice = lazy(() => import('./learner/LearnerPages.jsx').then((m) => ({ default: m.LearnerPractice })))
const LearnerProgress = lazy(() => import('./learner/LearnerPages.jsx').then((m) => ({ default: m.LearnerProgress })))
const LearnerSaved = lazy(() => import('./learner/LearnerPages.jsx').then((m) => ({ default: m.LearnerSaved })))
const LearnerPreferences = lazy(() => import('./learner/LearnerPages.jsx').then((m) => ({ default: m.LearnerPreferences })))
const LearnerProfile = lazy(() => import('./learner/LearnerPages.jsx').then((m) => ({ default: m.LearnerProfile })))

export default function App() {
  return (
    <AuthProvider>
      <Suspense fallback={<p className="route-loading" role="status">Loading…</p>}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
        <Route path="/join" element={<GuestOnly><PictureSignIn /></GuestOnly>} />
        <Route path="/forgot-password" element={<GuestOnly><ForgotPasswordPage /></GuestOnly>} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

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
          <Route path="lessons/:id/teach" element={<TeachMode />} />
          <Route path="insights" element={<ClassInsights />} />
          <Route path="activity" element={<AgentActivity />} />
          <Route path="activity/:runId" element={<AgentActivity />} />
          <Route path="resources" element={<Resources />} />
          <Route path="profile" element={<MyProfile />} />
          <Route path="settings" element={<Settings />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </AuthProvider>
  )
}
