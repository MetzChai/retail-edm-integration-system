"use client";

import React, { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { normalizeList } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { DataTable, Column } from "@/components/ui/data-table";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import {
  RefreshCw,
  Play,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  Database,
  Layers,
  ArrowRightLeft,
  Server,
  Terminal,
  Activity,
  Zap,
  Eye,
  Truck,
  ShoppingCart,
  Check,
  Send,
  Boxes,
} from "lucide-react";

type Row = Record<string, unknown>;

type DataSourceItem = Row & {
  id: number;
  name: string;
  type: string;
  status: string;
  last_sync_at: string | null;
  last_sync_records: number;
};

type IntegrationLogItem = Row & {
  id: number;
  source: string;
  operation: string;
  status: string;
  records_processed: number;
  records_failed: number;
  errors: string | null;
  started_at: string;
  finished_at: string | null;
  data_source?: DataSourceItem;
};

type CdcEventItem = {
  id: number;
  entity: string;
  entity_id: number;
  operation: string;
  before_payload: Record<string, unknown> | null;
  after_payload: Record<string, unknown> | null;
  captured_at: string;
  synced_at: string | null;
};

type VirtualizedItem = {
  product_id: number;
  sku: string;
  name: string;
  category: string;
  price: number;
  warehouse_stock: number;
  pos_reserved: number;
  online_available: number;
  total_network_stock: number;
  sync_status: string;
};

export default function IntegrationPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"etl" | "cdc" | "virtualization" | "simulator">("etl");

  // ETL state
  const [sources, setSources] = useState<DataSourceItem[]>([]);
  const [logs, setLogs] = useState<IntegrationLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingAll, setSyncingAll] = useState(false);
  const [activeSyncingId, setActiveSyncingId] = useState<number | null>(null);

  // Failed records inspection modal state
  const [failedModalOpen, setFailedModalOpen] = useState(false);
  const [failedLog, setFailedLog] = useState<IntegrationLogItem | null>(null);
  const [failedDetails, setFailedDetails] = useState<unknown>(null);
  const [loadingFailed, setLoadingFailed] = useState(false);
  const [retryingLogId, setRetryingLogId] = useState<number | null>(null);

  // CDC State
  const [cdcEvents, setCdcEvents] = useState<CdcEventItem[]>([]);
  const [loadingCdc, setLoadingCdc] = useState(false);
  const [inspectEvent, setInspectEvent] = useState<CdcEventItem | null>(null);

  // Virtualization State
  const [virtualizedStock, setVirtualizedStock] = useState<VirtualizedItem[]>([]);
  const [virtualSummary, setVirtualSummary] = useState<Record<string, unknown> | null>(null);
  const [loadingVirtual, setLoadingVirtual] = useState(false);

  // Simulation Form State
  const [simSku, setSimSku] = useState("");
  const [simQty, setSimQty] = useState(1);
  const [simEmail, setSimEmail] = useState("ecommerce.shopper@example.com");
  const [simPayment, setSimPayment] = useState("card");
  const [simulating, setSimulating] = useState(false);
  const [simResult, setSimResult] = useState<Record<string, unknown> | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [sRes, lRes] = await Promise.all([
        api.get<{ data?: DataSourceItem[] }>("/data-sources"),
        api.get<{ data?: IntegrationLogItem[] }>("/integration/logs?per_page=30"),
      ]);

      if (sRes.ok) {
        setSources(normalizeList(sRes.data).items as unknown as DataSourceItem[]);
      }
      if (lRes.ok) {
        setLogs(normalizeList(lRes.data).items as unknown as IntegrationLogItem[]);
      }
      if (sRes.offline || lRes.offline) {
        toast("API offline or backend server unreachable.", "error");
      }
    } finally {
      setLoading(false);
    }
  };

  const loadCdc = useCallback(async () => {
    setLoadingCdc(true);
    try {
      const res = await api.get<{ data?: CdcEventItem[] }>("/integration/cdc-stream?limit=40");
      if (res.ok && res.data) {
        setCdcEvents(normalizeList(res.data).items as unknown as CdcEventItem[]);
      }
    } finally {
      setLoadingCdc(false);
    }
  }, []);

  const loadVirtualization = useCallback(async () => {
    setLoadingVirtual(true);
    try {
      const res = await api.get<{ federated_inventory?: VirtualizedItem[]; summary?: Record<string, unknown> }>("/integration/virtualized-view");
      if (res.ok && res.data) {
        setVirtualizedStock(res.data.federated_inventory || []);
        setVirtualSummary(res.data.summary || null);
      }
    } finally {
      setLoadingVirtual(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (activeTab === "cdc") loadCdc();
    if (activeTab === "virtualization") loadVirtualization();
  }, [activeTab, loadCdc, loadVirtualization]);

  // Sync a single data source
  const syncSource = async (source: DataSourceItem) => {
    setActiveSyncingId(source.id);
    try {
      const res = await api.post<{ message: string; summary?: Record<string, unknown> }>(
        "/integration/sync",
        { data_source_id: source.id }
      );

      if (res.ok) {
        toast(`Synchronization completed for ${source.name}.`, "success");
        load();
      } else {
        toast(res.error || `Sync failed for ${source.name}.`, "error");
      }
    } catch {
      toast(`Error syncing ${source.name}.`, "error");
    } finally {
      setActiveSyncingId(null);
    }
  };

  // Sync all 5 sources at once
  const syncAll = async () => {
    setSyncingAll(true);
    try {
      const res = await api.post<{ message: string; results?: Array<{ source: string; status: string }> }>(
        "/integration/sync-all"
      );

      if (res.ok) {
        toast("Full ETL pipeline completed across all 5 enterprise retail data sources.", "success");
        load();
      } else {
        toast(res.error || "Sync all pipeline failed.", "error");
      }
    } catch {
      toast("Error triggering full synchronization.", "error");
    } finally {
      setSyncingAll(false);
    }
  };

  // View failed records
  const viewFailedRecords = async (logItem: IntegrationLogItem) => {
    setFailedLog(logItem);
    setFailedModalOpen(true);
    setLoadingFailed(true);
    try {
      const res = await api.get<{ errors?: unknown }>(`/integration/failed/${logItem.id}`);
      if (res.ok && res.data) {
        setFailedDetails(res.data.errors);
      } else {
        setFailedDetails(logItem.errors);
      }
    } catch {
      setFailedDetails(logItem.errors);
    } finally {
      setLoadingFailed(false);
    }
  };

  // Retry failed integration log
  const retrySync = async (logItem: IntegrationLogItem) => {
    setRetryingLogId(logItem.id);
    try {
      const res = await api.post<{ message: string }>(`/integration/retry/${logItem.id}`);
      if (res.ok) {
        toast(`Retry completed for ${logItem.source} log.`, "success");
        load();
        if (failedModalOpen) setFailedModalOpen(false);
      } else {
        toast(res.error || "Retry failed.", "error");
      }
    } catch {
      toast("Error retrying synchronization.", "error");
    } finally {
      setRetryingLogId(null);
    }
  };

  // Execute realistic simulated order
  const handleSimulateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setSimulating(true);
    setSimResult(null);

    try {
      const res = await api.post<{
        success: boolean;
        message: string;
        order?: Record<string, unknown>;
        tracking_number?: string;
        carrier?: string;
        stock_remaining?: number;
      }>("/integration/online-order", {
        sku: simSku.trim() || undefined,
        quantity: Number(simQty) || 1,
        customer_email: simEmail.trim() || undefined,
        payment_method: simPayment,
      });

      if (res.ok && res.data) {
        setSimResult(res.data as Record<string, unknown>);
        toast("Real incoming order created in MySQL with inventory deduction and 3PL tracking!", "success");
        load(); // refresh logs
      } else {
        toast(res.error || "Order simulation rejected by validation rules.", "error");
      }
    } catch {
      toast("Error simulating incoming order.", "error");
    } finally {
      setSimulating(false);
    }
  };

  const totalProcessed = logs.reduce((acc, l) => acc + Number(l.records_processed || 0), 0);
  const totalFailed = logs.reduce((acc, l) => acc + Number(l.records_failed || 0), 0);

  const logColumns: Column<IntegrationLogItem>[] = [
    {
      key: "started_at",
      label: "Sync Timestamp",
      render: (r) => (
        <span className="text-xs text-slate-500 whitespace-nowrap">{formatDate(r.started_at)}</span>
      ),
    },
    {
      key: "source",
      label: "Data Source",
      render: (r) => (
        <div className="flex items-center gap-1.5">
          <Database className="h-3.5 w-3.5 text-blue-600" />
          <strong className="text-slate-800 text-xs">{r.source}</strong>
        </div>
      ),
    },
    {
      key: "status",
      label: "ETL Status",
      render: (r) => {
        const s = String(r.status || "").toLowerCase();
        if (s === "success") return <Badge variant="success">Success</Badge>;
        if (s === "partial") return <Badge variant="warning">Partial</Badge>;
        return <Badge variant="danger">Failed</Badge>;
      },
    },
    {
      key: "records_processed",
      label: "Processed / Loaded",
      render: (r) => (
        <span className="font-mono text-xs font-semibold text-emerald-700">
          {r.records_processed} records
        </span>
      ),
    },
    {
      key: "records_failed",
      label: "Failed / Rejected",
      render: (r) => (
        <span
          className={`font-mono text-xs font-semibold ${
            r.records_failed > 0 ? "text-rose-600" : "text-slate-400"
          }`}
        >
          {r.records_failed} records
        </span>
      ),
    },
    {
      key: "actions",
      label: "Actions",
      render: (r) => (
        <div className="flex items-center gap-2">
          {r.records_failed > 0 || r.status === "failed" ? (
            <button
              onClick={() => viewFailedRecords(r)}
              className="inline-flex items-center gap-1 rounded bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 transition-colors cursor-pointer"
            >
              <AlertTriangle className="h-3 w-3" /> Errors
            </button>
          ) : null}

          <button
            onClick={() => retrySync(r)}
            disabled={retryingLogId === r.id}
            className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-200 transition-colors disabled:opacity-50 cursor-pointer"
            title="Retry Sync"
          >
            <RotateCcw className={`h-3 w-3 ${retryingLogId === r.id ? "animate-spin" : ""}`} /> Retry
          </button>
        </div>
      ),
    },
  ];

  const cdcColumns: Column<CdcEventItem>[] = [
    {
      key: "captured_at",
      label: "Event Timestamp",
      render: (r) => <span className="text-xs text-slate-500 whitespace-nowrap">{formatDate(r.captured_at)}</span>,
    },
    {
      key: "entity",
      label: "Target Entity / Table",
      render: (r) => (
        <span className="font-mono text-xs font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded">
          {r.entity}
        </span>
      ),
    },
    {
      key: "operation",
      label: "Operation",
      render: (r) => {
        const op = r.operation.toUpperCase();
        const colors: Record<string, string> = {
          INSERT: "bg-emerald-50 text-emerald-700 border-emerald-200",
          UPDATE: "bg-blue-50 text-blue-700 border-blue-200",
          DELETE: "bg-rose-50 text-rose-700 border-rose-200",
        };
        return (
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${colors[op] || "bg-slate-100 text-slate-700"}`}>
            {op}
          </span>
        );
      },
    },
    {
      key: "entity_id",
      label: "Entity Primary Key",
      render: (r) => <span className="font-mono text-xs text-slate-700">#{r.entity_id}</span>,
    },
    {
      key: "details",
      label: "Payload Inspection",
      render: (r) => (
        <button
          onClick={() => setInspectEvent(r)}
          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-semibold cursor-pointer"
        >
          <Eye size={13} /> View CDC Diff
        </button>
      ),
    },
  ];

  const virtualColumns: Column<VirtualizedItem>[] = [
    {
      key: "sku",
      label: "SKU / Barcode",
      render: (r) => <span className="font-mono text-xs font-bold text-blue-700">{r.sku}</span>,
    },
    {
      key: "name",
      label: "Product Name",
      render: (r) => (
        <div>
          <p className="font-semibold text-slate-900 text-xs">{r.name}</p>
          <span className="text-[10px] text-slate-400">{r.category}</span>
        </div>
      ),
    },
    {
      key: "price",
      label: "Unit Price",
      render: (r) => <span className="text-xs font-semibold text-slate-800">{formatCurrency(r.price)}</span>,
    },
    {
      key: "warehouse_stock",
      label: "Central Warehouse",
      render: (r) => <span className="font-mono text-xs font-semibold text-slate-700">{r.warehouse_stock} units</span>,
    },
    {
      key: "pos_reserved",
      label: "POS Tills Allocated",
      render: (r) => <span className="font-mono text-xs text-amber-700">{r.pos_reserved} units</span>,
    },
    {
      key: "online_available",
      label: "Online Available",
      render: (r) => <span className="font-mono text-xs font-bold text-emerald-700">{r.online_available} units</span>,
    },
    {
      key: "total_network_stock",
      label: "Unified Total",
      render: (r) => <span className="font-mono text-xs font-bold text-slate-900">{r.total_network_stock}</span>,
    },
    {
      key: "sync_status",
      label: "Federation Sync",
      render: (r) => (
        <Badge variant={r.sync_status === "synchronized" ? "success" : "warning"}>
          {r.sync_status}
        </Badge>
      ),
    },
  ];

  // Map known source types including Logistics
  const allSourceTypes = ["POS", "Inventory", "CRM", "OnlineStorefront", "Logistics"] as const;

  return (
    <div className="space-y-6">
      {/* Module Description Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-bold text-slate-900">Retail EDM Data Integration</h1>
            <Badge variant="info">Multi-Method Pipeline</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            REST APIs, Change Data Capture (CDC), Data Virtualization, and ETL synchronizing POS, Warehouse, CRM, Storefront, and 3PL Logistics.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="cursor-pointer">
            <RefreshCw size={14} className={`mr-1.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button
            size="sm"
            onClick={syncAll}
            disabled={syncingAll}
            className="bg-blue-600 hover:bg-blue-700 text-white shadow-xs cursor-pointer"
          >
            <Play size={14} className={`mr-1.5 ${syncingAll ? "animate-spin" : ""}`} />
            {syncingAll ? "Executing Full Sync..." : "Sync All 5 Sources"}
          </Button>
        </div>
      </div>

      {/* Integration Method Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab("etl")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
            activeTab === "etl"
              ? "bg-blue-600 text-white shadow-xs"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          <Layers size={14} />
          1. ETL Pipeline & Sources (5 Sources)
        </button>
        <button
          onClick={() => setActiveTab("cdc")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
            activeTab === "cdc"
              ? "bg-blue-600 text-white shadow-xs"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          <Zap size={14} />
          2. Change Data Capture (CDC Stream)
        </button>
        <button
          onClick={() => setActiveTab("virtualization")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
            activeTab === "virtualization"
              ? "bg-blue-600 text-white shadow-xs"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          <Activity size={14} />
          3. Data Virtualization (Federated View)
        </button>
        <button
          onClick={() => setActiveTab("simulator")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
            activeTab === "simulator"
              ? "bg-blue-600 text-white shadow-xs"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          <Send size={14} />
          4. REST API Order Simulator
        </button>
      </div>

      {/* TAB 1: ETL Pipeline */}
      {activeTab === "etl" && (
        <div className="space-y-6">
          {/* Architecture Banner */}
          <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 shadow-2xs">
            <h4 className="font-bold flex items-center gap-1.5 text-blue-950 text-xs mb-1">
              <Layers className="h-4 w-4 text-blue-700" />
              Unified Enterprise Data Management Architecture
            </h4>
            <p className="text-xs text-blue-800 leading-relaxed">
              The EDM pipeline ingests payloads across all 5 operational systems: <strong>Point of Sale (POS)</strong>, <strong>Central Warehouse Stock</strong>, <strong>Customer Relationship Management (CRM)</strong>, <strong>Online Storefront</strong>, and <strong>Logistics Providers (3PL)</strong>. Records undergo normalization, schema validation, and constraint checking before atomic commit into MySQL.
            </p>
          </div>

          {/* 5 Connected Data Sources Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {allSourceTypes.map((sourceType) => {
              const ds = sources.find((s) => s.type === sourceType);
              const isSyncing = activeSyncingId === ds?.id;

              const title =
                sourceType === "POS"
                  ? "Main Till POS"
                  : sourceType === "Inventory"
                  ? "Central Warehouse"
                  : sourceType === "CRM"
                  ? "Customer CRM Hub"
                  : sourceType === "OnlineStorefront"
                  ? "Online Storefront"
                  : "National 3PL Logistics";

              return (
                <Card key={sourceType} className="shadow-2xs border-slate-200">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        {sourceType}
                      </span>
                      <Badge variant={ds?.status === "active" ? "success" : "muted"}>
                        {ds?.status || "Connected"}
                      </Badge>
                    </div>

                    <div>
                      <h3 className="font-bold text-sm text-slate-900 line-clamp-1">{title}</h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Last sync: {ds?.last_sync_at ? formatDate(ds.last_sync_at) : "Never"}
                      </p>
                    </div>

                    <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-xs">
                      <span className="text-slate-500">Last Batch:</span>
                      <strong className="text-slate-800">{ds?.last_sync_records ?? 0} records</strong>
                    </div>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => ds && syncSource(ds)}
                      disabled={!ds || isSyncing}
                      className="w-full text-xs shadow-2xs cursor-pointer"
                    >
                      <RefreshCw className={`mr-1.5 h-3 w-3 ${isSyncing ? "animate-spin text-blue-600" : ""}`} />
                      {isSyncing ? "Syncing..." : "Sync Source"}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Aggregate Pipeline Metrics */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Card className="shadow-2xs">
              <CardContent className="p-4">
                <span className="text-xs font-medium text-slate-500">Total Records Processed</span>
                <p className="mt-1 text-2xl font-bold text-slate-900">{totalProcessed.toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card className="shadow-2xs">
              <CardContent className="p-4">
                <span className="text-xs font-medium text-slate-500">Rejected / Failed Records</span>
                <p className="mt-1 text-2xl font-bold text-rose-600">{totalFailed.toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card className="shadow-2xs">
              <CardContent className="p-4">
                <span className="text-xs font-medium text-slate-500">Active Integrated Sources</span>
                <p className="mt-1 text-2xl font-bold text-blue-600">{sources.length} Configured Sources</p>
              </CardContent>
            </Card>
          </div>

          {/* Integration Logs Table */}
          <Card className="shadow-2xs">
            <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <CardTitle className="text-base font-bold text-slate-900">Integration Audit Logs</CardTitle>
                <p className="text-xs text-slate-500">History of batch ETL runs, source volumes, and execution outcomes.</p>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              <DataTable
                columns={logColumns}
                data={logs}
                loading={loading}
                empty="No integration runs recorded yet."
              />
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 2: Change Data Capture (CDC) */}
      {activeTab === "cdc" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-purple-200 bg-purple-50/70 p-4 shadow-2xs">
            <h4 className="font-bold flex items-center gap-1.5 text-purple-950 text-xs mb-1">
              <Zap className="h-4 w-4 text-purple-700" />
              Change Data Capture (CDC) Engine
            </h4>
            <p className="text-xs text-purple-800 leading-relaxed">
              CDC records granular state mutations (INSERT, UPDATE, DELETE) directly as business transactions execute on inventory, sales, and shipments. Downstream consumers consume this stream without expensive polling or whole-table extracts.
            </p>
          </div>

          <Card className="shadow-2xs">
            <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <CardTitle className="text-base font-bold text-slate-900">Live CDC Event Log</CardTitle>
                <p className="text-xs text-slate-500">Showing recent database mutation events captured by the EDM CDC service.</p>
              </div>
              <Button size="sm" variant="outline" onClick={loadCdc} disabled={loadingCdc} className="cursor-pointer">
                <RefreshCw size={13} className={`mr-1 ${loadingCdc ? "animate-spin" : ""}`} /> Refresh Stream
              </Button>
            </CardHeader>
            <CardContent className="p-4">
              <DataTable
                columns={cdcColumns}
                data={cdcEvents}
                loading={loadingCdc}
                empty="No CDC events recorded yet. Perform a sale or inventory adjustment to generate events."
              />
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 3: Data Virtualization */}
      {activeTab === "virtualization" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 shadow-2xs">
            <h4 className="font-bold flex items-center gap-1.5 text-emerald-950 text-xs mb-1">
              <Activity className="h-4 w-4 text-emerald-700" />
              Real-Time Data Virtualization Layer
            </h4>
            <p className="text-xs text-emerald-800 leading-relaxed">
              Data virtualization creates a unified, federated query abstraction across disparate storage silos without physically copying or replicating rows. Below is a real-time virtualized view joining Central Warehouse physical stock with POS reservations and Online Storefront availability in single-query federation.
            </p>
          </div>

          {virtualSummary && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <Card className="shadow-2xs">
                <CardContent className="p-3 text-xs">
                  <span className="text-slate-400">Total Products Virtualized</span>
                  <p className="font-bold text-base text-slate-900">{Number(virtualSummary.total_products || 0)}</p>
                </CardContent>
              </Card>
              <Card className="shadow-2xs">
                <CardContent className="p-3 text-xs">
                  <span className="text-slate-400">Warehouse Stock Pool</span>
                  <p className="font-bold text-base text-slate-800">{Number(virtualSummary.total_warehouse_stock || 0)} units</p>
                </CardContent>
              </Card>
              <Card className="shadow-2xs">
                <CardContent className="p-3 text-xs">
                  <span className="text-slate-400">POS Channel Allocation</span>
                  <p className="font-bold text-base text-amber-700">{Number(virtualSummary.total_pos_reserved || 0)} units</p>
                </CardContent>
              </Card>
              <Card className="shadow-2xs">
                <CardContent className="p-3 text-xs">
                  <span className="text-slate-400">Online Channel Available</span>
                  <p className="font-bold text-base text-emerald-700">{Number(virtualSummary.total_online_available || 0)} units</p>
                </CardContent>
              </Card>
            </div>
          )}

          <Card className="shadow-2xs">
            <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <CardTitle className="text-base font-bold text-slate-900">Federated Multi-Channel Stock View</CardTitle>
                <p className="text-xs text-slate-500">Live virtualization query: POS + Central Warehouse + Storefront.</p>
              </div>
              <Button size="sm" variant="outline" onClick={loadVirtualization} disabled={loadingVirtual} className="cursor-pointer">
                <RefreshCw size={13} className={`mr-1 ${loadingVirtual ? "animate-spin" : ""}`} /> Refresh Virtual View
              </Button>
            </CardHeader>
            <CardContent className="p-4">
              <DataTable
                columns={virtualColumns}
                data={virtualizedStock}
                loading={loadingVirtual}
                empty="No virtualized inventory data available."
              />
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 4: REST API Order Simulator */}
      {activeTab === "simulator" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 shadow-2xs">
            <h4 className="font-bold flex items-center gap-1.5 text-blue-950 text-xs mb-1">
              <Send className="h-4 w-4 text-blue-700" />
              Simulate External Incoming Storefront Order
            </h4>
            <p className="text-xs text-blue-800 leading-relaxed">
              This simulator triggers a realistic inbound REST API order from an external storefront. It validates product SKU and stock in the MySQL database, decrements inventory atomically, writes to the central sales ledger, dispatches a 3PL logistics tracking number, and logs the integration outcome.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="shadow-2xs">
              <CardHeader className="pb-3 border-b border-slate-100">
                <CardTitle className="text-sm font-bold text-slate-900">Order Payload Parameters</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <form onSubmit={handleSimulateOrder} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Product SKU (leave blank for auto-pick first available)
                    </label>
                    <Input
                      placeholder="e.g. BEV-001 or GRO-002"
                      value={simSku}
                      onChange={(e) => setSimSku(e.target.value)}
                      className="text-xs"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Quantity</label>
                      <Input
                        type="number"
                        min="1"
                        max="20"
                        value={simQty}
                        onChange={(e) => setSimQty(Number(e.target.value))}
                        className="text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Method</label>
                      <select
                        value={simPayment}
                        onChange={(e) => setSimPayment(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800"
                      >
                        <option value="card">Credit / Debit Card</option>
                        <option value="ewallet">GCash / Maya e-Wallet</option>
                        <option value="cash">Cash on Delivery (COD)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Customer Email</label>
                    <Input
                      type="email"
                      value={simEmail}
                      onChange={(e) => setSimEmail(e.target.value)}
                      className="text-xs"
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={simulating}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white shadow-xs cursor-pointer"
                  >
                    <Send size={14} className={`mr-1.5 ${simulating ? "animate-spin" : ""}`} />
                    {simulating ? "Transacting Inbound Order..." : "Submit Real Order to Ingestion API"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card className="shadow-2xs">
              <CardHeader className="pb-3 border-b border-slate-100">
                <CardTitle className="text-sm font-bold text-slate-900">Ingestion Execution Result</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                {simResult ? (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 flex items-center gap-2 text-emerald-900 text-xs">
                      <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                      <div>
                        <strong>Order Successfully Ingested!</strong>
                        <p className="text-[11px] text-emerald-800">{String(simResult.message)}</p>
                      </div>
                    </div>

                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs space-y-2">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Transaction Ref:</span>
                        <span className="font-mono font-bold text-blue-700">
                          {String((simResult.order as Row)?.transaction_no || "-")}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Total Charged:</span>
                        <span className="font-bold text-slate-900">
                          {formatCurrency((simResult.order as Row)?.total)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">3PL Tracking Number:</span>
                        <span className="font-mono font-bold text-purple-700">
                          {String(simResult.tracking_number || "-")}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Logistics Carrier:</span>
                        <span className="font-medium text-slate-800">
                          {String(simResult.carrier || "-")}
                        </span>
                      </div>
                      <div className="flex justify-between border-t border-slate-200 pt-1.5">
                        <span className="text-slate-500">Stock Remaining in MySQL:</span>
                        <span className="font-mono font-bold text-emerald-700">
                          {String(simResult.stock_remaining ?? "-")} units
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="py-12 text-center text-xs text-slate-400">
                    <Boxes className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                    Configure order parameters and click submit to trigger real database ingestion.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Failed Records & Error Details Modal */}
      <Modal
        open={failedModalOpen}
        onClose={() => setFailedModalOpen(false)}
        title={`Failed Records Log #${failedLog?.id || ""}`}
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs rounded-lg border border-slate-100 bg-slate-50 p-3">
            <div>
              <span className="text-slate-400 block">Data Source</span>
              <strong className="text-slate-800">{failedLog?.source}</strong>
            </div>
            <div>
              <span className="text-slate-400 block">Failed Records</span>
              <strong className="text-rose-600">{failedLog?.records_failed} items</strong>
            </div>
            <div>
              <span className="text-slate-400 block">Timestamp</span>
              <span className="text-slate-600">{failedLog?.started_at ? formatDate(failedLog.started_at) : "-"}</span>
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
              <Terminal className="h-3.5 w-3.5 text-slate-500" /> Extracted Validation Errors & Stack
            </h4>
            <div className="rounded-lg border border-slate-200 bg-slate-900 p-3 font-mono text-xs text-emerald-400 max-h-60 overflow-y-auto">
              {loadingFailed ? (
                <p className="text-slate-400">Loading error inspection payload...</p>
              ) : failedDetails ? (
                <pre className="whitespace-pre-wrap">{JSON.stringify(failedDetails, null, 2)}</pre>
              ) : (
                <p className="text-slate-400">No raw error payload stored for this run.</p>
              )}
            </div>
          </div>

          <div className="mt-4 flex justify-between items-center border-t border-slate-100 pt-3">
            <Button
              size="sm"
              onClick={() => failedLog && retrySync(failedLog)}
              disabled={retryingLogId === failedLog?.id}
              className="bg-blue-600 hover:bg-blue-700 text-white shadow-xs cursor-pointer"
            >
              <RotateCcw className={`mr-1.5 h-3.5 w-3.5 ${retryingLogId === failedLog?.id ? "animate-spin" : ""}`} />
              Retry Failed Ingestion
            </Button>
            <Button variant="outline" size="sm" onClick={() => setFailedModalOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>

      {/* CDC Event Inspection Modal */}
      <Modal
        open={Boolean(inspectEvent)}
        onClose={() => setInspectEvent(null)}
        title={`CDC Mutation Event #${inspectEvent?.id || ""}`}
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs rounded-lg border border-slate-100 bg-slate-50 p-3">
            <div>
              <span className="text-slate-400 block">Entity</span>
              <strong className="text-slate-800">{inspectEvent?.entity}</strong>
            </div>
            <div>
              <span className="text-slate-400 block">Operation</span>
              <strong className="text-blue-700">{inspectEvent?.operation}</strong>
            </div>
            <div>
              <span className="text-slate-400 block">Record ID</span>
              <strong className="text-slate-900">#{inspectEvent?.entity_id}</strong>
            </div>
            <div>
              <span className="text-slate-400 block">Captured</span>
              <span className="text-slate-600">{inspectEvent?.captured_at ? formatDate(inspectEvent.captured_at) : "-"}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div>
              <h5 className="font-semibold text-slate-700 mb-1">Before Mutation Payload:</h5>
              <div className="rounded-lg bg-slate-900 p-2.5 font-mono text-[11px] text-amber-300 max-h-48 overflow-y-auto">
                {inspectEvent?.before_payload ? (
                  <pre className="whitespace-pre-wrap">{JSON.stringify(inspectEvent.before_payload, null, 2)}</pre>
                ) : (
                  <span className="text-slate-500 italic">None (INSERT operation)</span>
                )}
              </div>
            </div>
            <div>
              <h5 className="font-semibold text-slate-700 mb-1">After Mutation Payload:</h5>
              <div className="rounded-lg bg-slate-900 p-2.5 font-mono text-[11px] text-emerald-400 max-h-48 overflow-y-auto">
                {inspectEvent?.after_payload ? (
                  <pre className="whitespace-pre-wrap">{JSON.stringify(inspectEvent.after_payload, null, 2)}</pre>
                ) : (
                  <span className="text-slate-500 italic">None (DELETE operation)</span>
                )}
              </div>
            </div>
          </div>

          <div className="mt-4 flex justify-end border-t border-slate-100 pt-3">
            <Button variant="outline" size="sm" onClick={() => setInspectEvent(null)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>
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

function formatCurrency(v: unknown) {
  const n = Number(v ?? 0);
  if (Number.isNaN(n)) return "₱0.00";
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(n);
}
