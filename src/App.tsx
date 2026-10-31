import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { SchoolProvider } from "./contexts/SchoolContext";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import PortalRoute from "./components/auth/PortalRoute";
import AppLayout from "./components/layout/AppLayout";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import PortalLoginPage from "./pages/PortalLoginPage";
import DashboardPage from "./pages/DashboardPage";
import PreferencesPage from "./pages/PreferencesPage";
import ClassesPage from "./pages/ClassesPage";
import StudentsPage from "./pages/StudentsPage";
import AttendancePage from "./pages/AttendancePage";
import ArchivePage from "./pages/ArchivePage";
import SessionsPage from "./pages/SessionsPage";
import NotesPage from "./pages/NotesPage";
import ProjectsPage from "./pages/ProjectsPage";
import LinkedActivitiesPage from "./pages/LinkedActivitiesPage";
import JoinPage from "./pages/JoinPage";
import SchoolLoginPage from "./pages/school/SchoolLoginPage";
import SchoolSetupPage from "./pages/school/SchoolSetupPage";
import SchoolPortalLayout from "./components/school/SchoolPortalLayout";
import SchoolOverviewPage from "./pages/school/SchoolOverviewPage";
import SchoolReportsPage from "./pages/school/SchoolReportsPage";
import SchoolComparePage from "./pages/school/SchoolComparePage";
import SchoolFeedbackPage from "./pages/school/SchoolFeedbackPage";
import SchoolTeachersPage from "./pages/school/SchoolTeachersPage";
import SchoolStaffPage from "./pages/school/SchoolStaffPage";
import SchoolAuditPage from "./pages/school/SchoolAuditPage";
import SchoolSettingsPage from "./pages/school/SchoolSettingsPage";
import SubmitProjectPage from "./pages/SubmitProjectPage";
import StudentPortalPage from "./pages/portal/StudentPortalPage";
import ParentPortalPage from "./pages/portal/ParentPortalPage";

export default function App() {
  return (
    <AuthProvider>
      <SchoolProvider>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/portal-login" element={<PortalLoginPage />} />
          <Route path="/sign-in" element={<Navigate to="/login" replace />} />
          <Route path="/sign-up" element={<Navigate to="/login" replace />} />
          <Route path="/join/:token" element={<JoinPage />} />
          <Route path="/school-login" element={<SchoolLoginPage />} />
          <Route path="/school/setup" element={<SchoolSetupPage />} />
          <Route path="/school" element={<SchoolPortalLayout />}>
            <Route index element={<SchoolOverviewPage />} />
            <Route path="reports" element={<SchoolReportsPage />} />
            <Route path="compare" element={<SchoolComparePage />} />
            <Route path="feedback" element={<SchoolFeedbackPage />} />
            <Route path="teachers" element={<SchoolTeachersPage />} />
            <Route path="staff" element={<SchoolStaffPage />} />
            <Route path="audit" element={<SchoolAuditPage />} />
            <Route path="settings" element={<SchoolSettingsPage />} />
          </Route>
          <Route path="/submit/:projectId" element={<SubmitProjectPage />} />

          <Route
            path="/portal/student"
            element={
              <PortalRoute allow="student">
                <StudentPortalPage />
              </PortalRoute>
            }
          />
          <Route
            path="/portal/parent"
            element={
              <PortalRoute allow="parent">
                <ParentPortalPage />
              </PortalRoute>
            }
          />

          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/preferences" element={<PreferencesPage />} />
            <Route path="/classes" element={<ClassesPage />} />
            <Route path="/students" element={<StudentsPage />} />
            <Route path="/attendance" element={<AttendancePage />} />
            <Route path="/sessions" element={<SessionsPage />} />
            <Route path="/archive" element={<ArchivePage />} />
            <Route path="/notes" element={<NotesPage />} />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/linked-activities" element={<LinkedActivitiesPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      </SchoolProvider>
    </AuthProvider>
  );
}
