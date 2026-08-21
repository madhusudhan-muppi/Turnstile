import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth, type Role } from "./AuthContext";

export function ProtectedRoute({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading)
    return (
      <div className="w-full flex items-center justify-center min-h-screen bg-surface">
        <p className="font-body-lg text-body-lg text-on-surface-variant">Loading…</p>
      </div>
    );
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;

  return <>{children}</>;
}
