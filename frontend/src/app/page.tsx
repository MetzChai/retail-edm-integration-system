"use client";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserManagement } from "@/components/user-management";
import {
  ShoppingCart,
  Package,
  Users,
  AlertTriangle,
  RefreshCw,
  Store,
  Warehouse,
  ShieldCheck,
  TrendingUp,
  Receipt,
  Clock,
  CheckCircle2,
  Calendar,
  Layers,
  ArrowUpRight,
  Database,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";

interface DashboardData {
  total_sales: number;
  period_sales: number;
  all_time_sales: number;
  total_products: number;
  total_customers: number;
  total_available_stock: number;
  total_stock: number;
  low_stock_products: number;
  low_stock_count: number;
  out_of_stock_count: number;
  total_transactions: number;
  pending_online_orders: number;
  sales_chart: Array<{ day: string; date: string; orders: number; revenue: number }>;
  weekly_sales: Array<{ week: string; week_start: string; orders: number; revenue: number }>;
  monthly_sales: Array<{ month: string; bucket: string; orders: number; revenue: number }>;
  best_selling_products: Array<{ product_id: number; name: string; sku: string; units: number; revenue: number }>;
  recent_transactions: Array<{
    id: number;
    transaction_no: string;
    customer: string;
    customer_email?: string;
    total: number;
    payment_method: string;
    status: string;
    source: string;
    created_at: string;
  }>;
  inventory_overview: {
    total_units: number;
    low_stock: number;
    out_of_stock: number;
    stock_value: number;
  };
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [daysFilter, setDaysFilter] = useState<number>(30);
  const [chartView, setChartView] = useState<"daily" | "weekly" | "monthly">("daily");

  const role = String(user?.role || "staff").toLowerCase();
  const isAdmin = role === "admin";
  const isManager = role === "manager";
  const isStaff = role === "staff";

  const loadData = async (days: number = daysFilter) => {
    setLoading(true);
    setOffline(false);
    try {
      const res = await api.get<DashboardData>(`/dashboard?days=${days}`);
      if (res.offline) {
        setOffline(true);
      } else if (res.ok && res.data) {
        setData(res.data);
      }
    } catch {
      setOffline(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(daysFilter);
  }, [daysFilter]);

  if (loading && !data) {
    return (
      <div className="flex h-72 flex-col items-center justify-center space-y-3">
        <RefreshCw className="h-7 w-7 animate-spin text-blue-600" />
        <p className="text-sm font-medium text-slate-500">Connecting to MySQL database and calculating statistics...</p>
      </div>
    );
  }

  if (offline && !data) {
    return <OfflineBanner onRetry={() => loadData(daysFilter)} />;
  }

  const topProduct = data?.best_selling_products?.[0];

  // Active chart series based on toggle
  const chartSeries =
    chartView === "weekly"
      ? (data?.weekly_sales || []).map((w) => ({ label: w.week, revenue: w.revenue, orders: w.orders }))
      : chartView === "monthly"
      ? (data?.monthly_sales || []).map((m) => ({ label: m.month, revenue: m.revenue, orders: m.orders }))
      : (data?.sales_chart || []).map((d) => ({ label: d.date, revenue: d.revenue, orders: d.orders }));

  return (
    <div className="space-y-6">
      {/* Dashboard Top Header & Operational Context */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
              {isAdmin ? "Enterprise Administrator Overview" : isManager ? "Store Management & Operations" : "Staff Operations & Point of Sale"}
            </h1>
            <Badge variant={isAdmin ? "info" : isManager ? "success" : "muted"}>
              {isAdmin ? "Admin Access" : isManager ? "Manager Access" : "Staff Access"}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {isAdmin
              ? "Comprehensive analytics across POS transactions, central warehouse inventory, CRM accounts, and data pipelines."
              : isManager
              ? "Store-level inventory supervision, order flow management, and real-time revenue analytics."
              : "Point-of-sale checkout, inventory checks, and customer purchase lookup."}
          </p>
        </div>

        {/* Date Filter & Quick Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-lg border border-slate-200 bg-white p-1 shadow-2xs">
            <Calendar className="ml-2 h-3.5 w-3.5 text-slate-400" />
            <select
              value={daysFilter}
              onChange={(e) => setDaysFilter(Number(e.target.value))}
              className="bg-transparent px-2 py-1 text-xs font-semibold text-slate-700 outline-hidden cursor-pointer"
            >
              <option value={7}>Last 7 Days</option>
              <option value={30}>Last 30 Days</option>
              <option value={90}>Last 90 Days</option>
              <option value={365}>Full Year</option>
            </select>
          </div>

          <button
            onClick={() => loadData(daysFilter)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-blue-600" : ""}`} />
            Refresh
          </button>

          {isStaff && (
            <Link href="/pos">
              <Button size="sm" className="bg-blue-600 text-white hover:bg-blue-700 shadow-xs">
                <ShoppingCart className="mr-1.5 h-3.5 w-3.5" /> Launch POS
              </Button>
            </Link>
          )}

          {isManager && (
            <Link href="/inventory">
              <Button size="sm" variant="outline" className="shadow-xs">
                <Warehouse className="mr-1.5 h-3.5 w-3.5" /> Manage Inventory
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Enterprise EDM Quick Action Hub */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Link
          href="/pos"
          className="group flex items-center gap-3 rounded-xl border border-blue-200/80 bg-white p-3 shadow-xs hover:border-blue-400 hover:shadow-md transition-all cursor-pointer"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
            <ShoppingCart size={18} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-800 group-hover:text-blue-600 transition-colors">Point of Sale</p>
            <p className="text-[10px] text-slate-400 truncate">Process Sale & Receipt</p>
          </div>
        </Link>

        <Link
          href="/inventory"
          className="group flex items-center gap-3 rounded-xl border border-indigo-200/80 bg-white p-3 shadow-xs hover:border-indigo-400 hover:shadow-md transition-all cursor-pointer"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
            <Warehouse size={18} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">Warehouse Stock</p>
            <p className="text-[10px] text-slate-400 truncate">Valuation & Stock-In</p>
          </div>
        </Link>

        <Link
          href="/integration"
          className="group flex items-center gap-3 rounded-xl border border-emerald-200/80 bg-white p-3 shadow-xs hover:border-emerald-400 hover:shadow-md transition-all cursor-pointer"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
            <Database size={18} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-800 group-hover:text-emerald-600 transition-colors">Data Pipelines</p>
            <p className="text-[10px] text-slate-400 truncate">5-Source ETL & CDC</p>
          </div>
        </Link>

        <Link
          href="/data-quality"
          className="group flex items-center gap-3 rounded-xl border border-amber-200/80 bg-white p-3 shadow-xs hover:border-amber-400 hover:shadow-md transition-all cursor-pointer"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600 group-hover:bg-amber-600 group-hover:text-white transition-colors">
            <ShieldCheck size={18} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-800 group-hover:text-amber-600 transition-colors">Data Quality</p>
            <p className="text-[10px] text-slate-400 truncate">5-Dimension Health</p>
          </div>
        </Link>

        <Link
          href="/customers"
          className="group flex items-center gap-3 rounded-xl border border-purple-200/80 bg-white p-3 shadow-xs hover:border-purple-400 hover:shadow-md transition-all cursor-pointer col-span-2 sm:col-span-1"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-50 text-purple-600 group-hover:bg-purple-600 group-hover:text-white transition-colors">
            <Users size={18} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-800 group-hover:text-purple-600 transition-colors">Customer CRM</p>
            <p className="text-[10px] text-slate-400 truncate">RFM Tiers & Offers</p>
          </div>
        </Link>
      </div>

      {/* 8 Required Real Statistics Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Sales"
          value={formatCurrency(data?.total_sales ?? 0)}
          icon={TrendingUp}
          color="blue"
          hint={`Period total (${daysFilter} days)`}
        />

        <StatCard
          title="Total Products"
          value={String(data?.total_products ?? 0)}
          icon={Package}
          color="blue"
          hint="Active catalog items"
        />

        <StatCard
          title="Total Customers"
          value={String(data?.total_customers ?? 0)}
          icon={Users}
          color="amber"
          hint="Registered & guest buyers"
        />

        <StatCard
          title="Total Available Stock"
          value={Number(data?.total_available_stock ?? 0).toLocaleString()}
          icon={Warehouse}
          color="slate"
          hint="Units on warehouse floor"
        />

        <StatCard
          title="Low Stock Products"
          value={String(data?.low_stock_products ?? 0)}
          icon={AlertTriangle}
          color="amber"
          hint={`${data?.out_of_stock_count ?? 0} out of stock`}
        />

        <StatCard
          title="Total Transactions"
          value={String(data?.total_transactions ?? 0)}
          icon={Receipt}
          color="green"
          hint="Completed sales orders"
        />

        <StatCard
          title="Pending Online Orders"
          value={String(data?.pending_online_orders ?? 0)}
          icon={Clock}
          color={Number(data?.pending_online_orders ?? 0) > 0 ? "amber" : "slate"}
          hint="Awaiting fulfillment"
        />

        <StatCard
          title="Best-Selling Product"
          value={topProduct?.name || "None yet"}
          icon={CheckCircle2}
          color="green"
          hint={topProduct ? `${topProduct.units} units sold (${formatCurrency(topProduct.revenue)})` : "No sales in range"}
        />
      </div>

      {/* Admin User Management Workflow */}
      {isAdmin && (
        <div className="pt-1">
          <UserManagement embedded />
        </div>
      )}

      {/* Sales Overview Chart (A) & Best-Selling Products (B) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Chart A: Sales Overview */}
        <Card className="lg:col-span-2 shadow-2xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-base font-semibold text-slate-900">Sales Overview & Trends</CardTitle>
              <p className="text-xs text-slate-500">Real transaction revenue recorded in Asia/Manila timezone</p>
            </div>
            {/* View switcher: Daily / Weekly / Monthly */}
            <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-1">
              <button
                onClick={() => setChartView("daily")}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-all ${
                  chartView === "daily" ? "bg-white text-blue-600 shadow-2xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Daily
              </button>
              <button
                onClick={() => setChartView("weekly")}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-all ${
                  chartView === "weekly" ? "bg-white text-blue-600 shadow-2xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Weekly
              </button>
              <button
                onClick={() => setChartView("monthly")}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-all ${
                  chartView === "monthly" ? "bg-white text-blue-600 shadow-2xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Monthly
              </button>
            </div>
          </CardHeader>
          <CardContent>
            {chartSeries.length > 0 ? (
              <div className="h-72 w-full pt-3">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartSeries} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis
                      dataKey="label"
                      stroke="#94a3b8"
                      fontSize={11}
                      tickLine={false}
                      axisLine={{ stroke: "#e2e8f0" }}
                    />
                    <YAxis
                      stroke="#94a3b8"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `₱${v >= 1000 ? (v / 1000).toFixed(0) + "k" : v}`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#0f172a",
                        borderRadius: "8px",
                        border: "none",
                        color: "#fff",
                        fontSize: "12px",
                      }}
                      formatter={(val: unknown) => [formatCurrency(Number(val)), "Revenue"]}
                      labelStyle={{ color: "#94a3b8", fontWeight: 600 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke="#2563eb"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#salesGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-72 items-center justify-center text-sm text-slate-400">
                No transaction data available for this range.
              </div>
            )}

            {/* Omnichannel Distribution Bar */}
            <div className="mt-3 pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5 font-semibold text-slate-700">
                  <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />
                  POS In-Store: {Math.round((((data?.recent_transactions || []).filter((t) => t.source === "pos").length) / Math.max(1, (data?.recent_transactions || []).length)) * 100)}%
                </span>
                <span className="flex items-center gap-1.5 font-semibold text-slate-700">
                  <span className="h-2.5 w-2.5 rounded-full bg-purple-600" />
                  Online Storefront: {100 - Math.round((((data?.recent_transactions || []).filter((t) => t.source === "pos").length) / Math.max(1, (data?.recent_transactions || []).length)) * 100)}%
                </span>
              </div>
              <span className="text-[11px] text-slate-400 font-mono">
                Unified EDM Ledger • Real-time Sync
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Chart B: Best-Selling Products */}
        <Card className="shadow-2xs">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-slate-900">Top-Selling Products</CardTitle>
            <p className="text-xs text-slate-500">Volume sold & total revenue generated</p>
          </CardHeader>
          <CardContent>
            {data?.best_selling_products && data.best_selling_products.length > 0 ? (
              <div className="space-y-3 pt-2">
                {data.best_selling_products.map((p, idx) => (
                  <div key={p.product_id || idx} className="flex items-center justify-between border-b border-slate-100 pb-2.5 last:border-0 last:pb-0">
                    <div className="min-w-0 flex-1 pr-3">
                      <p className="truncate text-xs font-semibold text-slate-800">{p.name}</p>
                      <p className="text-[11px] text-slate-400 font-mono">SKU: {p.sku}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-bold text-slate-900">{p.units} units</p>
                      <p className="text-[11px] text-emerald-600 font-semibold">{formatCurrency(p.revenue)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-56 items-center justify-center text-sm text-slate-400">
                No best seller records found.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Inventory Overview (C) & Recent Transactions (D) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Card C: Inventory Overview */}
        <Card className="shadow-2xs">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-slate-900">Inventory Valuation & Health</CardTitle>
            <p className="text-xs text-slate-500">Warehouse stock availability and alerts</p>
          </CardHeader>
          <CardContent className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                <span className="text-[11px] font-medium text-slate-500">Available Units</span>
                <p className="mt-1 text-lg font-bold text-slate-900">
                  {Number(data?.inventory_overview?.total_units ?? data?.total_available_stock ?? 0).toLocaleString()}
                </p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                <span className="text-[11px] font-medium text-slate-500">Valuation (Cost)</span>
                <p className="mt-1 text-lg font-bold text-blue-600">
                  {formatCurrency(data?.inventory_overview?.stock_value ?? 0)}
                </p>
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between text-xs py-1.5 border-b border-slate-100">
                <span className="text-slate-600 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-amber-500" /> Low Stock Items
                </span>
                <span className="font-semibold text-amber-700">
                  {data?.inventory_overview?.low_stock ?? data?.low_stock_products ?? 0}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs py-1.5 border-b border-slate-100">
                <span className="text-slate-600 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-rose-500" /> Out of Stock Items
                </span>
                <span className="font-semibold text-rose-700">
                  {data?.inventory_overview?.out_of_stock ?? data?.out_of_stock_count ?? 0}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs py-1.5">
                <span className="text-slate-600 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" /> Healthy Stock Level
                </span>
                <span className="font-semibold text-emerald-700">
                  {Math.max(0, (data?.total_products ?? 0) - (data?.low_stock_products ?? 0))} items
                </span>
              </div>
            </div>

            <Link href="/inventory" className="block pt-2">
              <Button variant="outline" size="sm" className="w-full text-xs">
                Inspect Stock Details <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Table D: Recent Transactions */}
        <Card className="lg:col-span-2 shadow-2xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-base font-semibold text-slate-900">Recent Transactions</CardTitle>
              <p className="text-xs text-slate-500">Live sales recorded via POS and Online Storefront</p>
            </div>
            <Link href="/reports">
              <Button variant="ghost" size="sm" className="text-xs text-blue-600">
                View Full Ledger
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {data?.recent_transactions && data.recent_transactions.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-400 font-medium">
                      <th className="py-2.5 font-medium">Transaction No</th>
                      <th className="py-2.5 font-medium">Customer</th>
                      <th className="py-2.5 font-medium">Channel</th>
                      <th className="py-2.5 font-medium">Date & Time</th>
                      <th className="py-2.5 font-medium">Status</th>
                      <th className="py-2.5 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.recent_transactions.map((tx) => (
                      <tr key={tx.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-2.5 font-mono font-medium text-blue-700">
                          {tx.transaction_no}
                        </td>
                        <td className="py-2.5 text-slate-700 font-medium truncate max-w-[130px]">
                          {tx.customer}
                        </td>
                        <td className="py-2.5">
                          <span
                            className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                              tx.source === "online"
                                ? "bg-purple-50 text-purple-700 border border-purple-200"
                                : "bg-blue-50 text-blue-700 border border-blue-200"
                            }`}
                          >
                            {tx.source}
                          </span>
                        </td>
                        <td className="py-2.5 text-slate-500 text-[11px] whitespace-nowrap">
                          {tx.created_at}
                        </td>
                        <td className="py-2.5">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold capitalize ${
                              tx.status === "completed"
                                ? "bg-emerald-100 text-emerald-800"
                                : tx.status === "pending"
                                ? "bg-amber-100 text-amber-800"
                                : tx.status === "cancelled"
                                ? "bg-rose-100 text-rose-800"
                                : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {tx.status}
                          </span>
                        </td>
                        <td className="py-2.5 text-right font-bold text-slate-900">
                          {formatCurrency(tx.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex h-56 items-center justify-center text-sm text-slate-400">
                No recent transactions recorded.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function formatCurrency(val: number | string | unknown): string {
  const num = typeof val === "number" ? val : parseFloat(String(val || 0));
  if (isNaN(num)) return "₱0.00";
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(num);
}

function OfflineBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
      <p className="text-amber-800 font-semibold">Backend REST API Offline or Unreachable</p>
      <p className="text-sm text-amber-600 mt-1">
        Ensure the Laravel backend server is running and accessible at the configured URL.
      </p>
      <button
        onClick={onRetry}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-amber-700"
      >
        <RefreshCw className="h-3.5 w-3.5" /> Reconnect
      </button>
    </div>
  );
}
