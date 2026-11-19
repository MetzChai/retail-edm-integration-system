"use client";
import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { normalizeList } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { DataTable, Column } from "@/components/ui/data-table";
import { RefreshCw, ShieldAlert } from "lucide-react";
import Link from "next/link";

type Row = Record<string, unknown>;

export default function AuditLogsPage() {
  const { user } = useAuth();
  const isAdmin = String(user?.role || "").toLowerCase() === "admin";
  const { toast } = useToast();
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = async () => {
    if (!isAdmin) return;
    setLoading(true);
    const params = new URLSearchParams({ per_page: "50" });
    if (search) params.set("search", search);
    const res = await api.get(`/audit-logs?${params.toString()}`);
    if (res.ok) setItems(normalizeList(res.data).items);
    else toast(res.offline ? "API offline" : res.error || "Failed", "error");
    setLoading(false);
  };

  useEffect(() => { load(); }, [search, isAdmin]);

  if (!isAdmin) {
    return (
      <div className="max-w-lg mx-auto py-12">
        <Card className="border-red-200 bg-red-50/50">
          <CardContent className="pt-6 text-center">
            <ShieldAlert className="mx-auto text-red-600 mb-3" size={40} />
            <h2 className="text-lg font-bold text-red-900">Access Restricted</h2>
            <p className="text-sm text-red-700 mt-1">
              Audit logs are restricted to Administrator accounts.
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

  const columns: Column<Row>[] = [
    { key: "user", label: "User", render: (r) => String(r.user_name || r.user || r.causer || "-") },
    { key: "action", label: "Action", render: (r) => String(r.action || r.event || "-") },
    { key: "entity", label: "Entity", render: (r) => String(r.entity || r.subject_type || r.model || "-") },
    { key: "created_at", label: "Timestamp", render: (r) => formatDate(r.created_at || r.timestamp) },
    { key: "details", label: "Details", render: (r) => String(r.details || r.description || r.properties || "-") },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-slate-800">Audit Logs</h1>
        <Button variant="outline" onClick={load}><RefreshCw size={14} /> Refresh</Button>
      </div>
      <Card>
        <CardContent className="p-4">
          <Input placeholder="Search logs..." value={search} onChange={(e) => setSearch(e.target.value)} className="mb-4 md:max-w-xs" />
          <DataTable columns={columns} data={items} loading={loading} />
        </CardContent>
      </Card>
    </div>
  );
}

function formatDate(v: unknown) {
  if (!v) return "-";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
}