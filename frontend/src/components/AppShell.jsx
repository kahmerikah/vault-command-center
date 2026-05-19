import { useState } from "react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

export default function AppShell({ user, onLogout, title, children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-vault-bg p-4 text-vault-text md:p-6">
      <div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-[260px_1fr]">
        <div className={`${sidebarOpen ? "block" : "hidden"} lg:block`}>
          <Sidebar onNavigate={() => setSidebarOpen(false)} />
        </div>
        <div className="space-y-4">
          <Topbar
            user={user}
            onLogout={onLogout}
            title={title}
            onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
          />
          {children}
        </div>
      </div>
    </div>
  );
}
