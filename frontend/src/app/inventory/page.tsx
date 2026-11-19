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
import { RefreshCw, ArrowDown, ArrowUp, Sliders, Warehouse, AlertTriangle, Info } from "lucide-react";

type Row = Record<string, unknown>;

export default function InventoryPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<Row[]>([]);
  const [movements, setMovements] = useState<Row[]>([]);
  const [products, setProducts] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"stock" | "movements" | "low" | "out">("stock");
  const [modal, setModal] = useState<"in" | "out" | "adjust" | null>(null);
  const [form, setForm] = useState({ product_id: "", quantity: "", notes: "", reference: "" });
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [inv, mv, pr] = await Promise.all([
        api.get("/inventory?per_page=50"),
        api.get("/inventory/movements?per_page=50"),
        api.get("/products?per_page=100"),
      ]);

      if (inv.ok) setItems(normalizeList(inv.data).items);
      if (mv.ok) setMovements(normalizeList(mv.data).items);
      if (pr.ok) setProducts(normalizeList(pr.data).items);
      if (inv.offline) toast("API offline or server unreachable.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const submit = async () => {
    if (!form.product_id || form.quantity === "") {
      toast("Please select a product and enter quantity.", "error");
      return;
    }

    const qty = Number(form.quantity);
    if (isNaN(qty) || qty < 0) {
      toast("Quantity must be a valid non-negative number.", "error");
      return;
    }

    setSaving(true);
    const path =
      modal === "in"
        ? "/inventory/stock-in"
        : modal === "out"
        ? "/inventory/stock-out"
        : "/inventory/adjust";

    const body = {
      product_id: Number(form.product_id),
      quantity: qty,
      notes: form.notes || null,
      reference: form.reference || (modal ? modal.toUpperCase() : "ADJ"),
    };

    const res = await api.post(path, body);
    setSaving(false);

    if (res.ok) {
      toast(
        modal === "in"
          ? "Stock added successfully."
          : modal === "out"
          ? "Stock deducted successfully."
          : "Stock quantity adjusted successfully.",
        "success"
      );
      setModal(null);
      setForm({ product_id: "", quantity: "", notes: "", reference: "" });
      load();
    } else {
      toast(res.error || "Stock operation failed.", "error");
    }
  };

  const filteredItems = items.filter((inv) => {
    const prod = inv.product as Record<string, unknown> | undefined;
    const name = String(prod?.name || "").toLowerCase();
    const sku = String(prod?.sku || "").toLowerCase();
    const s = search.toLowerCase();
    if (s && !name.includes(s) && !sku.includes(s)) return false;

    if (tab === "low") {
      const q = Number(inv.quantity ?? 0);
      const min = Number(inv.min_stock ?? 5);
      return q <= min && q > 0;
    }
    if (tab === "out") {
      return Number(inv.quantity ?? 0) === 0;
    }
    return true;
  });

  const lowStockCount = items.filter(
    (i) => Number(i.quantity ?? 0) <= Number(i.min_stock ?? 5) && Number(i.quantity ?? 0) > 0
  ).length;
  const outOfStockCount = items.filter((i) => Number(i.quantity ?? 0) === 0).length;

  const stockCols: Column<Row>[] = [
    {
      key: "sku",
      label: "SKU",
      render: (r) => {
        const prod = r.product as Record<string, unknown> | undefined;
        return <span className="font-mono text-xs font-semibold text-blue-700">{String(prod?.sku || "-")}</span>;
      },
    },
    {
      key: "name",
      label: "Product Name",
      render: (r) => {
        const prod = r.product as Record<string, unknown> | undefined;
        return (
          <div>
            <p className="font-semibold text-slate-900 leading-tight">{String(prod?.name || "Product #" + r.product_id)}</p>
            <span className="text-[11px] text-slate-400 capitalize">
              {(prod?.category as Record<string, unknown>)?.name ? String((prod?.category as Record<string, unknown>).name) : "General"}
            </span>
          </div>
        );
      },
    },
    {
      key: "quantity",
      label: "Available Stock",
      render: (r) => {
        const qty = Number(r.quantity ?? 0);
        const min = Number(r.min_stock ?? 5);
        if (qty === 0) return <Badge variant="danger">Out of Stock (0)</Badge>;
        if (qty <= min) return <Badge variant="warning">{qty} units (Low)</Badge>;
        return <Badge variant="success">{qty} units</Badge>;
      },
    },
    {
      key: "cost_price",
      label: "Unit Cost (Acquisition)",
      render: (r) => {
        const prod = r.product as Record<string, unknown> | undefined;
        return <span className="text-xs text-slate-700 font-medium">{formatMoney(prod?.cost_price ?? 0)}</span>;
      },
    },
    {
      key: "retail_price",
      label: "Retail Price (SRP)",
      render: (r) => {
        const prod = r.product as Record<string, unknown> | undefined;
        return <span className="text-xs text-blue-700 font-semibold">{formatMoney(prod?.price ?? 0)}</span>;
      },
    },
    {
      key: "valuation",
      label: "Warehouse Valuation (Cost)",
      render: (r) => {
        const prod = r.product as Record<string, unknown> | undefined;
        const cost = Number(prod?.cost_price ?? 0);
        const qty = Number(r.quantity ?? 0);
        return (
          <div>
            <span className="font-bold text-slate-900 text-xs block">{formatMoney(qty * cost)}</span>
            <span className="text-[10px] text-slate-400 block">{qty} × {formatMoney(cost)}</span>
          </div>
        );
      },
    },
    {
      key: "actions",
      label: "Stock Action",
      render: (r) => {
        const prod = r.product as Record<string, unknown> | undefined;
        return (
          <div className="flex gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setForm({ product_id: String(r.product_id), quantity: "", notes: "", reference: "" });
                setModal("in");
              }}
              className="h-7 px-2 text-[11px] text-emerald-700 hover:bg-emerald-50 border-emerald-200"
            >
              + In
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setForm({ product_id: String(r.product_id), quantity: "", notes: "", reference: "" });
                setModal("out");
              }}
              className="h-7 px-2 text-[11px] text-rose-700 hover:bg-rose-50 border-rose-200"
            >
              - Out
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setForm({ product_id: String(r.product_id), quantity: String(r.quantity ?? 0), notes: "", reference: "" });
                setModal("adjust");
              }}
              className="h-7 px-2 text-[11px] text-blue-700 hover:bg-blue-50 border-blue-200"
            >
              Set
            </Button>
          </div>
        );
      },
    },
  ];

  const moveCols: Column<Row>[] = [
    {
      key: "created_at",
      label: "Date & Time",
      render: (r) => <span className="text-slate-500 text-xs whitespace-nowrap">{formatDate(r.created_at)}</span>,
    },
    {
      key: "product",
      label: "Product / SKU",
      render: (r) => {
        const prod = r.product as Record<string, unknown> | undefined;
        return (
          <div>
            <p className="font-semibold text-slate-800 text-xs">{String(prod?.name || "Product #" + r.product_id)}</p>
            <code className="text-[10px] text-slate-400 font-mono">{String(prod?.sku || "")}</code>
          </div>
        );
      },
    },
    {
      key: "type",
      label: "Movement Type",
      render: (r) => {
        const typeStr = String(r.type || "").toLowerCase();
        if (typeStr.includes("in")) return <Badge variant="success">Stock In</Badge>;
        if (typeStr.includes("out")) return <Badge variant="danger">Stock Out</Badge>;
        return <Badge variant="info">Adjustment</Badge>;
      },
    },
    {
      key: "quantity",
      label: "Quantity",
      render: (r) => {
        const typeStr = String(r.type || "").toLowerCase();
        const prefix = typeStr.includes("in") ? "+" : typeStr.includes("out") ? "-" : "=";
        return (
          <span
            className={`font-bold font-mono text-xs ${
              typeStr.includes("in")
                ? "text-emerald-700"
                : typeStr.includes("out")
                ? "text-rose-700"
                : "text-blue-700"
            }`}
          >
            {prefix} {String(r.quantity)}
          </span>
        );
      },
    },
    {
      key: "reference",
      label: "Reference / Notes",
      render: (r) => (
        <div>
          <span className="font-mono text-xs font-medium text-slate-700">{String(r.reference || "-")}</span>
          {r.notes ? <p className="text-[11px] text-slate-400">{String(r.notes)}</p> : null}
        </div>
      ),
    },
    {
      key: "user",
      label: "Operator",
      render: (r) => {
        const usr = r.user as Record<string, unknown> | undefined;
        return <span className="text-xs text-slate-600">{String(usr?.name || "System Automated")}</span>;
      },
    },
  ];

  return (
    <div className="space-y-6">
      {/* Module Description Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-bold text-slate-900">Warehouse Inventory & Stock Movements</h1>
            <Badge variant="info">Single Source of Truth</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time stock ledger with atomic POS deduction, stock-in batches, and full movement audit trails.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="cursor-pointer">
            <RefreshCw size={14} className={`mr-1.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setForm({ product_id: "", quantity: "", notes: "", reference: "" });
              setModal("in");
            }}
            className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs cursor-pointer"
          >
            <ArrowDown size={14} className="mr-1.5" /> Stock In
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setForm({ product_id: "", quantity: "", notes: "", reference: "" });
              setModal("out");
            }}
            className="bg-rose-600 hover:bg-rose-700 text-white shadow-xs cursor-pointer"
          >
            <ArrowUp size={14} className="mr-1.5" /> Stock Out
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setForm({ product_id: "", quantity: "", notes: "", reference: "" });
              setModal("adjust");
            }}
            className="shadow-xs cursor-pointer"
          >
            <Sliders size={14} className="mr-1.5" /> Adjust Stock
          </Button>
        </div>
      </div>

      {/* Accounting Clarification Banner: Valuation vs Retail Price */}
      <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 shadow-2xs">
        <h4 className="font-bold flex items-center gap-1.5 text-blue-950 text-xs mb-1">
          <Info className="h-4 w-4 text-blue-700" />
          Why Warehouse Valuation (Cost) Differs from Retail Price (Selling Price)
        </h4>
        <p className="text-xs text-blue-800 leading-relaxed">
          Under standard retail accounting principles (IAS 2 / GAAP), warehouse stock is valued on the balance sheet at <strong>Wholesale Acquisition Cost</strong> (<code>Quantity × Unit Cost</code>), not at retail selling price, because commercial profit is only realized upon sale. In contrast, <strong>Retail Price (SRP)</strong> is what customers pay at checkout and includes your gross profit markup.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-2">
        <div className="flex gap-2">
          <button
            onClick={() => setTab("stock")}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
              tab === "stock"
                ? "bg-blue-600 text-white shadow-xs"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            Stock Monitor ({items.length})
          </button>
          <button
            onClick={() => setTab("movements")}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
              tab === "movements"
                ? "bg-blue-600 text-white shadow-xs"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            Movement History ({movements.length})
          </button>
          <button
            onClick={() => setTab("low")}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
              tab === "low"
                ? "bg-amber-600 text-white shadow-xs"
                : "bg-white text-amber-700 border border-amber-200 hover:bg-amber-50"
            }`}
          >
            Low Stock ({lowStockCount})
          </button>
          <button
            onClick={() => setTab("out")}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
              tab === "out"
                ? "bg-rose-600 text-white shadow-xs"
                : "bg-white text-rose-700 border border-rose-200 hover:bg-rose-50"
            }`}
          >
            Out of Stock ({outOfStockCount})
          </button>
        </div>

        {tab !== "movements" && (
          <Input
            placeholder="Search stock by SKU or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-64 text-xs"
          />
        )}
      </div>

      {/* Tables */}
      <Card className="shadow-2xs">
        <CardContent className="p-4">
          {tab === "movements" ? (
            <DataTable
              columns={moveCols}
              data={movements}
              loading={loading}
              empty="No inventory movement records found."
            />
          ) : (
            <DataTable
              columns={stockCols}
              data={filteredItems}
              loading={loading}
              empty={
                tab === "low"
                  ? "All products have adequate stock levels."
                  : tab === "out"
                  ? "No products are currently out of stock."
                  : "No inventory records match your criteria."
              }
            />
          )}
        </CardContent>
      </Card>

      {/* Stock Movement Modal (In / Out / Adjust) */}
      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={
          modal === "in"
            ? "Stock In (Restock Warehouse)"
            : modal === "out"
            ? "Stock Out (Remove / Spoilage)"
            : "Adjust Stock (Set Exact Count)"
        }
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            {modal === "in"
              ? "Add incoming inventory units to the central warehouse stock count."
              : modal === "out"
              ? "Deduct stock units for damaged goods, expired items, or warehouse transfers."
              : "Directly overwrite the current count with physical warehouse inventory audit results."}
          </p>

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">Target Product *</label>
              <select
                value={form.product_id}
                onChange={(e) => setForm({ ...form, product_id: e.target.value })}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 outline-hidden focus:border-blue-500 cursor-pointer"
              >
                <option value="">Select product to update</option>
                {products.map((p) => {
                  const currentStock = (p.inventory as Record<string, unknown>)?.quantity ?? p.stock ?? 0;
                  return (
                    <option key={String(p.id)} value={String(p.id)}>
                      {String(p.sku)} — {String(p.name)} (Current: {String(currentStock)} units)
                    </option>
                  );
                })}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                {modal === "adjust" ? "New Exact Stock Quantity *" : "Quantity to Transfer *"}
              </label>
              <Input
                type="number"
                min="0"
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                placeholder="Enter units count..."
                className="text-xs"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">Reference Number (Optional)</label>
              <Input
                value={form.reference}
                onChange={(e) => setForm({ ...form, reference: e.target.value })}
                placeholder="PO-1234, ADJ-AUDIT, etc."
                className="text-xs"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">Audit Notes / Reason</label>
              <Input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Supplier batch, damaged during transit, etc."
                className="text-xs"
              />
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-3">
            <Button variant="outline" size="sm" onClick={() => setModal(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={submit}
              disabled={saving}
              className={`text-white shadow-xs ${
                modal === "in"
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : modal === "out"
                  ? "bg-rose-600 hover:bg-rose-700"
                  : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {saving ? "Executing..." : "Confirm Movement"}
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

function formatMoney(v: unknown) {
  const n = Number(v ?? 0);
  if (Number.isNaN(n)) return "₱0.00";
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(n);
}
