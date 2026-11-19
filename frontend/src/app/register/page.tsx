"use client";
import React, { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, EyeOff, Mail, Lock, User, Loader2 } from "lucide-react";

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [role, setRole] = useState<"staff" | "manager" | "admin">("staff");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; email?: string; password?: string; confirm?: string }>({});

  const validate = () => {
    const errs: typeof fieldErrors = {};
    if (!name.trim()) errs.name = "Full name is required";
    if (!email.trim()) errs.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = "Enter a valid email";
    if (!password) errs.password = "Password is required";
    else if (password.length < 8) errs.password = "Password must be at least 8 characters";
    if (!confirm) errs.confirm = "Confirm your password";
    else if (confirm !== password) errs.confirm = "Passwords do not match";
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError("");
    setSuccess("");
    if (!validate()) return;
    setLoading(true);
    const res = await register(name.trim(), email.trim(), password, confirm, role);
    setLoading(false);
    if (res.ok) {
      const msg = "Your account is awaiting Admin approval. An administrator must approve your registration before you can log in.";
      setSuccess(msg);
      toast("Registration submitted", "success");
    } else {
      setError(res.error || "Registration failed");
      toast(res.error || "Registration failed", "error");
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#F1F5F9] flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm">
        <div className="mb-2 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#EFF6FF] text-[#2563EB]">
            <User size={18} />
          </div>
          <span className="font-display text-sm font-semibold text-[#64748B]">Retail EDM</span>
        </div>
        <h1 className="font-display text-2xl font-bold text-[#0F172A]">Create Your Account</h1>
        <p className="mt-1 text-sm text-[#64748B]">Join the Retail EDM platform and manage your retail operations.</p>

        {error && <div role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}
        {success && <div role="status" className="mt-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">{success}</div>}

        <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
          <div>
            <label htmlFor="name" className="mb-1 block text-sm font-medium text-[#0F172A]">Full Name</label>
            <div className="relative">
              <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]" />
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} className={`pl-9 ${fieldErrors.name ? "border-red-400 focus:ring-red-400" : ""}`} placeholder="Jane Doe" aria-invalid={!!fieldErrors.name} />
            </div>
            {fieldErrors.name && <p className="mt-1 text-xs text-red-600">{fieldErrors.name}</p>}
          </div>
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-[#0F172A]">Email</label>
            <div className="relative">
              <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]" />
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={`pl-9 ${fieldErrors.email ? "border-red-400 focus:ring-red-400" : ""}`} placeholder="you@retail.test" aria-invalid={!!fieldErrors.email} />
            </div>
            {fieldErrors.email && <p className="mt-1 text-xs text-red-600">{fieldErrors.email}</p>}
          </div>
          <div>
            <label htmlFor="role" className="mb-1 block text-sm font-medium text-[#0F172A]">Account Role</label>
            <select
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value as "staff" | "manager" | "admin")}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="staff">Sales Staff (Requires Admin Approval)</option>
              <option value="manager">Store Manager (Requires Admin Approval)</option>
              <option value="admin">Administrator (Requires Admin Approval)</option>
            </select>
            <p className="mt-1.5 text-xs text-amber-700 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
              Registration requests for Staff, Manager, and Admin accounts are submitted in <strong>pending</strong> status. You cannot log in until an Administrator approves your request.
            </p>
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-[#0F172A]">Password</label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]" />
              <Input id="password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} className={`pl-9 pr-10 ${fieldErrors.password ? "border-red-400 focus:ring-red-400" : ""}`} placeholder="••••••••" aria-invalid={!!fieldErrors.password} />
              <button type="button" onClick={() => setShowPassword((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B]" aria-label="Toggle password visibility">
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <p className="mt-1 text-xs text-[#64748B]">At least 8 characters.</p>
            {fieldErrors.password && <p className="mt-1 text-xs text-red-600">{fieldErrors.password}</p>}
          </div>
          <div>
            <label htmlFor="confirm" className="mb-1 block text-sm font-medium text-[#0F172A]">Confirm Password</label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]" />
              <Input id="confirm" type={showConfirm ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)} className={`pl-9 pr-10 ${fieldErrors.confirm ? "border-red-400 focus:ring-red-400" : ""}`} placeholder="••••••••" aria-invalid={!!fieldErrors.confirm} />
              <button type="button" onClick={() => setShowConfirm((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B]" aria-label="Toggle password visibility">
                {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {fieldErrors.confirm && <p className="mt-1 text-xs text-red-600">{fieldErrors.confirm}</p>}
          </div>

          <Button type="submit" className="w-full bg-[#2563EB] hover:bg-[#1d4ed8] disabled:opacity-60" disabled={loading}>
            {loading ? <><Loader2 size={16} className="animate-spin" /> Submitting...</> : "Create Account"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-[#64748B]">
          Already have an account?{" "}
          <a href="/login" className="font-medium text-[#2563EB] hover:underline">Sign In</a>
        </p>
        <p className="mt-4 text-center text-xs text-[#64748B]">Retail EDM Integration Platform</p>
      </div>
    </div>
  );
}