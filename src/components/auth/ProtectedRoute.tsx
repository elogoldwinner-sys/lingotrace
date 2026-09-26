import { Navigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import Spinner from "../common/Spinner";
import type { ReactNode } from "react";

/**
 * Guards teacher-only pages (/dashboard, /classes, etc.). Lets the account
 * through whenever it has a teacher profile, even if it ALSO has a parent
 * or student portal identity — those no longer disqualify it. Only redirects
 * away when there is no teacher profile at all, same as before.
 */
export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, profile, portalParent, portalStudent, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream">
        <Spinner />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!profile) {
    if (portalParent) return <Navigate to="/portal/parent" replace />;
    if (portalStudent) return <Navigate to="/portal/student" replace />;
  }

  return <>{children}</>;
}
