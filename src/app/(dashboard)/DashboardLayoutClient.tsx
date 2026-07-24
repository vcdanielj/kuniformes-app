"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
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
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const commonRoutes = ["/", "/inventario", "/ventas", "/clientes", "/catalogo"];
    const roleRoutes = user.role === "admin"
      ? ["/compras", "/consignacion", "/configuracion", "/despachos", "/gastos"]
      : ["/despachos"];

    for (const href of [...commonRoutes, ...roleRoutes]) {
      router.prefetch(href);
    }
  }, [router, user.role]);

  // Close the mobile drawer whenever the route changes (nav click or back button).
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  // While the drawer is open: lock background scroll and allow Escape to close.
  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSidebarOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sidebarOpen]);

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
          <div className={`page-content${sidebarOpen ? " scroll-locked" : ""}`}>{children}</div>
        </main>
      </div>
    </UserProvider>
  );
}
