"use client";
import React, { createContext, useContext, useEffect, useState } from "react";
import { api, getUser, setUser, setToken } from "./api";

interface AuthUser { id?: unknown; name?: string; email?: string; role?: string; requested_role?: string; status?: string; is_active?: boolean; [k: string]: unknown }

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string; user?: AuthUser | null }>;
  register: (name: string, email: string, password: string, password_confirmation: string, role?: string) => Promise<{ ok: boolean; error?: string; message?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<AuthUser | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    const u = getUser();
    setTokenState(t);
    setUserState((u as AuthUser) || null);
    if (t) {
      api.get("/user").then((res) => {
        if (res.ok) {
          const d = (res.data || {}) as Record<string, unknown>;
          const u = (d.user || d) as AuthUser;
          if (u) { setUser(u as Record<string, unknown>); setUserState(u); }
        } else {
          // token invalid/expired
          setToken(null);
          setUser(null);
          setTokenState(null);
          setUserState(null);
        }
      });
    }
    setLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.post<Record<string, unknown>>("/login", { email, password });
    if (!res.ok) {
      const data = (res.data || {}) as Record<string, unknown>;
      const msg = String(data.message || res.error || "Login failed");
      // pending / inactive detection
      return { ok: false, error: msg };
    }
    const data = (res.data || {}) as Record<string, unknown>;
    const tokenVal = (data.token || data.access_token || (data.data as Record<string, unknown>)?.token) as string | undefined;
    const userVal = (data.user || data.data) as AuthUser | undefined;
    if (tokenVal) setToken(tokenVal);
    if (userVal) setUser(userVal as Record<string, unknown>);
    setTokenState(tokenVal || null);
    setUserState(userVal || null);
    return { ok: true, user: userVal || null };
  };

  const register = async (name: string, email: string, password: string, password_confirmation: string, role: string = "staff") => {
    const res = await api.post<Record<string, unknown>>("/register", { name, email, password, password_confirmation, role });
    if (!res.ok) {
      const data = (res.data || {}) as Record<string, unknown>;
      const msg = String(data.message || res.error || "Registration failed");
      return { ok: false, error: msg, message: msg };
    }
    const data = (res.data || {}) as Record<string, unknown>;
    return { ok: true, message: String(data.message || "Your account is awaiting Admin approval.") };
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setTokenState(null);
    setUserState(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}