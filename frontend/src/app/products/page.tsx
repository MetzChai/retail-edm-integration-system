"use client";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { normalizeList } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { DataTable, Column } from "@/components/ui/data-table";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, RefreshCw, AlertCircle, Package } from "lucide-react";

type Product = Record<string, unknown>;
type Category = { id: number; name: string; slug: string };

export default function ProductsPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

  const loadCategories = async () => {
    try {
      const res = await api.get<{ categories?: Category[] }>("/categories");
      if (res.ok && res.data) {
        const list = (res.data.categories || normalizeList(res.data).items) as Category[];
        setCategories(list);
      }
    } catch {
      // Ignore
    }
  };

  const load = async () => {
    setLoading(true);
    setDuplicateWarning(null);
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("per_page", "12");
    if (search) params.set("search", search);
    if (selectedCategory) params.set("category_id", selectedCategory);

    const res = await api.get(`/products?${params.toString()}`);
    if (res.ok) {
      const { items: list, meta } = normalizeList(res.data);
      setItems(list);
      const last = (meta?.last_page as number) || (meta?.total_pages as number);
      setTotalPages(last || 1);
    } else {
      toast(res.offline ? "API offline" : res.error || "Failed to load products", "error");
    }
    setLoading(false);
  };

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    load();
  }, [page, search, selectedCategory]);

  const openCreate = () => {
    setEditing(null);
    setDuplicateWarning(null);
    setForm({
      sku: "",
      barcode: "",
      name: "",
      description: "",
      category_id: categories[0]?.id ? String(categories[0].id) : "",
      price: "",
      cost_price: "",
      initial_stock: "0",
      min_stock: "5",
      unit: "pcs",
    });
    setModalOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setDuplicateWarning(null);
    const inv = p.inventory as Record<string, unknown> | undefined;
    setForm({
      sku: String(p.sku ?? ""),
      barcode: String(p.barcode ?? ""),
      name: String(p.name ?? ""),
      description: String(p.description ?? ""),
      category_id: String(p.category_id ?? (p.category as Record<string, unknown>)?.id ?? ""),
      price: String(p.price ?? ""),
      cost_price: String(p.cost_price ?? ""),
      initial_stock: String(inv?.quantity ?? p.stock ?? "0"),
      min_stock: String(inv?.min_stock ?? "5"),
      unit: String(p.unit ?? "pcs"),
    });
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.sku || !form.barcode || !form.name || !form.price) {
      toast("Please fill in all required product fields.", "error");
      return;
    }

    setSaving(true);
    setDuplicateWarning(null);

    const body = {
      sku: form.sku.trim(),
      barcode: form.barcode.trim(),
      name: form.name.trim(),
      description: form.description?.trim() || null,
      category_id: form.category_id ? Number(form.category_id) : undefined,
      price: Number(form.price),
      cost_price: form.cost_price ? Number(form.cost_price) : 0,
      initial_stock: Number(form.initial_stock || 0),
      min_stock: Number(form.min_stock || 5),
      unit: form.unit || "pcs",
    };

    const res = editing
      ? await api.put(`/products/${editing.id}`, body)
      : await api.post("/products", body);

    setSaving(false);

    if (res.ok) {
      toast(editing ? "Product updated successfully." : "Product created successfully.", "success");
      setModalOpen(false);
      load();
    } else {
      const msg = res.error || "Save failed.";
      if (
        msg.toLowerCase().includes("sku") ||
        msg.toLowerCase().includes("barcode") ||
        msg.toLowerCase().includes("duplicate") ||
        msg.toLowerCase().includes("already")
      ) {
        setDuplicateWarning(`Duplicate detected: ${msg}`);
      } else {
        toast(msg, "error");
      }
    }
  };

  const remove = async (p: Product) => {
    if (!confirm(`Are you sure you want to delete product "${p.name}"?`)) return;
    const res = await api.del(`/products/${p.id}`);
    if (res.ok) {
      toast("Product deleted successfully.", "success");
      load();
    } else {
      toast(res.error || "Delete failed.", "error");
    }
  };

  const columns: Column<Product>[] = [
    {
      key: "sku",
      label: "SKU",
      render: (r) => <span className="font-mono text-xs font-semibold text-blue-700">{String(r.sku)}</span>,
    },
    {
      key: "barcode",
      label: "Barcode",
      render: (r) => <span className="font-mono text-xs text-slate-500">{String(r.barcode || "-")}</span>,
    },
    {
      key: "name",
      label: "Product Name",
      render: (r) => (
        <div>
          <p className="font-semibold text-slate-900 leading-tight">{String(r.name)}</p>
          {r.description ? <p className="text-[11px] text-slate-400 line-clamp-1">{String(r.description)}</p> : null}
        </div>
      ),
    },
    {
      key: "category",
      label: "Category",
      render: (r) => {
        const cat = (r.category as Record<string, unknown>)?.name || r.category_name;
        return <Badge variant="muted">{String(cat || "General")}</Badge>;
      },
    },
    {
      key: "price",
      label: "Retail Price",
      render: (r) => <span className="font-bold text-slate-900">{formatMoney(r.price)}</span>,
    },
    {
      key: "stock",
      label: "Available Stock",
      render: (r) => {
        const inv = r.inventory as Record<string, unknown> | undefined;
        const qty = Number(inv?.quantity ?? r.quantity ?? r.stock ?? 0);
        const min = Number(inv?.min_stock ?? 5);

        if (qty === 0) {
          return <Badge variant="danger">Out of stock (0)</Badge>;
        }
        if (qty <= min) {
          return <Badge variant="warning">{qty} units (Low)</Badge>;
        }
        return <Badge variant="success">{qty} units</Badge>;
      },
    },
    {
      key: "actions",
      label: "Actions",
      render: (r) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => openEdit(r)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-blue-50 hover:text-blue-700 transition-colors"
            title="Edit Product"
          >
            <Pencil size={15} />
          </button>
          <button
            onClick={() => remove(r)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-700 transition-colors"
            title="Delete Product"
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
            <h1 className="font-display text-2xl font-bold text-slate-900">Product Catalogue</h1>
            <Badge variant="info">Master Data</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Maintain catalog items, barcode mapping, retail pricing, and synchronized warehouse stock levels.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="cursor-pointer">
            <RefreshCw size={14} className={`mr-1.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button size="sm" onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 text-white shadow-xs cursor-pointer">
            <Plus size={14} className="mr-1.5" /> Add Product
          </Button>
        </div>
      </div>

      <Card className="shadow-2xs">
        <CardContent className="p-4 space-y-4">
          {/* Filters */}
          <div className="flex flex-col gap-3 md:flex-row md:items-center justify-between">
            <div className="flex flex-1 flex-col sm:flex-row gap-2 max-w-lg">
              <Input
                placeholder="Search by name, SKU, or barcode..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="w-full text-xs"
              />
              <select
                value={selectedCategory}
                onChange={(e) => {
                  setSelectedCategory(e.target.value);
                  setPage(1);
                }}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 outline-hidden focus:border-blue-500 cursor-pointer"
              >
                <option value="">All Categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <span className="text-xs text-slate-400">
              Showing page {page} of {totalPages}
            </span>
          </div>

          <DataTable
            columns={columns}
            data={items}
            loading={loading}
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            empty="No products match your search criteria."
          />
        </CardContent>
      </Card>

      {/* Product Create / Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit Product Details" : "Register New Product"}>
        <div className="space-y-4">
          {duplicateWarning && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
              <div>
                <strong>Validation Conflict:</strong>
                <p className="mt-0.5">{duplicateWarning}</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="SKU (Stock Keeping Unit) *" value={form.sku || ""} onChange={(v) => setForm({ ...form, sku: v })} placeholder="e.g. ELEC-001" />
            <Field label="Barcode *" value={form.barcode || ""} onChange={(v) => setForm({ ...form, barcode: v })} placeholder="e.g. 890123456789" />

            <div className="md:col-span-2">
              <Field label="Product Name *" value={form.name || ""} onChange={(v) => setForm({ ...form, name: v })} placeholder="Official product display title" />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">Category *</label>
              <select
                value={form.category_id}
                onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 outline-hidden focus:border-blue-500 cursor-pointer"
              >
                <option value="">Select a category</option>
                {categories.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <Field label="Unit of Measure" value={form.unit || "pcs"} onChange={(v) => setForm({ ...form, unit: v })} placeholder="pcs, kg, box" />

            <Field label="Retail Selling Price (PHP) *" value={form.price || ""} onChange={(v) => setForm({ ...form, price: v })} type="number" placeholder="0.00" />
            <Field label="Cost Price (PHP)" value={form.cost_price || ""} onChange={(v) => setForm({ ...form, cost_price: v })} type="number" placeholder="0.00" />

            {!editing && (
              <Field label="Initial Stock Quantity" value={form.initial_stock || "0"} onChange={(v) => setForm({ ...form, initial_stock: v })} type="number" placeholder="0" />
            )}
            <Field label="Low Stock Alert Threshold" value={form.min_stock || "5"} onChange={(v) => setForm({ ...form, min_stock: v })} type="number" placeholder="5" />

            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-slate-700">Description</label>
              <textarea
                value={form.description || ""}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-800 outline-hidden focus:border-blue-500"
                rows={2}
                placeholder="Product specifications and catalog notes..."
              />
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-3">
            <Button variant="outline" size="sm" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={save} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white shadow-xs">
              {saving ? "Saving..." : editing ? "Update Product" : "Create Product"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder = "",
  className = "",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-xs font-semibold text-slate-700">{label}</label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type={type}
        placeholder={placeholder}
        className="text-xs"
      />
    </div>
  );
}

function formatMoney(v: unknown) {
  const n = Number(v ?? 0);
  if (Number.isNaN(n)) return "₱0.00";
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(n);
}
