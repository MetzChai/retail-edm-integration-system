"use client";
import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, EyeOff, Mail, Lock, Package, Warehouse, Users, Store, Loader2 } from "lucide-react";

export default function LoginPage() {
  const { login, user, token } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});

  useEffect(() => {
    if (token && user) {
      const role = String(user.role || "").toLowerCase();
      if (role === "customer") {
        router.replace("/storefront");
      } else {
        router.replace("/");
      }
    }
  }, [token, user, router]);

  // remember email
  useEffect(() => {
    const saved = localStorage.getItem("remember_email");
    if (saved) { setEmail(saved); setRemember(true); }
  }, []);

  const validate = () => {
    const errs: { email?: string; password?: string } = {};
    if (!email.trim()) errs.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = "Enter a valid email";
    if (!password) errs.password = "Password is required";
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError("");
    if (!validate()) return;
    setLoading(true);
    if (remember) localStorage.setItem("remember_email", email.trim());
    else localStorage.removeItem("remember_email");
    const res = await login(email.trim(), password);
    setLoading(false);
    if (res.ok) {
      toast("Welcome back", "success");
      const role = String(res.user?.role || "").toLowerCase();
      if (role === "customer") {
        router.replace("/storefront");
      } else {
        router.replace("/");
      }
    } else {
      const msg = res.error || "Login failed";
      setError(msg);
      toast(msg, "error");
    }
  };

  const miniCards = [
    { icon: Package, label: "POS" },
    { icon: Warehouse, label: "Inventory" },
    { icon: Users, label: "CRM" },
    { icon: Store, label: "Online Storefront" },
  ];

  return (
    <div className="min-h-screen w-full bg-[#F1F5F9]">
      <div className="grid min-h-screen grid-cols-1 md:grid-cols-2">
        {/* Left branding panel */}
        <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-[#0F172A] via-[#1e3a8a] to-[#2563EB] p-10 text-white md:flex">
          <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 20% 20%, white 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
          <div className="relative z-10 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
              <Package size={22} />
            </div>
            <span className="font-display text-xl font-bold tracking-tight">Retail EDM</span>
          </div>
          <div className="relative z-10 space-y-6">
            <h1 className="font-display text-4xl font-bold leading-tight">One Platform. Connected Retail.</h1>
            <p className="max-w-md text-base text-blue-100">
              Unify your retail operations, manage business data, and transform information into actionable insights.
            </p>
            {/* abstract integration visual */}
            <div className="relative h-32 max-w-md">
              <div className="absolute left-0 top-8 h-16 w-16 rounded-2xl bg-white/10 backdrop-blur" />
              <div className="absolute left-24 top-2 h-20 w-20 rounded-2xl bg-white/15 backdrop-blur" />
              <div className="absolute left-52 top-10 h-14 w-14 rounded-2xl bg-white/20 backdrop-blur" />
              <div className="absolute left-8 top-0 h-px w-48 bg-gradient-to-r from-white/40 to-transparent" />
              <div className="absolute left-16 top-24 h-px w-40 bg-gradient-to-r from-white/30 to-transparent" />
            </div>
            <div className="grid grid-cols-2 gap-3 max-w-md">
              {miniCards.map((c) => {
                const Icon = c.icon;
                return (
                  <div key={c.label} className="flex items-center gap-3 rounded-xl bg-white/10 p-3 backdrop-blur transition hover:bg-white/15">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/20">
                      <Icon size={18} />
                    </div>
                    <span className="text-sm font-medium">{c.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="relative z-10 text-xs text-blue-200">© Retail EDM Integration</div>
        </div>

        {/* Right form panel */}
        <div className="flex items-center justify-center p-6 md:p-10">
          <div className="w-full max-w-md">
            <div className="mb-6 text-center md:hidden">
              <h1 className="font-display text-2xl font-bold text-[#2563EB]">Retail EDM</h1>
              <p className="text-sm text-[#64748B]">One Platform. Connected Retail.</p>
            </div>
            <div className="rounded-2xl bg-white p-8 shadow-sm">
              <h2 className="font-display text-2xl font-bold text-[#0F172A]">Welcome Back</h2>
              <p className="mt-1 text-sm text-[#64748B]">Sign in to your Retail EDM workspace.</p>

              {error && (
                <div role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
              )}

              <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
                <div>
                  <label htmlFor="email" className="mb-1 block text-sm font-medium text-[#0F172A]">Email</label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]" />
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={`pl-9 ${fieldErrors.email ? "border-red-400 focus:ring-red-400" : ""}`}
                      placeholder="you@retail.test"
                      aria-invalid={!!fieldErrors.email}
                    />
                  </div>
                  {fieldErrors.email && <p className="mt-1 text-xs text-red-600">{fieldErrors.email}</p>}
                </div>
                <div>
                  <label htmlFor="password" className="mb-1 block text-sm font-medium text-[#0F172A]">Password</label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]" />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={`pl-9 pr-10 ${fieldErrors.password ? "border-red-400 focus:ring-red-400" : ""}`}
                      placeholder="••••••••"
                      aria-invalid={!!fieldErrors.password}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#0F172A]"
                      aria-label="Toggle password visibility"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {fieldErrors.password && <p className="mt-1 text-xs text-red-600">{fieldErrors.password}</p>}
                </div>

                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm text-[#64748B]">
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={(e) => setRemember(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-[#2563EB] focus:ring-[#2563EB]"
                    />
                    Remember Me
                  </label>
                </div>

                <Button
                  type="submit"
                  className="w-full bg-[#2563EB] hover:bg-[#1d4ed8] disabled:opacity-60"
                  disabled={loading}
                >
                  {loading ? <><Loader2 size={16} className="animate-spin" /> Signing in...</> : "Sign In"}
                </Button>
              </form>

              <p className="mt-6 text-center text-sm text-[#64748B]">
                Don't have an account?{" "}
                <a href="/register" className="font-medium text-[#2563EB] hover:underline">
                  Create Account
                </a>
              </p>

              {/* Public Storefront Link for Shoppers */}
              <div className="mt-5 pt-4 border-t border-slate-200 text-center">
                <p className="text-xs text-slate-500 mb-2">Looking for the customer online shop?</p>
                <a
                  href="/storefront"
                  className="inline-flex items-center justify-center gap-1.5 w-full rounded-lg border border-blue-200 bg-blue-50 px-3.5 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-colors shadow-2xs"
                >
                  <Store size={15} />
                  Browse Storefront & Order as Guest (No Login Needed) →
                </a>
              </div>
            </div>
            <p className="mt-6 text-center text-xs text-[#64748B]">Retail EDM Integration Platform</p>
          </div>
        </div>
      </div>
    </div>
  );
}