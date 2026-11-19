"use client";
import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter, usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, token, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const publicRoutes = ["/login", "/register", "/storefront"];
  const isPublicRoute = publicRoutes.includes(pathname);

  // RBAC route restrictions
  const adminOnlyRoutes = ["/users", "/governance", "/audit-logs"];
  const isAdminOnly = adminOnlyRoutes.includes(pathname);
  const isCustomer = user && String(user.role).toLowerCase() === "customer";
  const isStaffOrManager = user && ["staff", "manager"].includes(String(user.role).toLowerCase());

  useEffect(() => {
    if (loading) return;
    if (!token && !isPublicRoute) {
      router.replace("/login");
      return;
    }

    // Customers must never receive access to Admin, Manager, or Staff dashboards
    if (token && isCustomer && pathname !== "/storefront") {
      router.replace("/storefront");
      return;
    }

    // Staff and Manager cannot access Admin-only user management or governance pages
    if (token && isStaffOrManager && isAdminOnly) {
      router.replace("/");
    }
  }, [loading, token, pathname, router, isPublicRoute, isCustomer, isStaffOrManager, isAdminOnly]);

  if (isPublicRoute && !token) {
    return <>{children}</>;
  }

  // Avoid blocking the route segment from rendering during hydration/auth checks.
  // Render the shell and children; redirect is handled in the effect above.
  return (
    <div className="flex min-h-screen">
      {token && <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />}
      <div className="flex flex-1 flex-col">
        {token && <Topbar />}
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}