import { Navigate } from "react-router-dom";
import { useAuth, type PortalRole } from "../../contexts/AuthContext";
import Spinner from "../common/Spinner";
import type { ReactNode } from "react";

/** Guards /portal/student and /portal/parent — only the matching role gets in. */
export default function PortalRoute({
  allow,
  children,
}: {
  allow: PortalRole;
  children: ReactNode;
}) {
  const { user, role, loading } = useAuth();

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

  if (role !== allow) {
    if (role === "teacher") return <Navigate to="/dashboard" replace />;
    if (role === "student") return <Navigate to="/portal/student" replace />;
    if (role === "parent") return <Navigate to="/portal/parent" replace />;
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
