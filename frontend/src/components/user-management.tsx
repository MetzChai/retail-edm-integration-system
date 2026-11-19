"use client";
import React, { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { normalizeList } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Users, UserCheck, UserX, Clock, ShieldAlert,
  Search, RefreshCw, Power, CheckCircle2, XCircle
} from "lucide-react";

type UserRecord = {
  id: number;
  name: string;
  email: string;
  role?: string | { id: number; name: string; label: string };
  role_id?: number;
  requested_role?: string;
  status: "pending" | "active" | "inactive" | "rejected";
  is_active: boolean;
  created_at: string;
};

export function UserManagement({ embedded = false }: { embedded?: boolean }) {
  const { toast } = useToast();
  const [tab, setTab] = useState<"pending" | "all">("pending");
  const [allUsers, setAllUsers] = useState<UserRecord[]>([]);
  const [pendingUsers, setPendingUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [allRes, pendingRes] = await Promise.all([
        api.get<unknown>("/users?per_page=100"),
        api.get<unknown>("/users/pending"),
      ]);

      if (allRes.ok) {
        const list = normalizeList(allRes.data).items as UserRecord[];
        setAllUsers(list);
      }
      if (pendingRes.ok) {
        const pendingList = normalizeList(pendingRes.data).items as UserRecord[];
        setPendingUsers(pendingList);
      }
      if (allRes.offline) {
        toast("API offline or server unreachable", "error");
      }
    } catch {
      toast("Failed to load user management data", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const getRoleName = (u: UserRecord): string => {
    if (typeof u.role === "string") return u.role.toLowerCase();
    if (u.role && typeof u.role === "object" && "name" in u.role) return String(u.role.name).toLowerCase();
    if (u.requested_role) return u.requested_role.toLowerCase();
    return "staff";
  };

  const handleApprove = async (user: UserRecord, role: "staff" | "manager" | "admin") => {
    setActionLoading(user.id);
    const res = await api.post<{ message?: string }>(`/users/${user.id}/approve`, { role });
    setActionLoading(null);
    if (res.ok) {
      const roleTitle = role === "admin" ? "Administrator" : role === "manager" ? "Store Manager" : "Sales Staff";
      toast(`Approved ${user.name} as ${roleTitle}`, "success");
      loadData();
    } else {
      toast(res.error || "Approval failed", "error");
    }
  };

  const handleReject = async (user: UserRecord) => {
    if (!confirm(`Are you sure you want to reject the registration request for ${user.name}?`)) {
      return;
    }
    setActionLoading(user.id);
    const res = await api.post<{ message?: string }>(`/users/${user.id}/reject`);
    setActionLoading(null);
    if (res.ok) {
      toast(`Registration request for ${user.name} rejected`, "success");
      loadData();
    } else {
      toast(res.error || "Rejection failed", "error");
    }
  };

  const handleChangeRole = async (user: UserRecord, newRole: "staff" | "manager" | "admin") => {
    setActionLoading(user.id);
    const res = await api.post<{ message?: string }>(`/users/${user.id}/role`, { role: newRole });
    setActionLoading(null);
    if (res.ok) {
      const roleTitle = newRole === "admin" ? "Administrator" : newRole === "manager" ? "Store Manager" : "Sales Staff";
      toast(`Updated ${user.name}'s role to ${roleTitle}`, "success");
      loadData();
    } else {
      toast(res.error || "Failed to update role", "error");
    }
  };

  const handleToggleActive = async (user: UserRecord) => {
    setActionLoading(user.id);
    const endpoint = user.is_active ? `/users/${user.id}/deactivate` : `/users/${user.id}/activate`;
    const res = await api.post<{ message?: string }>(endpoint);
    setActionLoading(null);
    if (res.ok) {
      const stateStr = user.is_active ? "deactivated" : "activated";
      toast(`Account ${stateStr} successfully`, "success");
      loadData();
    } else {
      toast(res.error || "Failed to update account state", "error");
    }
  };

  const filteredUsers = allUsers.filter((u) => {
    const roleName = getRoleName(u);
    const matchesSearch =
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase());
    const matchesRole = roleFilter === "all" || roleName === roleFilter;
    const matchesStatus = statusFilter === "all" || u.status === statusFilter;
    return matchesSearch && matchesRole && matchesStatus;
  });

  const renderStatusBadge = (status: string, isActive: boolean) => {
    switch (status) {
      case "active":
        return <Badge variant="success">Active</Badge>;
      case "pending":
        return <Badge variant="warning">Pending Approval</Badge>;
      case "rejected":
        return <Badge variant="danger">Rejected</Badge>;
      case "inactive":
        return <Badge variant="muted">Inactive</Badge>;
      default:
        return <Badge variant={isActive ? "success" : "muted"}>{status}</Badge>;
    }
  };

  const renderRoleBadge = (roleName: string) => {
    switch (roleName) {
      case "admin":
        return <span className="inline-flex items-center rounded-md bg-purple-50 px-2 py-0.5 text-xs font-semibold text-purple-700 border border-purple-200">Administrator</span>;
      case "manager":
        return <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 border border-blue-200">Store Manager</span>;
      case "staff":
        return <span className="inline-flex items-center rounded-md bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700 border border-slate-200">Sales Staff</span>;
      default:
        return <span className="inline-flex items-center rounded-md bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-700">{roleName}</span>;
    }
  };

  const formatDate = (isoString?: string) => {
    if (!isoString) return "-";
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return isoString;
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Users className="text-blue-600" size={22} />
            User Management & Role Approvals
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Admin oversight: approve Staff and Manager requests, assign roles, and manage account statuses.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
          <RefreshCw size={13} className={loading ? "animate-spin mr-1" : "mr-1"} /> Refresh
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-2">
        <button
          onClick={() => setTab("pending")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === "pending"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          <Clock size={16} />
          Pending Registration Requests
          {pendingUsers.length > 0 && (
            <span className="ml-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
              {pendingUsers.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab("all")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === "all"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          <Users size={16} />
          All Registered Users
          <span className="ml-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
            {allUsers.length}
          </span>
        </button>
      </div>

      {/* Tab 1: Pending Registrations */}
      {tab === "pending" && (
        <Card className="border border-slate-200 shadow-sm">
          <CardHeader className="bg-slate-50/70 border-b border-slate-100 py-3.5 px-4 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold text-slate-800">
                Staff & Manager Registration Requests
              </CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                New accounts are placed in pending status and cannot log in until approved.
              </p>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 text-center text-sm text-slate-500">Loading pending requests...</div>
            ) : pendingUsers.length === 0 ? (
              <div className="p-8 text-center">
                <CheckCircle2 className="mx-auto text-emerald-500 mb-2" size={32} />
                <p className="text-sm font-medium text-slate-700">No pending registration requests</p>
                <p className="text-xs text-slate-500 mt-1">All Staff and Manager registration requests have been processed.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      <th className="px-4 py-3">Applicant Name</th>
                      <th className="px-4 py-3">Email Address</th>
                      <th className="px-4 py-3">Requested Role</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Registration Date</th>
                      <th className="px-4 py-3 text-right">Approval Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pendingUsers.map((u) => {
                      const reqRole = (u.requested_role || getRoleName(u) || "staff").toLowerCase();
                      const isPendingAction = actionLoading === u.id;
                      return (
                        <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-4 py-3.5 font-medium text-slate-900">{u.name}</td>
                          <td className="px-4 py-3.5 text-slate-600">{u.email}</td>
                          <td className="px-4 py-3.5">
                            <span className="capitalize font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-xs">
                              {reqRole === "admin" ? "Administrator" : reqRole === "manager" ? "Store Manager" : "Sales Staff"}
                            </span>
                          </td>
                          <td className="px-4 py-3.5">
                            {renderStatusBadge(u.status, u.is_active)}
                          </td>
                          <td className="px-4 py-3.5 text-xs text-slate-500 whitespace-nowrap">
                            {formatDate(u.created_at)}
                          </td>
                          <td className="px-4 py-3.5 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-xs bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200"
                                disabled={isPendingAction}
                                onClick={() => handleApprove(u, "staff")}
                              >
                                <UserCheck size={13} className="mr-1" />
                                Approve Staff
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200"
                                disabled={isPendingAction}
                                onClick={() => handleApprove(u, "manager")}
                              >
                                <UserCheck size={13} className="mr-1" />
                                Approve Manager
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-xs bg-purple-50 text-purple-700 hover:bg-purple-100 border-purple-200"
                                disabled={isPendingAction}
                                onClick={() => handleApprove(u, "admin")}
                              >
                                <UserCheck size={13} className="mr-1" />
                                Approve Admin
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-xs bg-red-50 text-red-700 hover:bg-red-100 border-red-200"
                                disabled={isPendingAction}
                                onClick={() => handleReject(u)}
                              >
                                <XCircle size={13} className="mr-1" />
                                Reject
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tab 2: All Registered Users */}
      {tab === "all" && (
        <Card className="border border-slate-200 shadow-sm">
          <CardHeader className="bg-slate-50/70 border-b border-slate-100 py-3.5 px-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base font-semibold text-slate-800">
                  All System Accounts
                </CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">
                  Change roles between Staff and Manager, activate, or deactivate accounts.
                </p>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-48">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    placeholder="Search user..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-8 text-xs pl-8"
                  />
                </div>
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700"
                >
                  <option value="all">All Roles</option>
                  <option value="admin">Admin</option>
                  <option value="manager">Manager</option>
                  <option value="staff">Staff</option>
                </select>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700"
                >
                  <option value="all">All Statuses</option>
                  <option value="active">Active</option>
                  <option value="pending">Pending</option>
                  <option value="inactive">Inactive</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 text-center text-sm text-slate-500">Loading registered users...</div>
            ) : filteredUsers.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">No users match the search filters.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      <th className="px-4 py-3">User Name</th>
                      <th className="px-4 py-3">Email Address</th>
                      <th className="px-4 py-3">Assigned Role</th>
                      <th className="px-4 py-3">Account Status</th>
                      <th className="px-4 py-3">Registration Date</th>
                      <th className="px-4 py-3 text-right">Role & Account Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredUsers.map((u) => {
                      const roleName = getRoleName(u);
                      const isAdmin = roleName === "admin";
                      const isPendingAction = actionLoading === u.id;

                      return (
                        <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-4 py-3 font-medium text-slate-900">{u.name}</td>
                          <td className="px-4 py-3 text-slate-600">{u.email}</td>
                          <td className="px-4 py-3">
                            {renderRoleBadge(roleName)}
                          </td>
                          <td className="px-4 py-3">
                            {renderStatusBadge(u.status, u.is_active)}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                            {formatDate(u.created_at)}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            {u.email === "admin@retail.test" ? (
                              <span className="inline-flex items-center text-xs text-purple-700 bg-purple-50 px-2 py-1 rounded border border-purple-200 font-medium">
                                <ShieldAlert size={12} className="mr-1" /> Primary Admin
                              </span>
                            ) : (
                              <div className="flex items-center justify-end gap-2">
                                {/* Role switcher dropdown (between Staff, Manager, and Admin) */}
                                {u.status === "active" && (
                                  <select
                                    value={roleName}
                                    disabled={isPendingAction}
                                    onChange={(e) => handleChangeRole(u, e.target.value as "staff" | "manager" | "admin")}
                                    className="h-7 text-xs rounded border border-slate-200 bg-white px-2 text-slate-700 font-medium focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    title="Change user role between Staff, Manager, and Admin"
                                  >
                                    <option value="staff">Role: Staff</option>
                                    <option value="manager">Role: Manager</option>
                                    <option value="admin">Role: Admin</option>
                                  </select>
                                )}

                                {/* If pending: quick approve/reject */}
                                {u.status === "pending" && (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-xs bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200 px-2"
                                      disabled={isPendingAction}
                                      onClick={() => handleApprove(u, "staff")}
                                    >
                                      Approve Staff
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200 px-2"
                                      disabled={isPendingAction}
                                      onClick={() => handleApprove(u, "manager")}
                                    >
                                      Approve Mgr
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-xs bg-purple-50 text-purple-700 hover:bg-purple-100 border-purple-200 px-2"
                                      disabled={isPendingAction}
                                      onClick={() => handleApprove(u, "admin")}
                                    >
                                      Approve Admin
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-xs bg-red-50 text-red-700 hover:bg-red-100 border-red-200 px-2"
                                      disabled={isPendingAction}
                                      onClick={() => handleReject(u)}
                                    >
                                      Reject
                                    </Button>
                                  </>
                                )}

                                {/* Activate / Deactivate toggle */}
                                {u.status !== "pending" && u.status !== "rejected" && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className={`h-7 text-xs px-2.5 ${
                                      u.is_active
                                        ? "text-amber-700 hover:bg-amber-50 border-amber-200"
                                        : "text-emerald-700 hover:bg-emerald-50 border-emerald-200"
                                    }`}
                                    disabled={isPendingAction}
                                    onClick={() => handleToggleActive(u)}
                                  >
                                    <Power size={11} className="mr-1" />
                                    {u.is_active ? "Deactivate" : "Activate"}
                                  </Button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
