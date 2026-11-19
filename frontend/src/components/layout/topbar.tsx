"use client";

import React, { useState, useRef, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { LogOut, User, ShieldCheck } from "lucide-react";
import { NotificationBell } from "./notification-bell";

export function Topbar() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const roleName = String(user?.role || "Staff").toUpperCase();

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between border-b border-slate-200 bg-white/95 backdrop-blur-xs px-4 py-2.5 shadow-xs">
      <div className="font-display text-lg font-bold text-slate-900 md:hidden flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white font-bold text-xs">
          EDM
        </span>
        Retail EDM
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-3">
        {/* Active role badge */}
        <div className="hidden sm:flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
          <ShieldCheck className="h-3.5 w-3.5 text-blue-600" />
          <span>Role: <strong className="text-slate-900">{roleName}</strong></span>
        </div>

        {/* Real MySQL Notification Bell */}
        <NotificationBell />

        {/* User Menu */}
        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setOpen(!open)}
            className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-slate-100 transition-colors"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-700 font-semibold text-xs ring-2 ring-blue-50">
              {user?.name ? user.name.slice(0, 2).toUpperCase() : <User size={15} />}
            </div>
            <div className="hidden text-left md:block">
              <p className="text-xs font-semibold text-slate-800 leading-tight">
                {String(user?.name || user?.email || "User")}
              </p>
              <p className="text-[10px] text-slate-500 capitalize leading-tight">
                {String(user?.role || "staff")}
              </p>
            </div>
          </button>

          {open && (
            <div className="absolute right-0 mt-2 w-48 rounded-xl border border-slate-200 bg-white shadow-xl py-1 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="border-b border-slate-100 px-3 py-2">
                <p className="text-xs font-bold text-slate-900 truncate">{String(user?.name || "User")}</p>
                <p className="text-[11px] text-slate-500 truncate">{String(user?.email || "")}</p>
              </div>
              <button
                onClick={() => {
                  logout();
                  router.push("/login");
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 transition-colors"
              >
                <LogOut size={14} /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
