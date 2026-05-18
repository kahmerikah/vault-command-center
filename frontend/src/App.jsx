import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import DashboardPage from "./pages/DashboardPage";
import LandingPage from "./pages/LandingPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import api, { refreshSession, setAuthToken } from "./lib/api";
import { disconnectSocket } from "./lib/socket";
import { useVaultStore } from "./store/useVaultStore";

function LockedScreen({ title }) {
  return (
    <main className="somb-login-screen flex min-h-screen items-center justify-center px-4">
      <div className="rounded-2xl border border-white/10 bg-black/40 px-6 py-5 font-mono text-center text-xs uppercase tracking-[0.28em] text-slate-300 backdrop-blur-md">
        <p>{title}</p>
      </div>
    </main>
  );
}

function ProtectedRoute({ children }) {
  const { accessToken, authChecked } = useVaultStore();
  const location = useLocation();

  if (!authChecked) {
    return <LockedScreen title="checking session" />;
  }

  if (!accessToken) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    accessToken,
    refreshToken,
    user,
    setAuth,
    clearAuth,
    markAuthChecked,
    touchActivity,
    hasIdleExpired,
  } = useVaultStore();

  useEffect(() => {
    let mounted = true;
    const state = useVaultStore.getState();
    const currentAccessToken = state.accessToken;
    const currentRefreshToken = state.refreshToken;
    const currentUser = state.user;

    const restore = async () => {
      if (!currentRefreshToken && !currentAccessToken) {
        setAuthToken("");
        markAuthChecked();
        return;
      }

      try {
        if (currentAccessToken) {
          setAuthToken(currentAccessToken);
          const me = await api.get("/auth/me");
          if (mounted) {
            setAuth({
              accessToken: currentAccessToken,
              refreshToken: currentRefreshToken,
              user: currentUser || me.data?.data?.user || null,
            });
          }
        } else {
          const refreshed = await refreshSession(currentRefreshToken);
          setAuthToken(refreshed.access_token);
          if (mounted) {
            setAuth({
              accessToken: refreshed.access_token,
              refreshToken: refreshed.refresh_token || currentRefreshToken,
              user: refreshed.user || currentUser,
            });
          }
        }
      } catch {
        if (mounted) {
          clearAuth();
          setAuthToken("");
          disconnectSocket();
        }
      } finally {
        if (mounted) {
          markAuthChecked();
        }
      }
    };

    restore();
    return () => {
      mounted = false;
    };
  }, [clearAuth, markAuthChecked, setAuth]);

  useEffect(() => {
    const onActivity = () => touchActivity();

    const events = ["click", "keydown", "mousemove", "scroll", "touchstart"];
    events.forEach((eventName) => window.addEventListener(eventName, onActivity, { passive: true }));

    const timer = window.setInterval(() => {
      const state = useVaultStore.getState();
      if (state.accessToken && state.hasIdleExpired()) {
        state.clearAuth();
        setAuthToken("");
        disconnectSocket();
        navigate("/login", { replace: true });
      }
    }, 30000);

    return () => {
      events.forEach((eventName) => window.removeEventListener(eventName, onActivity));
      window.clearInterval(timer);
    };
  }, [navigate, touchActivity]);

  const handleAuthenticated = ({ accessToken: newAccessToken, refreshToken: newRefreshToken, user: loggedInUser }) => {
    setAuthToken(newAccessToken);
    setAuth({ accessToken: newAccessToken, refreshToken: newRefreshToken, user: loggedInUser });
    const target = location.state?.from || "/dashboard";
    navigate(target, { replace: true });
  };

  const protectedPaths = [
    "/dashboard",
    "/analytics",
    "/modules",
    "/payments",
    "/vault",
    "/bookings",
    "/admin",
    "/chain",
  ];

  return (
    <Routes>
      <Route path="/" element={<LandingPage onAuthenticated={handleAuthenticated} />} />
      <Route path="/login" element={<LandingPage onAuthenticated={handleAuthenticated} />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/request-access" element={<LockedScreen title="request access" />} />
      {protectedPaths.map((path) => (
        <Route
          key={path}
          path={path}
          element={(
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          )}
        />
      ))}
      <Route
        path="*"
        element={<Navigate to={accessToken ? "/dashboard" : "/login"} replace />}
      />
    </Routes>
  );
}
