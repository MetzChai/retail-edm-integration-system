"use client";

import React, { useEffect, useState } from "react";
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
  Plus,
  Pencil,
  Trash2,
  GitMerge,
  History,
  RefreshCw,
  Search,
  AlertTriangle,
  Receipt,
  ShoppingCart,
  Calendar,
  DollarSign,
  UserCheck,
  Sparkles,
  Tag,
  Copy,
  Check,
  Users,
  Crown,
  Gem,
  ShieldCheck,
  Clock,
  UserPlus,
  Filter,
  X,
} from "lucide-react";

type Row = Record<string, unknown>;

export default function CustomersPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<Row[] | null>(null);

  // Merge modal state
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeSource, setMergeSource] = useState<Row | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [merging, setMerging] = useState(false);

  // Purchase history modal state
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState<Row[]>([]);
  const [historyCustomer, setHistoryCustomer] = useState<Row | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Segment overview state
  const [segments, setSegments] = useState<Record<string, { count: number; total_spent: number }>>({});
  const [selectedTier, setSelectedTier] = useState<string | null>(null);

  // Personalized Offers modal state
  const [offersOpen, setOffersOpen] = useState(false);
  const [offersCustomer, setOffersCustomer] = useState<Row | null>(null);
  const [offersList, setOffersList] = useState<Row[]>([]);
  const [offersSummary, setOffersSummary] = useState<Record<string, unknown> | null>(null);
  const [offersLoading, setOffersLoading] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const loadSegments = async () => {
    try {
      const res = await api.get("/customers/segments");
      if (res.ok && res.data) {
        const d = res.data as { segments?: Record<string, unknown>; breakdown?: Record<string, number> };
        const segData = (d.segments || d.breakdown || (typeof d === "object" ? d : {})) as Record<string, { count: number; total_spent: number }>;
        setSegments(segData);
      }
    } catch {
      // Fallback handled by getTierStats
    }
  };

  const getTierStats = (tier: string) => {
    let val: unknown = segments[tier];
    if (!val && (tier === "At-Risk" || tier === "At-Risk / Lapsed")) {
      val = segments["At-Risk / Lapsed"] || segments["At-Risk"] || segments["At Risk"];
    }
    if (!val && (tier === "New Prospects" || tier === "New Prospect")) {
      val = segments["New Prospect"] || segments["New Prospects"] || segments["New"];
    }
    if (typeof val === "number") {
      return { count: val, total_spent: 0 };
    }
    if (val && typeof val === "object") {
      const obj = val as Record<string, unknown>;
      return {
        count: Number(obj.count ?? obj.total ?? 0),
        total_spent: Number(obj.total_spent ?? obj.spent ?? 0),
      };
    }
    // Fallback: calculate from currently loaded items if segments API response is pending
    if (items.length > 0) {
      const matching = items.filter((c) => {
        const seg = c.segment as Record<string, unknown> | undefined;
        const cTier = String(seg?.tier || "");
        if (tier === "At-Risk" || tier === "At-Risk / Lapsed") return cTier.includes("At-Risk") || cTier.includes("Lapsed");
        if (tier === "New Prospects" || tier === "New Prospect") return cTier.includes("Prospect") || cTier.includes("New");
        return cTier === tier;
      });
      if (matching.length > 0) {
        return {
          count: matching.length,
          total_spent: matching.reduce((sum, c) => sum + Number(c.total_spent || 0), 0),
        };
      }
    }
    return { count: 0, total_spent: 0 };
  };

  const load = async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), per_page: "12" });
    if (search) params.set("search", search);

    const res = await api.get(`/customers?${params.toString()}`);
    if (res.ok) {
      const { items: list, meta } = normalizeList(res.data);
      setItems(list);
      const last = (meta?.last_page as number) || (meta?.total_pages as number);
      setTotalPages(last || 1);
    } else {
      toast(res.offline ? "API offline" : res.error || "Failed to load customers", "error");
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    loadSegments();
  }, [page, search]);

  const openCreate = () => {
    setEditing(null);
    setDuplicateWarning(null);
    setForm({ name: "", email: "", phone: "", address: "", city: "", notes: "" });
    setModalOpen(true);
  };

  const openEdit = (c: Row) => {
    setEditing(c);
    setDuplicateWarning(null);
    setForm({
      name: String(c.name ?? ""),
      email: String(c.email ?? ""),
      phone: String(c.phone ?? ""),
      address: String(c.address ?? ""),
      city: String(c.city ?? ""),
      notes: String(c.notes ?? ""),
    });
    setModalOpen(true);
  };

  const save = async (force: boolean = false) => {
    if (!form.name.trim()) {
      toast("Customer name is required.", "error");
      return;
    }

    setSaving(true);
    setDuplicateWarning(null);

    const body: Record<string, unknown> = {
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
      city: form.city.trim() || null,
      notes: form.notes.trim() || null,
      force,
    };

    const res = editing
      ? await api.put(`/customers/${editing.id}`, body)
      : await api.post("/customers", body);

    setSaving(false);

    if (res.ok) {
      toast(editing ? "Customer profile updated." : "Customer account created.", "success");
      setModalOpen(false);
      load();
    } else if (res.status === 409) {
      const d = res.data as Record<string, unknown> | undefined;
      const dups = (d?.duplicates as Row[]) || [];
      setDuplicateWarning(dups);
      toast("Potential duplicate customer detected with same email or phone.", "error");
    } else {
      toast(res.error || "Save failed.", "error");
    }
  };

  const remove = async (c: Row) => {
    if (!confirm(`Are you sure you want to delete customer "${c.name}"?`)) return;
    const res = await api.del(`/customers/${c.id}`);
    if (res.ok) {
      toast("Customer deleted.", "success");
      load();
    } else {
      toast(res.error || "Cannot delete customer with purchase history.", "error");
    }
  };

  const openMerge = (c: Row) => {
    setMergeSource(c);
    setMergeTargetId("");
    setMergeOpen(true);
  };

  const executeMerge = async () => {
    if (!mergeSource || !mergeTargetId) {
      toast("Please select a primary customer to merge into.", "error");
      return;
    }

    setMerging(true);
    try {
      const res = await api.post(`/customers/${mergeSource.id}/merge`, {
        primary_id: Number(mergeTargetId),
      });

      if (res.ok) {
        toast("Customer records merged successfully. Transaction history combined.", "success");
        setMergeOpen(false);
        load();
      } else {
        toast(res.error || "Merge failed.", "error");
      }
    } finally {
      setMerging(false);
    }
  };

  const viewHistory = async (c: Row) => {
    setHistoryCustomer(c);
    setHistoryOpen(true);
    setHistoryLoading(true);
    try {
      const res = await api.get(`/customers/${c.id}/purchases`);
      if (res.ok && res.data) {
        const d = res.data as Record<string, unknown>;
        const rawPurchases = (d.purchases || d.sales || d) as Record<string, unknown>;
        setHistoryItems(normalizeList(rawPurchases).items);
      } else {
        setHistoryItems([]);
      }
    } finally {
      setHistoryLoading(false);
    }
  };

  const openOffers = async (c: Row) => {
    setOffersCustomer(c);
    setOffersOpen(true);
    setOffersLoading(true);
    setCopiedCode(null);
    try {
      const res = await api.get(`/customers/${c.id}/offers`);
      if (res.ok && res.data) {
        const d = res.data as Record<string, unknown>;
        setOffersList((d.offers as Row[]) || []);
        setOffersSummary((d.summary as Record<string, unknown>) || null);
      } else {
        setOffersList([]);
        setOffersSummary(null);
      }
    } finally {
      setOffersLoading(false);
    }
  };

  const copyPromo = (code: string) => {
    navigator.clipboard?.writeText(code);
    setCopiedCode(code);
    toast(`Promo code "${code}" copied to clipboard!`, "success");
    setTimeout(() => setCopiedCode(null), 2500);
  };

  const getSegmentBadge = (tier?: unknown) => {
    const t = String(tier || "New Prospect");
    switch (t) {
      case "VIP Platinum":
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-100 text-purple-800 border border-purple-200">★ VIP Platinum</span>;
      case "Loyal Gold":
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-200">◆ Loyal Gold</span>;
      case "Active Silver":
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-800 border border-blue-200">● Active Silver</span>;
      case "At-Risk / Lapsed":
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-800 border border-rose-200">⚠ At-Risk</span>;
      default:
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">○ New Prospect</span>;
    }
  };

  const columns: Column<Row>[] = [
    {
      key: "name",
      label: "Customer Name",
      render: (r) => (
        <div>
          <p className="font-semibold text-slate-900 leading-tight">{String(r.name)}</p>
          {r.city ? <span className="text-[11px] text-slate-400">{String(r.city)}</span> : null}
        </div>
      ),
    },
    {
      key: "segment_tier",
      label: "EDM Segment",
      render: (r) => getSegmentBadge(r.segment_tier),
    },
    {
      key: "contact",
      label: "Contact Details",
      render: (r) => (
        <div className="space-y-0.5 text-xs">
          <p className="text-slate-700">{String(r.email || "No email")}</p>
          <p className="text-slate-400 font-mono text-[11px]">{String(r.phone || "No phone")}</p>
        </div>
      ),
    },
    {
      key: "total_purchases",
      label: "Total Orders",
      render: (r) => {
        const count = Number(r.total_purchases ?? r.sales_count ?? 0);
        return (
          <span className="inline-flex items-center gap-1 font-semibold text-slate-800 text-xs">
            <Receipt className="h-3 w-3 text-slate-400" />
            {count} {count === 1 ? "order" : "orders"}
          </span>
        );
      },
    },
    {
      key: "total_spent",
      label: "Total Amount Spent",
      render: (r) => {
        const amt = Number(r.total_spent ?? 0);
        return <span className="font-bold text-slate-900 text-xs">{formatCurrency(amt)}</span>;
      },
    },
    {
      key: "latest_purchase_date",
      label: "Latest Purchase",
      render: (r) => {
        const dt = r.latest_purchase_date;
        return <span className="text-xs text-slate-500 whitespace-nowrap">{dt ? formatDate(dt) : "Never"}</span>;
      },
    },
    {
      key: "actions",
      label: "Actions",
      render: (r) => (
        <div className="flex items-center gap-1">
          <button
            onClick={() => openOffers(r)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-purple-600 hover:bg-purple-50 hover:text-purple-800 transition-colors"
            title="Personalized Offers (EDM)"
          >
            <Sparkles size={15} />
          </button>
          <button
            onClick={() => viewHistory(r)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
            title="View Purchase History"
          >
            <History size={15} />
          </button>
          <button
            onClick={() => openMerge(r)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-amber-50 hover:text-amber-700 transition-colors"
            title="Merge Duplicate Customer"
          >
            <GitMerge size={15} />
          </button>
          <button
            onClick={() => openEdit(r)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-blue-50 hover:text-blue-700 transition-colors"
            title="Edit Customer"
          >
            <Pencil size={15} />
          </button>
          <button
            onClick={() => remove(r)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-700 transition-colors"
            title="Delete Customer"
          >
            <Trash2 size={15} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Module Description Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-bold text-slate-900">CRM Customer Management</h1>
            <Badge variant="info">Master Records</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Unified customer profiles with transaction history, duplicate identification, and record merging.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="cursor-pointer">
            <RefreshCw size={14} className={`mr-1.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button size="sm" onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 text-white shadow-xs cursor-pointer">
            <Plus size={14} className="mr-1.5" /> Add Customer
          </Button>
        </div>
      </div>

      {/* Customer Segmentation Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {/* VIP Platinum Card */}
        <button
          type="button"
          onClick={() => setSelectedTier(selectedTier === "VIP Platinum" ? null : "VIP Platinum")}
          className={`group text-left rounded-xl border p-3.5 space-y-2 transition-all duration-200 cursor-pointer hover:-translate-y-0.5 hover:shadow-md ${
            selectedTier === "VIP Platinum"
              ? "border-purple-400 bg-purple-50 ring-2 ring-purple-500 shadow-md"
              : "border-purple-200/80 bg-gradient-to-br from-purple-50/70 to-white/90 hover:border-purple-300"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-purple-800">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-100 text-purple-700">
                <Crown size={12} />
              </span>
              VIP Platinum
            </span>
            <span className="font-extrabold text-sm text-purple-900 bg-purple-100/80 px-2 py-0.5 rounded-full">
              {getTierStats("VIP Platinum").count}
            </span>
          </div>
          <div>
            <p className="text-xs font-bold text-purple-900">
              {formatCurrency(getTierStats("VIP Platinum").total_spent)}
            </p>
            <p className="text-[10px] text-purple-600/90 font-medium mt-0.5">
              ₱5,000+ or 5+ orders • 20% offer
            </p>
          </div>
        </button>

        {/* Loyal Gold Card */}
        <button
          type="button"
          onClick={() => setSelectedTier(selectedTier === "Loyal Gold" ? null : "Loyal Gold")}
          className={`group text-left rounded-xl border p-3.5 space-y-2 transition-all duration-200 cursor-pointer hover:-translate-y-0.5 hover:shadow-md ${
            selectedTier === "Loyal Gold"
              ? "border-amber-400 bg-amber-50 ring-2 ring-amber-500 shadow-md"
              : "border-amber-200/80 bg-gradient-to-br from-amber-50/70 to-white/90 hover:border-amber-300"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-800">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                <Gem size={12} />
              </span>
              Loyal Gold
            </span>
            <span className="font-extrabold text-sm text-amber-900 bg-amber-100/80 px-2 py-0.5 rounded-full">
              {getTierStats("Loyal Gold").count}
            </span>
          </div>
          <div>
            <p className="text-xs font-bold text-amber-900">
              {formatCurrency(getTierStats("Loyal Gold").total_spent)}
            </p>
            <p className="text-[10px] text-amber-600/90 font-medium mt-0.5">
              ₱2,000+ or 3+ orders • 15% offer
            </p>
          </div>
        </button>

        {/* Active Silver Card */}
        <button
          type="button"
          onClick={() => setSelectedTier(selectedTier === "Active Silver" ? null : "Active Silver")}
          className={`group text-left rounded-xl border p-3.5 space-y-2 transition-all duration-200 cursor-pointer hover:-translate-y-0.5 hover:shadow-md ${
            selectedTier === "Active Silver"
              ? "border-blue-400 bg-blue-50 ring-2 ring-blue-500 shadow-md"
              : "border-blue-200/80 bg-gradient-to-br from-blue-50/70 to-white/90 hover:border-blue-300"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-800">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-blue-700">
                <ShieldCheck size={12} />
              </span>
              Active Silver
            </span>
            <span className="font-extrabold text-sm text-blue-900 bg-blue-100/80 px-2 py-0.5 rounded-full">
              {getTierStats("Active Silver").count}
            </span>
          </div>
          <div>
            <p className="text-xs font-bold text-blue-900">
              {formatCurrency(getTierStats("Active Silver").total_spent)}
            </p>
            <p className="text-[10px] text-blue-600/90 font-medium mt-0.5">
              Recent active • 10% repeat offer
            </p>
          </div>
        </button>

        {/* At-Risk Card */}
        <button
          type="button"
          onClick={() => setSelectedTier(selectedTier === "At-Risk / Lapsed" ? null : "At-Risk / Lapsed")}
          className={`group text-left rounded-xl border p-3.5 space-y-2 transition-all duration-200 cursor-pointer hover:-translate-y-0.5 hover:shadow-md ${
            selectedTier === "At-Risk / Lapsed"
              ? "border-rose-400 bg-rose-50 ring-2 ring-rose-500 shadow-md"
              : "border-rose-200/80 bg-gradient-to-br from-rose-50/70 to-white/90 hover:border-rose-300"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-800">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-100 text-rose-700">
                <Clock size={12} />
              </span>
              At-Risk
            </span>
            <span className="font-extrabold text-sm text-rose-900 bg-rose-100/80 px-2 py-0.5 rounded-full">
              {getTierStats("At-Risk / Lapsed").count}
            </span>
          </div>
          <div>
            <p className="text-xs font-bold text-rose-900">
              {formatCurrency(getTierStats("At-Risk / Lapsed").total_spent)}
            </p>
            <p className="text-[10px] text-rose-600/90 font-medium mt-0.5">
              No order 5+ days • 25% win-back
            </p>
          </div>
        </button>

        {/* New Prospects Card */}
        <button
          type="button"
          onClick={() => setSelectedTier(selectedTier === "New Prospect" ? null : "New Prospect")}
          className={`group text-left rounded-xl border p-3.5 space-y-2 transition-all duration-200 cursor-pointer hover:-translate-y-0.5 hover:shadow-md col-span-2 sm:col-span-1 ${
            selectedTier === "New Prospect"
              ? "border-slate-400 bg-slate-100 ring-2 ring-slate-500 shadow-md"
              : "border-slate-200/80 bg-gradient-to-br from-slate-50/80 to-white/90 hover:border-slate-300"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-800">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-slate-700">
                <UserPlus size={12} />
              </span>
              New Prospects
            </span>
            <span className="font-extrabold text-sm text-slate-900 bg-slate-200/80 px-2 py-0.5 rounded-full">
              {getTierStats("New Prospect").count}
            </span>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-900">
              {formatCurrency(getTierStats("New Prospect").total_spent)}
            </p>
            <p className="text-[10px] text-slate-500 font-medium mt-0.5">
              0 orders • 10% welcome + Free ship
            </p>
          </div>
        </button>
      </div>

      {/* Filter Indicator Banner */}
      {selectedTier && (
        <div className="flex items-center justify-between bg-blue-50/90 border border-blue-200 rounded-xl px-4 py-2.5 text-xs text-blue-900 shadow-xs">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-blue-600" />
            <span>
              Filtering customers by tier: <strong className="font-bold underline">{selectedTier}</strong> (showing {items.filter((r) => {
                const seg = r.segment as Record<string, unknown> | undefined;
                const tier = String(seg?.tier || "");
                if (selectedTier === "At-Risk / Lapsed") return tier.includes("At-Risk") || tier.includes("Lapsed");
                if (selectedTier === "New Prospect") return tier.includes("Prospect") || tier.includes("New");
                return tier === selectedTier;
              }).length} profiles)
            </span>
          </div>
          <button
            onClick={() => setSelectedTier(null)}
            className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:text-blue-900 hover:underline cursor-pointer"
          >
            <X className="h-3.5 w-3.5" /> Clear filter
          </button>
        </div>
      )}

      <Card className="shadow-xs border border-slate-200/80">
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="w-full sm:max-w-md">
              <Input
                placeholder="Search customers by name, email, or phone number..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="text-xs w-full"
              />
            </div>
            <span className="text-xs text-slate-400">
              Showing page {page} of {totalPages}
            </span>
          </div>

          <DataTable
            columns={columns}
            data={selectedTier ? items.filter((r) => {
              const seg = r.segment as Record<string, unknown> | undefined;
              const tier = String(seg?.tier || "");
              if (selectedTier === "At-Risk / Lapsed") return tier.includes("At-Risk") || tier.includes("Lapsed");
              if (selectedTier === "New Prospect") return tier.includes("Prospect") || tier.includes("New");
              return tier === selectedTier;
            }) : items}
            loading={loading}
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            empty="No customer profiles found."
          />
        </CardContent>
      </Card>

      {/* Customer Create / Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit Customer Details" : "New Customer Account"}>
        <div className="space-y-4">
          {duplicateWarning && duplicateWarning.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 space-y-2">
              <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <span>Potential Duplicate Customer Detected</span>
              </div>
              <p className="text-xs text-amber-800">
                Found matching records in MySQL with identical contact info:
              </p>
              <div className="divide-y divide-amber-200/60 rounded-lg border border-amber-200 bg-white p-2">
                {duplicateWarning.map((d) => (
                  <div key={String(d.id)} className="py-1.5 text-xs flex items-center justify-between">
                    <div>
                      <strong className="text-slate-800">{String(d.name)}</strong>
                      <span className="ml-2 text-slate-500 font-mono text-[11px]">{String(d.email || d.phone)}</span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setModalOpen(false);
                        openMerge(d);
                      }}
                      className="h-6 text-[11px] px-2"
                    >
                      Merge with this record
                    </Button>
                  </div>
                ))}
              </div>
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => save(true)}
                  className="text-xs text-amber-700 underline hover:text-amber-900 font-semibold cursor-pointer"
                >
                  Force create new customer anyway
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-slate-700">Full Name *</label>
              <Input
                value={form.name || ""}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Maria Santos"
                className="text-xs"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">Email Address</label>
              <Input
                type="email"
                value={form.email || ""}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="customer@example.com"
                className="text-xs"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">Phone Number</label>
              <Input
                value={form.phone || ""}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="0917-123-4567"
                className="text-xs"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">City / Province</label>
              <Input
                value={form.city || ""}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                placeholder="Makati, Metro Manila"
                className="text-xs"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">Delivery Address</label>
              <Input
                value={form.address || ""}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="Building, Street, Barangay"
                className="text-xs"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-slate-700">Internal CRM Notes</label>
              <textarea
                value={form.notes || ""}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-800 outline-hidden focus:border-blue-500"
                rows={2}
                placeholder="Special delivery instructions, VIP preferences..."
              />
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-3">
            <Button variant="outline" size="sm" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => save(false)} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white shadow-xs">
              {saving ? "Saving..." : editing ? "Update Profile" : "Register Customer"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Customer Record Merge Modal */}
      <Modal open={mergeOpen} onClose={() => setMergeOpen(false)} title="Merge Customer Records">
        <div className="space-y-4">
          <p className="text-xs text-slate-600">
            Combine duplicate profile <strong className="text-slate-900">{String(mergeSource?.name)}</strong> (ID #{String(mergeSource?.id)}) into an authoritative primary customer. All past POS and online transactions will be linked to the primary profile.
          </p>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">Select Primary Customer Record *</label>
            <select
              value={mergeTargetId}
              onChange={(e) => setMergeTargetId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 outline-hidden focus:border-blue-500 cursor-pointer"
            >
              <option value="">Choose primary target...</option>
              {items
                .filter((c) => c.id !== mergeSource?.id)
                .map((c) => (
                  <option key={String(c.id)} value={String(c.id)}>
                    #{String(c.id)} — {String(c.name)} ({String(c.email || c.phone || "No contact")})
                  </option>
                ))}
            </select>
          </div>

          <div className="rounded-lg bg-blue-50 p-3 text-xs text-blue-900">
            <strong>What happens during merge:</strong>
            <ul className="list-disc list-inside mt-1 space-y-0.5 text-blue-800">
              <li>All historical sales transactions are reassigned to the primary customer.</li>
              <li>Missing email, phone, or address details are backfilled into the primary account.</li>
              <li>The duplicate record is flagged as merged and hidden from active lists.</li>
            </ul>
          </div>

          <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-3">
            <Button variant="outline" size="sm" onClick={() => setMergeOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={executeMerge} disabled={merging || !mergeTargetId} className="bg-amber-600 hover:bg-amber-700 text-white shadow-xs">
              {merging ? "Merging Records..." : "Confirm & Execute Merge"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Purchase History Modal */}
      <Modal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title={`Purchase Ledger: ${String(historyCustomer?.name || "Customer")}`}
      >
        <div className="space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 flex flex-wrap items-center justify-between text-xs gap-2">
            <div>
              <span className="text-slate-400 block">Customer</span>
              <strong className="text-slate-800">{String(historyCustomer?.name)}</strong>
            </div>
            <div>
              <span className="text-slate-400 block">Email / Phone</span>
              <span className="text-slate-700">{String(historyCustomer?.email || historyCustomer?.phone || "N/A")}</span>
            </div>
            <div>
              <span className="text-slate-400 block">Total Lifetime Purchases</span>
              <strong className="text-blue-700">{formatCurrency(historyCustomer?.total_spent ?? 0)}</strong>
            </div>
          </div>

          {historyLoading ? (
            <div className="py-8 text-center text-xs text-slate-400">Loading purchase transactions...</div>
          ) : historyItems.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">No purchase records found for this customer.</div>
          ) : (
            <div className="space-y-3">
              {historyItems.map((tx) => {
                const itemsList = (tx.items as Record<string, unknown>[]) || [];
                return (
                  <div key={String(tx.id)} className="rounded-xl border border-slate-200 p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-blue-700">#{String(tx.transaction_no)}</span>
                        <Badge variant="muted">{String(tx.source || "POS").toUpperCase()}</Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400 text-[11px]">{formatDate(tx.created_at)}</span>
                        <strong className="text-slate-900 font-bold">{formatCurrency(tx.total)}</strong>
                      </div>
                    </div>

                    {/* Items breakdown */}
                    <div className="divide-y divide-slate-100 text-xs">
                      {itemsList.map((item, idx) => {
                        const prod = item.product as Record<string, unknown> | undefined;
                        return (
                          <div key={idx} className="py-1 flex items-center justify-between text-[11px]">
                            <span className="text-slate-700 truncate max-w-[220px]">
                              {String(prod?.name || item.name || "Product")} × {String(item.quantity)}
                            </span>
                            <span className="text-slate-900 font-semibold">{formatCurrency(item.subtotal || item.price)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-4 flex justify-end border-t border-slate-100 pt-3">
            <Button variant="outline" size="sm" onClick={() => setHistoryOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>

      {/* Personalized Offers Modal */}
      <Modal
        open={offersOpen}
        onClose={() => setOffersOpen(false)}
        title={`Personalized Offers: ${String(offersCustomer?.name || "Customer")}`}
      >
        <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
          {/* Customer Profile Summary */}
          <div className="rounded-xl border border-purple-200 bg-gradient-to-r from-purple-50 to-indigo-50 p-3.5 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 text-sm">{String(offersCustomer?.name)}</span>
                {getSegmentBadge(offersCustomer?.segment_tier)}
              </div>
              <span className="font-semibold text-purple-700">
                Lifetime: {formatCurrency(offersCustomer?.total_spent ?? 0)} ({Number(offersCustomer?.total_purchases ?? 0)} orders)
              </span>
            </div>
            {offersSummary && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px] border-t border-purple-200/60">
                <span className="text-slate-500">Preferred Categories:</span>
                {((offersSummary.preferred_categories as string[]) || []).length > 0 ? (
                  ((offersSummary.preferred_categories as string[]) || []).map((cat, i) => (
                    <span key={i} className="px-2 py-0.5 rounded-md bg-white border border-purple-200 text-purple-800 font-medium">
                      {cat}
                    </span>
                  ))
                ) : (
                  <span className="text-slate-400 italic">No category history yet</span>
                )}
                <span className="text-slate-400 ml-auto">
                  AOV: {formatCurrency(offersSummary.average_order_value ?? 0)}
                </span>
              </div>
            )}
          </div>

          {/* Offers list */}
          {offersLoading ? (
            <div className="py-8 text-center text-xs text-slate-400">
              <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-purple-600" />
              Analyzing purchase history and generating EDM personalized offers...
            </div>
          ) : offersList.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              No personalized offers available at this moment.
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-purple-600" />
                Active Personalized Offers for this Customer:
              </p>
              {offersList.map((offer, idx) => (
                <div key={idx} className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2 hover:border-purple-300 transition-colors shadow-2xs">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-slate-900 text-xs">{String(offer.title)}</h4>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800">
                          {offer.discount_type === "percentage" ? `${offer.discount_value}% OFF` : `₱${offer.discount_value} OFF`}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5">{String(offer.description)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyPromo(String(offer.promo_code))}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-purple-200 bg-purple-50 text-purple-700 font-mono text-xs font-bold hover:bg-purple-100 transition-colors cursor-pointer"
                      title="Click to copy promo code"
                    >
                      {copiedCode === offer.promo_code ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                          <span className="text-emerald-700">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" />
                          <span>{String(offer.promo_code)}</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* EDM Rationale & Validity */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-[11px]">
                    <span className="inline-flex items-center gap-1 text-slate-500 italic">
                      <Tag className="h-3 w-3 text-purple-400" />
                      {String(offer.reason)}
                    </span>
                    <span className="text-slate-400">Valid until: {String(offer.valid_until)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 flex justify-end border-t border-slate-100 pt-3">
            <Button variant="outline" size="sm" onClick={() => setOffersOpen(false)}>
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
