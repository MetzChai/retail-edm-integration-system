"use client";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { normalizeList } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  KeyRound,
  Users,
  CheckCircle2,
  Save,
  HelpCircle,
  Lock,
} from "lucide-react";
import Link from "next/link";
import { UserManagement } from "@/components/user-management";

interface RoleItem {
  id: number;
  name: string;
  label: string;
  description: string;
  users_count?: number;
  permissions: Array<{ id: number; name: string; label: string; group?: string }>;
}

interface PermissionItem {
  id: number;
  name: string;
  label: string;
  group: string;
}

export default function GovernancePage() {
  const { user } = useAuth();
  const isAdmin = String(user?.role || "").toLowerCase() === "admin";
  const { toast } = useToast();

  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [permissions, setPermissions] = useState<PermissionItem[]>([]);
  const [selectedRole, setSelectedRole] = useState<RoleItem | null>(null);
  const [rolePermissions, setRolePermissions] = useState<string[]>([]);
  const [savingRole, setSavingRole] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"users" | "roles" | "permissions">("roles");

  const load = async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const [r, p] = await Promise.all([
        api.get<{ roles: RoleItem[] }>("/roles"),
        api.get<{ permissions: PermissionItem[] }>("/permissions"),
      ]);

      if (r.ok && r.data) {
        const rawRoles = (r.data.roles || normalizeList(r.data).items) as RoleItem[];
        setRoles(rawRoles);
        if (rawRoles.length > 0 && !selectedRole) {
          const defaultRole = rawRoles.find((ro) => ro.name === "manager") || rawRoles[0];
          setSelectedRole(defaultRole);
          setRolePermissions(defaultRole.permissions.map((p) => p.name));
        } else if (selectedRole) {
          const fresh = rawRoles.find((ro) => ro.id === selectedRole.id);
          if (fresh) {
            setSelectedRole(fresh);
            setRolePermissions(fresh.permissions.map((p) => p.name));
          }
        }
      }

      if (p.ok && p.data) {
        const rawPerms = (p.data.permissions || normalizeList(p.data).items) as PermissionItem[];
        setPermissions(rawPerms);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [isAdmin]);

  const handleSelectRole = (r: RoleItem) => {
    setSelectedRole(r);
    setRolePermissions(r.permissions.map((p) => p.name));
  };

  const handleTogglePermission = (permName: string) => {
    if (selectedRole?.name === "admin" && permName === "governance.manage") {
      toast("Admin role must retain governance management.", "error");
      return;
    }

    setRolePermissions((prev) =>
      prev.includes(permName) ? prev.filter((p) => p !== permName) : [...prev, permName]
    );
  };

  const handleSavePermissions = async () => {
    if (!selectedRole) return;
    setSavingRole(true);
    try {
      const res = await api.put<{ message: string; role: RoleItem }>(
        `/roles/${selectedRole.id}/permissions`,
        { permissions: rolePermissions }
      );

      if (res.ok) {
        toast(res.data?.message || "Role permissions saved to database.", "success");
        await load();
      } else {
        toast(res.error || "Failed to update role permissions.", "error");
      }
    } catch {
      toast("An error occurred while saving permissions.", "error");
    } finally {
      setSavingRole(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="max-w-lg mx-auto py-12">
        <Card className="border-rose-200 bg-rose-50/50 shadow-xs">
          <CardContent className="pt-6 text-center">
            <ShieldAlert className="mx-auto text-rose-600 mb-3" size={44} />
            <h2 className="text-lg font-bold text-slate-900">Access Restricted (Admin Only)</h2>
            <p className="text-sm text-slate-600 mt-1">
              Governance, role configurations, and permission assignments can only be accessed by Administrator accounts.
            </p>
            <div className="mt-4">
              <Link href="/">
                <Button variant="outline" className="text-sm">
                  Return to Dashboard
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Group permissions by category
  const permissionGroups: Record<string, PermissionItem[]> = {};
  permissions.forEach((p) => {
    const grp = p.group || "general";
    if (!permissionGroups[grp]) permissionGroups[grp] = [];
    permissionGroups[grp].push(p);
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-bold text-slate-900">Governance & RBAC Management</h1>
            <Badge variant="info">Admin Control Plane</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage business roles, assign granular permissions, and enforce real-time database access controls.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="cursor-pointer">
          <RefreshCw size={13} className={`mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {/* Role vs Permission UI Concept Callout Banner */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 shadow-2xs">
          <div className="flex items-center gap-2 text-blue-900 font-bold text-sm">
            <ShieldCheck className="h-4 w-4 text-blue-700" />
            <span>ROLE — Defines User Position</span>
          </div>
          <p className="mt-1.5 text-xs text-blue-800 leading-relaxed">
            A <strong>Role</strong> defines the user's formal job position in the business organization (e.g. <em>Administrator</em>, <em>Store Manager</em>, or <em>Sales Staff</em>). Roles group responsibilities and determine general operational scope.
          </p>
        </div>

        <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-4 shadow-2xs">
          <div className="flex items-center gap-2 text-indigo-900 font-bold text-sm">
            <KeyRound className="h-4 w-4 text-indigo-700" />
            <span>PERMISSION — Defines Authorized Actions</span>
          </div>
          <p className="mt-1.5 text-xs text-indigo-800 leading-relaxed">
            A <strong>Permission</strong> defines a specific, granular action a user is authorized to perform (e.g. <code>products.manage</code>, <code>inventory.manage</code>, <code>reports.view</code>). Enforced strictly via Laravel Sanctum middleware.
          </p>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setTab("roles")}
          className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold transition-colors cursor-pointer ${
            tab === "roles"
              ? "bg-blue-600 text-white shadow-xs"
              : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
          }`}
        >
          <KeyRound size={14} /> Role Permissions Matrix
        </button>

        <button
          onClick={() => setTab("users")}
          className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold transition-colors cursor-pointer ${
            tab === "users"
              ? "bg-blue-600 text-white shadow-xs"
              : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
          }`}
        >
          <Users size={14} /> User Approvals & Role Changes
        </button>

        <button
          onClick={() => setTab("permissions")}
          className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold transition-colors cursor-pointer ${
            tab === "permissions"
              ? "bg-blue-600 text-white shadow-xs"
              : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
          }`}
        >
          <Lock size={14} /> Permission Catalogue
        </button>
      </div>

      {/* Tab: Users */}
      {tab === "users" && <UserManagement />}

      {/* Tab: Role Permissions Matrix */}
      {tab === "roles" && (
        <div className="space-y-6">
          {/* Role selector cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {roles.map((r) => {
              const isSelected = selectedRole?.id === r.id;
              return (
                <div
                  key={r.id}
                  onClick={() => handleSelectRole(r)}
                  className={`cursor-pointer rounded-xl border p-4 transition-all ${
                    isSelected
                      ? "border-blue-600 bg-blue-50/40 shadow-sm ring-2 ring-blue-500/20"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-slate-900 capitalize">{r.label || r.name}</span>
                    <Badge variant={r.name === "admin" ? "info" : r.name === "manager" ? "success" : "muted"}>
                      {r.name.toUpperCase()}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-slate-500 line-clamp-2">{r.description}</p>
                  <div className="mt-3 flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                    <span className="text-slate-500">Active Permissions:</span>
                    <strong className="text-slate-800">{r.permissions?.length ?? 0} granted</strong>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Interactive Permission Editor for Selected Role */}
          {selectedRole && (
            <Card className="shadow-2xs">
              <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base font-bold text-slate-900">
                      Configure Permissions for {selectedRole.label}
                    </CardTitle>
                    <Badge variant="muted">{rolePermissions.length} Active</Badge>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Modifications are saved immediately to MySQL and enforced across all active sessions.
                  </p>
                </div>
                <Button
                  onClick={handleSavePermissions}
                  disabled={savingRole}
                  className="bg-blue-600 hover:bg-blue-700 text-white shadow-xs cursor-pointer"
                >
                  <Save size={14} className={`mr-1.5 ${savingRole ? "animate-spin" : ""}`} />
                  {savingRole ? "Saving to MySQL..." : "Save Role Permissions"}
                </Button>
              </CardHeader>
              <CardContent className="pt-4 space-y-6">
                {Object.entries(permissionGroups).map(([groupName, groupPerms]) => (
                  <div key={groupName} className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
                    <div className="flex items-center justify-between border-b border-slate-200/80 pb-2 mb-3">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                        <KeyRound className="h-3.5 w-3.5 text-blue-600" />
                        {groupName} Module Permissions
                      </h4>
                      <span className="text-[11px] text-slate-400">
                        {groupPerms.filter((p) => rolePermissions.includes(p.name)).length} of {groupPerms.length} granted
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {groupPerms.map((perm) => {
                        const isChecked = rolePermissions.includes(perm.name);
                        return (
                          <label
                            key={perm.id}
                            className={`flex items-start gap-2.5 rounded-lg border p-2.5 text-xs transition-colors cursor-pointer select-none ${
                              isChecked
                                ? "border-blue-300 bg-blue-50/70 text-blue-950 font-medium"
                                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleTogglePermission(perm.name)}
                              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                            <div className="min-w-0">
                              <span className="block font-semibold text-slate-800">{perm.label || perm.name}</span>
                              <code className="text-[10px] text-slate-500 font-mono">{perm.name}</code>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Tab: Permissions Catalogue */}
      {tab === "permissions" && (
        <Card className="shadow-2xs">
          <CardHeader className="pb-3 border-b border-slate-100">
            <CardTitle className="text-base font-bold text-slate-900">All System Permissions</CardTitle>
            <p className="text-xs text-slate-500">Master database registry of all 14 backend permission handles.</p>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400">
                    <th className="py-2.5 font-medium">Permission Handle</th>
                    <th className="py-2.5 font-medium">Group</th>
                    <th className="py-2.5 font-medium">Display Label</th>
                    <th className="py-2.5 font-medium">Role Assignments</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {permissions.map((p) => {
                    const assignedRoles = roles.filter((r) =>
                      r.permissions.some((rp) => rp.name === p.name)
                    );
                    return (
                      <tr key={p.id} className="hover:bg-slate-50/60">
                        <td className="py-2.5 font-mono text-blue-700 font-semibold">{p.name}</td>
                        <td className="py-2.5">
                          <Badge variant="muted">{p.group}</Badge>
                        </td>
                        <td className="py-2.5 font-medium text-slate-800">{p.label}</td>
                        <td className="py-2.5">
                          <div className="flex gap-1 flex-wrap">
                            {assignedRoles.map((r) => (
                              <Badge key={r.id} variant={r.name === "admin" ? "info" : r.name === "manager" ? "success" : "muted"}>
                                {r.label}
                              </Badge>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
