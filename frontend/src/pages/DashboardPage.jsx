import { useEffect } from "react";
import api, { setAuthToken } from "../lib/api";
import socket from "../lib/socket";
import { useVaultStore } from "../store/useVaultStore";
import ActivityFeed from "../components/ActivityFeed";
import MetricCard from "../components/MetricCard";
import ModuleLauncher from "../components/ModuleLauncher";
import NotificationPanel from "../components/NotificationPanel";
import RevenueChart from "../components/RevenueChart";
import LiveTerminalCard from "../components/LiveTerminalCard";
import ServerHealthCard from "../components/ServerHealthCard";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";

export default function DashboardPage() {
  const { dashboard, setDashboard, modules, setModules, token, user } = useVaultStore();

  useEffect(() => {
    const load = async () => {
      if (token) {
        setAuthToken(token);
      }
      try {
        const [overviewRes, modulesRes] = await Promise.all([
          api.get("/dashboard/overview"),
          api.get("/modules"),
        ]);
        setDashboard(overviewRes.data.data);
        setModules(modulesRes.data.data.items || []);
      } catch {
        // Demo fallback keeps UI usable before auth or seed data is ready.
        setDashboard({
          metrics: {
            users_total: 128,
            payments_total: 342,
            bookings_total: 51,
            chain_tx_total: 812,
            events_total: 2051,
          },
          revenue_trend: [
            { date: "Mon", amount: 1200 },
            { date: "Tue", amount: 2100 },
            { date: "Wed", amount: 1850 },
            { date: "Thu", amount: 2600 },
            { date: "Fri", amount: 3100 },
          ],
          notifications: [{ id: "n1", title: "Vault online", body: "Realtime channel connected" }],
          activity: [{ id: "a1", message: "Gateway booted", created_at: new Date().toISOString() }],
        });
      }
    };
    load();

    socket.emit("dashboard:subscribe", { stream: "main" });
    socket.on("notification:new", () => load());
    socket.on("chain:transaction", () => load());

    return () => {
      socket.off("notification:new");
      socket.off("chain:transaction");
    };
  }, [token, setDashboard, setModules]);

  const metrics = dashboard?.metrics || {};

  return (
    <div className="min-h-screen bg-vault-bg p-4 text-vault-text md:p-6">
      <div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-[260px_1fr]">
        <Sidebar />
        <div className="space-y-4">
          <Topbar user={user} />
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <MetricCard label="Active Users" value={metrics.users_total ?? "--"} hint="Live operators in ecosystem" />
            <MetricCard label="Payments" value={metrics.payments_total ?? "--"} hint="Stripe + platform logs" />
            <MetricCard label="Bookings" value={metrics.bookings_total ?? "--"} hint="Scheduling layer" />
            <MetricCard label="Chain TX" value={metrics.chain_tx_total ?? "--"} hint="Blockchain rail" tone="warning" />
            <MetricCard label="Events" value={metrics.events_total ?? "--"} hint="Analytics signals" tone="danger" />
          </section>
          <RevenueChart data={dashboard?.revenue_trend || []} />
          <div className="grid gap-4 lg:grid-cols-2">
            <ServerHealthCard status="Operational" />
            <LiveTerminalCard />
          </div>
          <ModuleLauncher modules={modules} />
          <div className="grid gap-4 lg:grid-cols-2">
            <NotificationPanel items={dashboard?.notifications || []} />
            <ActivityFeed items={dashboard?.activity || []} />
          </div>
        </div>
      </div>
    </div>
  );
}
