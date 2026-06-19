"use client";

import { useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { UserProvider, User } from "./UserContext";

export default function DashboardLayoutClient({
  children,
  user,
}: {
  children: React.ReactNode;
  user: User;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <UserProvider user={user}>
      <div className="app-layout">
        {sidebarOpen && (
          <div
            className="sidebar-overlay"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          user={user}
        />
        <main className="main-content">
          <Header onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
          <div className="page-content">{children}</div>
        </main>
      </div>
    </UserProvider>
  );
}
