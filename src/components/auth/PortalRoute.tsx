import { Navigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import Spinner from "../common/Spinner";
import type { ReactNode } from "react";

/**
 * Guards /student/portal and /parent/portal. Checks whether THIS account has
 * the requested portal identity (portalParent / portalStudent) rather than a
 * single exclusive "role" — an account can have a teacher profile and a
 * parent/student profile at the same time, so having one doesn't disqualify
 * it from another. Falls back to whichever identity the account does have
 * when the requested one isn't present.
 */
export default function PortalRoute({
  allow,
  children,
}: {
  allow: "student" | "parent";
  children: ReactNode;
}) {
  const { user, profile, portalParent, portalStudent, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream">
        <Spinner />
      </div>
    );
  }

  // Each portal has its own login URL so each installed app stays inside its own scope.
  const loginPath = allow === "student" ? "/student/login" : "/parent/login";
  if (!user) {
    return <Navigate to={loginPath} replace />;
  }

  const hasRequested = allow === "parent" ? !!portalParent : !!portalStudent;
  if (!hasRequested) {
    if (profile) return <Navigate to="/teacher/dashboard" replace />;
    if (portalParent) return <Navigate to="/parent/portal" replace />;
    if (portalStudent) return <Navigate to="/student/portal" replace />;
    return <Navigate to={loginPath} replace />;
  }

  return <>{children}</>;
}
