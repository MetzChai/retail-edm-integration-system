"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  LayoutDashboard,
  Package,
  Warehouse,
  ShoppingCart,
  Users,
  Store,
  Database,
  ShieldCheck,
  BarChart3,
  ScrollText,
  UserCog,
  ChevronLeft,
  ChevronRight,
  KeyRound,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  roles: string[];
  category: "operations" | "catalog" | "intelligence" | "admin";
}

const allNav: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "manager", "staff"], category: "operations" },
  { href: "/pos", label: "Point of Sale", icon: ShoppingCart, roles: ["admin", "manager", "staff"], category: "operations" },
  { href: "/storefront", label: "Storefront & Orders", icon: Store, roles: ["admin", "manager", "staff", "customer"], category: "operations" },

  { href: "/products", label: "Product Catalogue", icon: Package, roles: ["admin", "manager", "staff"], category: "catalog" },
  { href: "/inventory", label: "Warehouse Inventory", icon: Warehouse, roles: ["admin", "manager", "staff"], category: "catalog" },
  { href: "/customers", label: "Customers CRM", icon: Users, roles: ["admin", "manager", "staff"], category: "catalog" },

  { href: "/integration", label: "Data Integration (ETL)", icon: Database, roles: ["admin", "manager"], category: "intelligence" },
  { href: "/data-quality", label: "Data Quality Audit", icon: ShieldCheck, roles: ["admin", "manager"], category: "intelligence" },
  { href: "/reports", label: "Business Reports", icon: BarChart3, roles: ["admin", "manager", "staff"], category: "intelligence" },

  { href: "/users", label: "User Management", icon: UserCog, roles: ["admin"], category: "admin" },
  { href: "/governance", label: "Governance & RBAC", icon: KeyRound, roles: ["admin"], category: "admin" },
  { href: "/audit-logs", label: "System Audit Logs", icon: ScrollText, roles: ["admin"], category: "admin" },
];

export function Sidebar({
  collapsed,
  setCollapsed,
}: {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
}) {
  const pathname = usePathname();
  const { user } = useAuth();
  const role = String(user?.role || "staff").toLowerCase();

  const visibleNav = allNav.filter((item) => item.roles.includes(role));

  const categories = [
    { key: "operations", title: "Core Operations" },
    { key: "catalog", title: "Catalog & Supply" },
    { key: "intelligence", title: "Data & Analytics" },
    { key: "admin", title: "Administration" },
  ] as const;

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col border-r border-slate-200 bg-white transition-all duration-200 select-none shadow-xs",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Brand Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100 bg-slate-50/50">
        {!collapsed && (
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0F172A] text-white font-black text-xs shadow-xs">
              EDM
            </div>
            <div className="flex flex-col">
              <span className="font-display font-extrabold text-sm text-[#0F172A] leading-tight tracking-tight">
                Retail EDM
              </span>
              <span className="text-[10px] font-semibold text-blue-600 capitalize leading-tight">
                {role} Console
              </span>
            </div>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors cursor-pointer"
          title={collapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Navigation Sections */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        {categories.map((cat) => {
          const items = visibleNav.filter((n) => n.category === cat.key);
          if (items.length === 0) return null;

          return (
            <div key={cat.key} className="space-y-1">
              {!collapsed && (
                <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {cat.title}
                </div>
              )}
              {items.map((item) => {
                const active = pathname === item.href;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all",
                      active
                        ? "bg-blue-600 text-white shadow-xs"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    )}
                  >
                    <Icon size={16} className={cn("shrink-0", active ? "text-white" : "text-slate-500")} />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* Footer System Status */}
      {!collapsed && (
        <div className="border-t border-slate-100 p-3 bg-slate-50/60 text-[11px] text-slate-500 flex items-center justify-between">
          <span className="flex items-center gap-1.5 font-medium text-slate-600">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            MySQL Online
          </span>
          <span className="text-[10px] font-mono text-slate-400">v2.4 Enterprise</span>
        </div>
      )}
    </aside>
  );
}
