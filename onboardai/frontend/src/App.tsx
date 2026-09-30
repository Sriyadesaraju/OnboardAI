import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/auth";
import Login from "./pages/Login";
import ManagerDashboard from "./pages/ManagerDashboard";
import TraineeDashboard from "./pages/TraineeDashboard";
import SpocDashboard from "./pages/SpocDashboard";
import TraineeDetail from "./pages/TraineeDetail";
import type { UserRole } from "./lib/types";

function homePathForRole(role: UserRole): string {
  if (role === "TRAINEE") return "/trainee";
  if (role === "SPOC") return "/spoc";
  return "/manager";
}

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenMessage text="Loading…" />;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={homePathForRole(user.role)} replace />;
}

function RequireRole({ allow, children }: { allow: UserRole[]; children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenMessage text="Loading…" />;
  if (!user) return <Navigate to="/login" replace />;
  if (!allow.includes(user.role)) {
    return <Navigate to={homePathForRole(user.role)} replace />;
  }
  return children;
}

function FullScreenMessage({ text }: { text: string }) {
  return <div className="flex min-h-screen items-center justify-center text-slate-500">{text}</div>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/login" element={<Login />} />
      <Route
        path="/manager"
        element={
          <RequireRole allow={["MANAGER", "ADMIN"]}>
            <ManagerDashboard />
          </RequireRole>
        }
      />
      <Route
        path="/spoc"
        element={
          <RequireRole allow={["SPOC"]}>
            <SpocDashboard />
          </RequireRole>
        }
      />
      <Route
        path="/trainee"
        element={
          <RequireRole allow={["TRAINEE"]}>
            <TraineeDashboard />
          </RequireRole>
        }
      />
      <Route
        path="/trainees/:id"
        element={
          <RequireRole allow={["MANAGER", "ADMIN", "SPOC"]}>
            <TraineeDetail />
          </RequireRole>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
