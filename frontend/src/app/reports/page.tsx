"use client";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { normalizeList } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { DataTable, Column } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import {
  RefreshCw,
  Download,
  Calendar,
  TrendingUp,
  Package,
  Users,
  Database,
  ShieldCheck,
  FileSpreadsheet,
  Printer,
} from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type Row = Record<string, unknown>;

const REPORT_TABS = [
  { id: "sales", label: "Sales Analytics", icon: TrendingUp },
  { id: "bestsellers", label: "Best-Selling Products", icon: Package },
  { id: "inventory", label: "Inventory Valuation", icon: Package },
  { id: "customers", label: "Customer Purchases", icon: Users },
  { id: "integration", label: "Integration Logs", icon: Database },
  { id: "dataquality", label: "Data Quality Audit", icon: ShieldCheck },
] as const;

type ReportTabId = (typeof REPORT_TABS)[number]["id"];

export default function ReportsPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<ReportTabId>("sales");
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">("daily");
  const [channel, setChannel] = useState<"all" | "pos" | "online">("all");
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const loadReport = async () => {
    setLoading(true);
    setRows([]);
    setSummary(null);

    let path = "";
    if (tab === "sales") path = `/reports/sales?period=${period}&source=${channel}`;
    else if (tab === "bestsellers") path = "/reports/best-sellers";
    else if (tab === "inventory") path = "/reports/inventory";
    else if (tab === "customers") path = "/reports/customers";
    else if (tab === "integration") path = "/reports/integration";
    else if (tab === "dataquality") path = "/reports/data-quality";

    try {
      const res = await api.get(path);
      if (res.ok && res.data) {
        const d = res.data as Record<string, unknown>;
        if (d.summary) setSummary(d.summary as Record<string, unknown>);

        if (Array.isArray(d.rows)) {
          setRows(d.rows as Row[]);
        } else if (Array.isArray(d.checks)) {
          setRows(d.checks as Row[]);
        } else {
          setRows(normalizeList(res.data).items);
        }
      } else {
        toast(res.offline ? "API offline" : res.error || "Failed to load report", "error");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, [tab, period, channel]);

  const handleExportCSV = async () => {
    setExporting(true);
    try {
      const exportType =
        tab === "bestsellers"
          ? "best-sellers"
          : tab === "dataquality"
          ? "data-quality"
          : tab;

      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const baseUrl = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api").replace(/\/$/, "");
      const url = `${baseUrl}/reports/export/${exportType}?period=${period}&source=${channel}`;

      const res = await fetch(url, {
        headers: {
          Accept: "text/csv",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!res.ok) throw new Error("Export failed");

      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `report_${exportType}_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);

      toast("CSV report downloaded successfully.", "success");
    } catch {
      toast("Failed to download CSV export.", "error");
    } finally {
      setExporting(false);
    }
  };

  const getColumns = (): Column<Row>[] => {
    switch (tab) {
      case "sales":
        return [
          { key: "bucket", label: "Date / Bucket", render: (r) => <span className="font-mono text-xs font-semibold text-blue-700">{String(r.bucket)}</span> },
          {
            key: "pos_breakdown",
            label: "In-Store POS Sales",
            render: (r) => (
              <div className="text-xs">
                <span className="font-semibold text-slate-800">{formatMoney(r.pos_revenue ?? 0)}</span>
                <span className="text-[11px] text-slate-400 block">{Number(r.pos_orders ?? 0)} orders</span>
              </div>
            ),
          },
          {
            key: "online_breakdown",
            label: "Online Storefront",
            render: (r) => (
              <div className="text-xs">
                <span className="font-semibold text-purple-700">{formatMoney(r.online_revenue ?? 0)}</span>
                <span className="text-[11px] text-slate-400 block">{Number(r.online_orders ?? 0)} orders</span>
              </div>
            ),
          },
          { key: "orders", label: "Total Orders", render: (r) => <span className="font-semibold text-slate-800">{String(r.orders)}</span> },
          { key: "revenue", label: "Combined Revenue", render: (r) => <span className="font-bold text-slate-900">{formatMoney(r.revenue)}</span> },
          { key: "avg_order_value", label: "Average Order Value", render: (r) => <span className="text-slate-600">{formatMoney(r.avg_order_value)}</span> },
        ];

      case "bestsellers":
        return [
          { key: "sku", label: "SKU", render: (r) => <span className="font-mono text-xs font-semibold text-blue-700">{String(r.sku)}</span> },
          { key: "name", label: "Product Name", render: (r) => <span className="font-semibold text-slate-900">{String(r.name)}</span> },
          { key: "units", label: "Units Sold", render: (r) => <Badge variant="success">{String(r.units)} units</Badge> },
          { key: "revenue", label: "Total Revenue", render: (r) => <span className="font-bold text-slate-900">{formatMoney(r.revenue)}</span> },
          { key: "orders", label: "Distinct Orders", render: (r) => <span className="text-slate-600">{String(r.orders || "-")}</span> },
        ];

      case "inventory":
        return [
          { key: "sku", label: "SKU", render: (r) => <span className="font-mono text-xs text-blue-700">{(r.product as Row)?.sku ? String((r.product as Row).sku) : String(r.sku || "-")}</span> },
          { key: "name", label: "Product", render: (r) => <span className="font-semibold text-slate-900">{(r.product as Row)?.name ? String((r.product as Row).name) : String(r.name || "-")}</span> },
          {
            key: "quantity",
            label: "Stock Available",
            render: (r) => {
              const q = Number(r.quantity ?? 0);
              const min = Number(r.min_stock ?? 5);
              return <Badge variant={q === 0 ? "danger" : q <= min ? "warning" : "success"}>{q} units</Badge>;
            },
          },
          {
            key: "cost_price",
            label: "Unit Cost (Acquisition)",
            render: (r) => <span className="text-xs text-slate-700 font-medium">{formatMoney((r.product as Row)?.cost_price ?? r.cost_price ?? 0)}</span>,
          },
          {
            key: "retail_price",
            label: "Retail Price (SRP)",
            render: (r) => <span className="text-xs text-blue-700 font-semibold">{formatMoney((r.product as Row)?.price ?? r.price ?? 0)}</span>,
          },
          {
            key: "stock_value",
            label: "Warehouse Valuation (Cost)",
            render: (r) => {
              const qty = Number(r.quantity ?? 0);
              const cost = Number((r.product as Row)?.cost_price ?? r.cost_price ?? 0);
              return (
                <div>
                  <span className="font-bold text-slate-900 text-xs block">{formatMoney(qty * cost)}</span>
                  <span className="text-[10px] text-slate-400 block">{qty} × {formatMoney(cost)}</span>
                </div>
              );
            },
          },
        ];

      case "customers":
        return [
          { key: "name", label: "Customer Name", render: (r) => <span className="font-semibold text-slate-900">{String(r.name)}</span> },
          { key: "contact", label: "Email / Phone", render: (r) => <span className="text-xs text-slate-500">{String(r.email || r.phone || "No contact")}</span> },
          { key: "sales_count", label: "Total Orders", render: (r) => <span className="font-semibold text-slate-800">{String(r.sales_count ?? r.total_purchases ?? 0)}</span> },
          { key: "total_spent", label: "Total Spent", render: (r) => <span className="font-bold text-slate-900">{formatMoney(r.total_spent ?? 0)}</span> },
          { key: "latest_purchase_date", label: "Last Order", render: (r) => <span className="text-xs text-slate-400">{r.latest_purchase_date ? formatDate(r.latest_purchase_date) : "Never"}</span> },
        ];

      case "integration":
        return [
          { key: "source", label: "Data Source", render: (r) => <span className="font-mono text-xs font-bold text-blue-700">{String(r.source)}</span> },
          { key: "runs", label: "Total Runs", render: (r) => <span className="font-semibold">{String(r.runs)}</span> },
          { key: "success_rate", label: "Success Rate", render: (r) => <Badge variant={Number(r.success_rate ?? 0) >= 95 ? "success" : "warning"}>{String(r.success_rate)}%</Badge> },
          { key: "records_processed", label: "Records Processed", render: (r) => <span className="font-semibold text-emerald-700">{String(r.records_processed)}</span> },
          { key: "records_failed", label: "Failed Records", render: (r) => <span className={Number(r.records_failed ?? 0) > 0 ? "text-rose-600 font-bold" : "text-slate-400"}>{String(r.records_failed)}</span> },
          { key: "last_run", label: "Last Ingestion", render: (r) => <span className="text-xs text-slate-500">{formatDate(r.last_run)}</span> },
        ];

      case "dataquality":
        return [
          { key: "entity", label: "Entity", render: (r) => <span className="font-mono font-bold text-blue-700">{String(r.entity)}</span> },
          { key: "dimension", label: "Dimension", render: (r) => <Badge variant="muted">{String(r.dimension)}</Badge> },
          { key: "score", label: "Audit Score", render: (r) => <Badge variant={Number(r.score) >= 95 ? "success" : "warning"}>{Number(r.score).toFixed(1)}%</Badge> },
          { key: "records_checked", label: "Audited Records", render: (r) => `${r.records_checked} checked (${r.records_failed} failed)` },
          { key: "checked_at", label: "Last Checked", render: (r) => formatDate(r.checked_at) },
        ];

      default:
        return [];
    }
  };

  // Chart data formatting
  const chartData = rows.map((r) => ({
    name: String(r.bucket || r.name || r.sku || r.source || r.entity || "Row"),
    revenue: Number(r.revenue ?? r.stock_value ?? r.total_spent ?? r.records_processed ?? r.score ?? 0),
    orders: Number(r.orders ?? r.units ?? r.sales_count ?? r.runs ?? 0),
  }));

  return (
    <div className="space-y-6">
      {/* Module Description Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-bold text-slate-900">System Reports & Business Intelligence</h1>
            <Badge variant="info">Live MySQL Ledger</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Audit-ready reporting across sales transactions, product velocities, inventory valuation, and data quality.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadReport} disabled={loading} className="cursor-pointer">
            <RefreshCw size={14} className={`mr-1.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            disabled={exporting || rows.length === 0}
            className="cursor-pointer"
          >
            <FileSpreadsheet size={14} className={`mr-1.5 ${exporting ? "animate-spin text-blue-600" : "text-emerald-600"}`} />
            {exporting ? "Generating CSV..." : "Export CSV"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()} className="cursor-pointer">
            <Printer size={14} className="mr-1.5 text-slate-600" /> Print
          </Button>
        </div>
      </div>

      {/* Report Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-2">
        <div className="flex flex-wrap gap-2">
          {REPORT_TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all cursor-pointer ${
                  active
                    ? "bg-blue-600 text-white shadow-xs"
                    : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
                }`}
              >
                <Icon size={14} />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Period Selector (for sales report) */}
        {tab === "sales" && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-600">Channel:</span>
              <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-2xs">
                {[
                  { id: "all", label: "All Channels" },
                  { id: "pos", label: "POS Only" },
                  { id: "online", label: "Online Only" },
                ].map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setChannel(c.id as "all" | "pos" | "online")}
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                      channel === c.id ? "bg-blue-600 text-white font-bold" : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-600">Interval:</span>
              <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-2xs">
                {(["daily", "weekly", "monthly"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold capitalize transition-colors cursor-pointer ${
                      period === p ? "bg-blue-50 text-blue-700 font-bold" : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Summary KPI Cards for Sales Report */}
      {tab === "sales" && summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card className="shadow-2xs">
            <CardContent className="p-4">
              <span className="text-xs font-medium text-slate-500">Combined Period Revenue</span>
              <p className="mt-1 text-2xl font-bold text-blue-600">{formatMoney(summary.revenue ?? 0)}</p>
              <span className="text-[11px] text-slate-400 mt-0.5 block">{Number(summary.orders ?? 0).toLocaleString()} total orders</span>
            </CardContent>
          </Card>
          <Card className="shadow-2xs">
            <CardContent className="p-4">
              <span className="text-xs font-medium text-slate-500">In-Store POS Revenue</span>
              <p className="mt-1 text-2xl font-bold text-slate-900">{formatMoney(summary.pos_revenue ?? 0)}</p>
              <span className="text-[11px] text-slate-400 mt-0.5 block">{Number(summary.pos_orders ?? 0).toLocaleString()} POS sales</span>
            </CardContent>
          </Card>
          <Card className="shadow-2xs">
            <CardContent className="p-4">
              <span className="text-xs font-medium text-slate-500">Online Storefront Revenue</span>
              <p className="mt-1 text-2xl font-bold text-purple-700">{formatMoney(summary.online_revenue ?? 0)}</p>
              <span className="text-[11px] text-slate-400 mt-0.5 block">{Number(summary.online_orders ?? 0).toLocaleString()} online orders</span>
            </CardContent>
          </Card>
          <Card className="shadow-2xs">
            <CardContent className="p-4">
              <span className="text-xs font-medium text-slate-500">Average Order Value (AOV)</span>
              <p className="mt-1 text-2xl font-bold text-emerald-600">{formatMoney(summary.avg_order_value ?? 0)}</p>
              <span className="text-[11px] text-slate-400 mt-0.5 block">Across active filter</span>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Visual Analytics Chart */}
      {chartData.length > 0 && (
        <Card className="shadow-2xs">
          <CardHeader className="pb-2 border-b border-slate-100">
            <CardTitle className="text-sm font-bold text-slate-900">
              {tab === "sales"
                ? `Sales Trend (${period.toUpperCase()})`
                : tab === "bestsellers"
                ? "Revenue by Product"
                : "Report Visualization"}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                {tab === "sales" ? (
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="repGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" fontSize={11} stroke="#94a3b8" />
                    <YAxis fontSize={11} stroke="#94a3b8" tickFormatter={(v) => `₱${v >= 1000 ? (v / 1000).toFixed(0) + "k" : v}`} />
                    <Tooltip formatter={(v: unknown) => [formatMoney(v), "Revenue"]} />
                    <Area type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={2} fill="url(#repGrad)" />
                  </AreaChart>
                ) : (
                  <BarChart data={chartData.slice(0, 10)} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" fontSize={11} stroke="#94a3b8" />
                    <YAxis fontSize={11} stroke="#94a3b8" />
                    <Tooltip formatter={(v: unknown) => [formatMoney(v), "Value"]} />
                    <Bar dataKey="revenue" fill="#2563eb" radius={[4, 4, 0, 0]} />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Data Table */}
      <Card className="shadow-2xs">
        <CardHeader className="pb-3 border-b border-slate-100">
          <CardTitle className="text-base font-bold text-slate-900">
            {REPORT_TABS.find((t) => t.id === tab)?.label} Ledger Data
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <DataTable
            columns={getColumns()}
            data={rows}
            loading={loading}
            empty="No records returned for this report."
          />
        </CardContent>
      </Card>
    </div>
  );
}

function formatDate(v: unknown) {
  if (!v) return "-";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMoney(v: unknown) {
  const n = Number(v ?? 0);
  if (Number.isNaN(n)) return "₱0.00";
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(n);
}
