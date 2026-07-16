import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import PortalRoute from "./components/auth/PortalRoute";
import AppLayout from "./components/layout/AppLayout";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import ClassesPage from "./pages/ClassesPage";
import StudentsPage from "./pages/StudentsPage";
import AttendancePage from "./pages/AttendancePage";
import SessionsPage from "./pages/SessionsPage";
import NotesPage from "./pages/NotesPage";
import NotificationsPage from "./pages/NotificationsPage";
import JoinPage from "./pages/JoinPage";
import StudentPortalPage from "./pages/portal/StudentPortalPage";
import ParentPortalPage from "./pages/portal/ParentPortalPage";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/sign-in" element={<Navigate to="/login" replace />} />
          <Route path="/sign-up" element={<Navigate to="/login" replace />} />
          <Route path="/join/:token" element={<JoinPage />} />

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
            <Route path="/classes" element={<ClassesPage />} />
            <Route path="/students" element={<StudentsPage />} />
            <Route path="/attendance" element={<AttendancePage />} />
            <Route path="/sessions" element={<SessionsPage />} />
            <Route path="/notes" element={<NotesPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
