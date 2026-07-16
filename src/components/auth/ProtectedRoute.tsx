import { Navigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import Spinner from "../common/Spinner";
import type { ReactNode } from "react";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
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

  if (role === "student") {
    return <Navigate to="/portal/student" replace />;
  }

  if (role === "parent") {
    return <Navigate to="/portal/parent" replace />;
  }

  return <>{children}</>;
}
