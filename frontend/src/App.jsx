import { Suspense, lazy, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import api, { refreshSession, setAuthToken } from "./lib/api";
import { disconnectSocket } from "./lib/socket";
import { useVaultStore } from "./store/useVaultStore";

const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const AuthPage = lazy(() => import("./pages/AuthPage"));
const PaymentsPage = lazy(() => import("./pages/PaymentsPage"));
const BookingsPage = lazy(() => import("./pages/BookingsPage"));
const BlockchainPage = lazy(() => import("./pages/BlockchainPage"));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage"));
const AnalyticsPage = lazy(() => import("./pages/AnalyticsPage"));
const ModulesPage = lazy(() => import("./pages/ModulesPage"));
const FinancialPage = lazy(() => import("./pages/FinancialPage"));
const PropertyPage = lazy(() => import("./pages/PropertyPage"));
const KnowledgePage = lazy(() => import("./pages/KnowledgePage"));
const BriefingPage = lazy(() => import("./pages/BriefingPage"));

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

function PageTransition({ children }) {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.2 }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

function ProtectedPage({ element }) {
  return (
    <ProtectedRoute>
      <Suspense fallback={<LockedScreen title="loading module" />}>
        <PageTransition>{element}</PageTransition>
      </Suspense>
    </ProtectedRoute>
  );
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    accessToken,
    setAuth,
    clearAuth,
    markAuthChecked,
    touchActivity,
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

  return (
    <Routes>
      <Route path="/" element={<LandingPage onAuthenticated={handleAuthenticated} />} />
      <Route path="/login" element={<LandingPage onAuthenticated={handleAuthenticated} />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/request-access" element={<LockedScreen title="request access" />} />

      <Route path="/dashboard" element={<ProtectedPage element={<DashboardPage />} />} />
      <Route path="/auth" element={<ProtectedPage element={<AuthPage />} />} />
      <Route path="/payments" element={<ProtectedPage element={<PaymentsPage />} />} />
      <Route path="/bookings" element={<ProtectedPage element={<BookingsPage />} />} />
      <Route path="/blockchain" element={<ProtectedPage element={<BlockchainPage />} />} />
      <Route path="/notifications" element={<ProtectedPage element={<NotificationsPage />} />} />
      <Route path="/analytics" element={<ProtectedPage element={<AnalyticsPage />} />} />
      <Route path="/modules" element={<ProtectedPage element={<ModulesPage />} />} />
      <Route path="/financial" element={<ProtectedPage element={<FinancialPage />} />} />
      <Route path="/property" element={<ProtectedPage element={<PropertyPage />} />} />
      <Route path="/knowledge" element={<ProtectedPage element={<KnowledgePage />} />} />
      <Route path="/briefing" element={<ProtectedPage element={<BriefingPage />} />} />

      <Route path="/vault" element={<Navigate to="/dashboard" replace />} />
      <Route path="/chain" element={<Navigate to="/blockchain" replace />} />
      <Route path="/admin" element={<Navigate to="/auth" replace />} />

      <Route path="*" element={<Navigate to={accessToken ? "/dashboard" : "/login"} replace />} />
    </Routes>
  );
}
