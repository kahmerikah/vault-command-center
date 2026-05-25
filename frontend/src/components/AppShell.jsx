import { useEffect, useState } from "react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import ContinuityBar from "./ContinuityBar";
import CommandPalette from "./CommandPalette";
import SettingsModal from "./SettingsModal";
import { useOperationalStore } from "../store/useOperationalStore";

export default function AppShell({ user, onLogout, title, children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { toggleCommand, openSettings, settingsOpen, closeSettings } = useOperationalStore();

  // Global Cmd+K / Ctrl+K hotkey
  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        toggleCommand();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleCommand]);

  return (
    <div className="min-h-screen bg-vault-bg p-4 text-vault-text md:p-6">
      <div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-[260px_1fr]">
        <div className={`${sidebarOpen ? "block" : "hidden"} lg:block`}>
          <Sidebar onNavigate={() => setSidebarOpen(false)} />
        </div>
        <div className="space-y-3">
          <Topbar
            user={user}
            onLogout={onLogout}
            title={title}
            onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
            onOpenSettings={openSettings}
          />
          <ContinuityBar />
          {children}
        </div>
      </div>
      <SettingsModal open={settingsOpen} onClose={closeSettings} />
      <CommandPalette />
    </div>
  );
}

