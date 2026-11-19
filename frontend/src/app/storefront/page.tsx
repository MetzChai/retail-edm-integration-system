"use client";
import React, { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { normalizeList } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { DataTable, Column } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import {
  ShoppingCart, Package, CheckCircle2, Search, ArrowRight,
  RefreshCw, Store, CreditCard, User, Mail, Phone, MapPin, X,
  ShoppingBag, Check, ShieldCheck, Truck
} from "lucide-react";

type ProductRecord = {
  id: number;
  name: string;
  sku: string;
  price: number | string;
  status: string;
  category?: { id: number; name: string };
  inventory?: { quantity: number };
};

type CartItem = {
  product: ProductRecord;
  quantity: number;
};

type Row = Record<string, unknown>;

export default function StorefrontPage() {
  const { user, token } = useAuth();
  const { toast } = useToast();

  const isStaffOrAdmin = token && ["admin", "manager", "staff"].includes(String(user?.role || "").toLowerCase());

  // View toggle for staff/admins: 'shop' or 'orders'
  const [view, setView] = useState<"shop" | "orders">("shop");

  // Shop state
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Guest checkout form state
  const [checkoutName, setCheckoutName] = useState("");
  const [checkoutEmail, setCheckoutEmail] = useState("");
  const [checkoutPhone, setCheckoutPhone] = useState("");
  const [checkoutAddress, setCheckoutAddress] = useState("");
  const [checkoutPayment, setCheckoutPayment] = useState("card");
  const [checkoutNotes, setCheckoutNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [orderConfirmation, setOrderConfirmation] = useState<Record<string, unknown> | null>(null);

  // Orders table state (for staff/admin view)
  const [orders, setOrders] = useState<Row[]>([]);
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const [simulating, setSimulating] = useState(false);

  const handleUpdateStatus = async (orderId: number, newStatus: string) => {
    try {
      const res = await api.patch(`/sales/${orderId}/status`, { status: newStatus });
      if (res.ok) {
        toast(`Order status transitioned to ${newStatus}.`, "success");
        loadAdminOrders();
      } else {
        toast(res.error || "Failed to update order status.", "error");
      }
    } catch {
      toast("Error updating order status.", "error");
    }
  };

  // Load public products and categories
  const loadShopData = useCallback(async () => {
    setLoading(true);
    const [pRes, cRes] = await Promise.all([
      api.get<{ data?: ProductRecord[] }>("/storefront/products?per_page=50"),
      api.get<{ categories?: { id: number; name: string }[] }>("/storefront/categories"),
    ]);

    if (pRes.ok) {
      setProducts(normalizeList(pRes.data).items as ProductRecord[]);
    }
    if (cRes.ok && cRes.data) {
      const cats = (cRes.data as { categories?: { id: number; name: string }[] }).categories || [];
      setCategories(cats);
    }
    setLoading(false);
  }, []);

  // Load admin/staff orders view
  const loadAdminOrders = useCallback(async () => {
    if (!isStaffOrAdmin) return;
    const [oRes, stRes] = await Promise.all([
      api.get("/sales?source=online&per_page=20"),
      api.get("/data-sources"),
    ]);
    if (oRes.ok) setOrders(normalizeList(oRes.data).items as Row[]);
    if (stRes.ok) {
      const items = normalizeList(stRes.data).items as Row[];
      const onlineSource = items.find((s) => s.type === "OnlineStorefront") || null;
      setStatus(onlineSource);
    }
  }, [isStaffOrAdmin]);

  useEffect(() => {
    loadShopData();
  }, [loadShopData]);

  useEffect(() => {
    if (isStaffOrAdmin && view === "orders") {
      loadAdminOrders();
    }
  }, [isStaffOrAdmin, view, loadAdminOrders]);

  // Cart operations
  const addToCart = (product: ProductRecord) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
    toast(`Added "${product.name}" to cart`, "success");
    setCartOpen(true);
  };

  const updateCartQuantity = (productId: number, qty: number) => {
    if (qty <= 0) {
      setCart((prev) => prev.filter((item) => item.product.id !== productId));
    } else {
      setCart((prev) =>
        prev.map((item) => (item.product.id === productId ? { ...item, quantity: qty } : item))
      );
    }
  };

  const cartTotal = cart.reduce((sum, item) => {
    return sum + Number(item.product.price) * item.quantity;
  }, 0);

  // Submit guest checkout
  const handleGuestCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) {
      toast("Your cart is empty", "error");
      return;
    }
    if (!checkoutName.trim() || !checkoutEmail.trim() || !checkoutPhone.trim() || !checkoutAddress.trim()) {
      toast("Please fill in all required customer details", "error");
      return;
    }

    setSubmitting(true);
    const payload = {
      name: checkoutName.trim(),
      email: checkoutEmail.trim(),
      contact_number: checkoutPhone.trim(),
      delivery_address: checkoutAddress.trim(),
      payment_method: checkoutPayment,
      notes: checkoutNotes.trim() || undefined,
      items: cart.map((item) => ({
        product_id: item.product.id,
        quantity: item.quantity,
      })),
    };

    const res = await api.post<{ order_number?: string; sale?: Record<string, unknown>; message?: string }>("/storefront/checkout", payload);
    setSubmitting(false);

    if (res.ok && res.data) {
      setOrderConfirmation(res.data as Record<string, unknown>);
      setCart([]);
      toast("Order placed successfully!", "success");
      loadShopData();
    } else {
      toast(res.error || "Order placement failed", "error");
    }
  };

  // Advance 3PL shipment status
  const advanceShipment = async (shipmentId: number) => {
    try {
      const res = await api.post<{ message?: string; shipment?: { status?: string } }>(`/shipments/${shipmentId}/advance`, {});
      if (res.ok && res.data) {
        toast(res.data.message || `Shipment transitioned to ${res.data.shipment?.status}`, "success");
        loadAdminOrders();
      } else {
        toast(res.error || "Failed to advance shipment status.", "error");
      }
    } catch {
      toast("Error advancing shipment status.", "error");
    }
  };

  // Create 3PL shipment for order if missing
  const createShipmentForOrder = async (sale: Row) => {
    try {
      const cust = (sale.customer as Row) || {};
      const res = await api.post("/shipments", {
        sale_id: sale.id,
        logistics_provider: "LBC Express",
        recipient_name: cust.name || sale.customer_name || "Valued Customer",
        recipient_phone: cust.phone || "0917-000-0000",
        shipping_address: cust.address || "Metro Manila, Philippines",
      });
      if (res.ok) {
        toast("3PL Logistics shipment created and tracking number generated!", "success");
        loadAdminOrders();
      } else {
        toast(res.error || "Failed to create shipment.", "error");
      }
    } catch {
      toast("Error creating shipment.", "error");
    }
  };

  // Simulate order for staff view
  const simulateOrder = async () => {
    setSimulating(true);
    const activeProduct = products[0];
    if (activeProduct) {
      await api.post("/integration/online-order", {
        sku: activeProduct.sku,
        quantity: 1,
        customer_email: "simulated.customer@example.com",
        payment_method: "card",
      });
    }
    setSimulating(false);
    toast("Simulated storefront order generated with auto-assigned 3PL tracking!", "success");
    loadAdminOrders();
  };

  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase());
    const matchesCat =
      selectedCategory === "all" ||
      (p.category && String(p.category.id) === selectedCategory);
    return matchesSearch && matchesCat;
  });

  const orderColumns: Column<Row>[] = [
    { key: "transaction_no", label: "Transaction #", render: (r) => <span className="font-mono font-semibold text-blue-700">{String(r.transaction_no || r.id)}</span> },
    { key: "customer", label: "Customer", render: (r) => String((r.customer as Row)?.name || r.customer_name || "Guest Customer") },
    { key: "total", label: "Total", render: (r) => <span className="font-bold text-slate-900">{formatMoney(r.total || r.amount)}</span> },
    { key: "payment_method", label: "Payment", render: (r) => <span className="uppercase text-[11px] font-semibold text-slate-600">{String(r.payment_method || "card")}</span> },
    {
      key: "status",
      label: "Order Status",
      render: (r) => {
        const st = String(r.status || "completed").toLowerCase();
        return (
          <select
            value={st}
            onChange={(e) => handleUpdateStatus(Number(r.id), e.target.value)}
            className={`rounded-md border px-2 py-1 text-xs font-semibold capitalize cursor-pointer transition-colors ${
              st === "completed"
                ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                : st === "pending"
                ? "border-amber-300 bg-amber-50 text-amber-800"
                : st === "cancelled"
                ? "border-rose-300 bg-rose-50 text-rose-800"
                : "border-blue-300 bg-blue-50 text-blue-800"
            }`}
          >
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="processing">Processing</option>
            <option value="shipped">Shipped</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        );
      },
    },
    {
      key: "logistics",
      label: "3PL Logistics & Tracking",
      render: (r) => {
        const sh = r.shipment as Record<string, unknown> | null;
        if (!sh) {
          return (
            <Button
              size="sm"
              variant="outline"
              onClick={() => createShipmentForOrder(r)}
              className="h-6 text-[10px] px-2 text-blue-600 hover:bg-blue-50"
            >
              + Dispatch 3PL
            </Button>
          );
        }
        const st = String(sh.status || "pending");
        const statusColors: Record<string, string> = {
          pending: "bg-slate-100 text-slate-700 border-slate-200",
          ready_for_shipment: "bg-blue-50 text-blue-700 border-blue-200",
          shipped: "bg-indigo-50 text-indigo-700 border-indigo-200",
          in_transit: "bg-amber-50 text-amber-700 border-amber-200",
          out_for_delivery: "bg-purple-50 text-purple-700 border-purple-200",
          delivered: "bg-emerald-50 text-emerald-700 border-emerald-200",
          failed_delivery: "bg-rose-50 text-rose-700 border-rose-200",
          returned: "bg-red-100 text-red-800 border-red-300",
        };
        return (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-xs font-bold text-slate-800">{String(sh.tracking_number)}</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${statusColors[st] || "bg-slate-100 text-slate-700"}`}>
                {st.replace(/_/g, " ").toUpperCase()}
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1">
                <Truck size={12} className="text-slate-400" />
                {String(sh.logistics_provider)}
              </span>
              {st !== "delivered" && (
                <button
                  type="button"
                  onClick={() => advanceShipment(Number(sh.id))}
                  className="text-blue-600 hover:text-blue-800 font-semibold underline text-[10px] ml-2 cursor-pointer"
                  title="Simulate 3PL carrier status advance"
                >
                  Advance →
                </button>
              )}
            </div>
          </div>
        );
      },
    },
    { key: "created_at", label: "Received", render: (r) => <span className="text-xs text-slate-500 whitespace-nowrap">{formatDate(r.created_at)}</span> },
  ];

  return (
    <div className="space-y-6">
      {/* Unauthenticated Customer Banner (if not logged in) */}
      {!token && (
        <header className="flex items-center justify-between bg-white px-6 py-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white font-bold">
              <Store size={22} />
            </div>
            <div>
              <span className="font-display text-lg font-bold text-slate-900">Retail EDM Storefront</span>
              <p className="text-xs text-slate-500">Official Online Store • Guest Checkout Available</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCartOpen(true)}
              className="relative flex items-center gap-2 rounded-lg bg-blue-50 px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-100 transition-colors"
            >
              <ShoppingCart size={18} />
              <span>Cart ({cart.reduce((s, i) => s + i.quantity, 0)})</span>
            </button>
            <Link href="/login">
              <Button variant="outline" size="sm" className="text-xs">
                Staff / Admin Sign In
              </Button>
            </Link>
          </div>
        </header>
      )}

      {/* Staff / Admin Controls Header */}
      {isStaffOrAdmin && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Store className="text-blue-600" size={24} />
              Online Storefront & Orders
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Customers can browse products and checkout as guests. Monitor incoming orders below.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-slate-100 rounded-lg p-1 border border-slate-200">
              <button
                onClick={() => setView("shop")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  view === "shop" ? "bg-white text-blue-600 shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Customer Shop View
              </button>
              <button
                onClick={() => setView("orders")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  view === "orders" ? "bg-white text-blue-600 shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Incoming Online Orders
              </button>
            </div>
            {view === "orders" ? (
              <Button size="sm" onClick={simulateOrder} disabled={simulating}>
                <ShoppingBag size={14} className="mr-1" />
                {simulating ? "Simulating..." : "Simulate Incoming Order"}
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setCartOpen(true)}>
                <ShoppingCart size={14} className="mr-1" /> Cart ({cart.reduce((s, i) => s + i.quantity, 0)})
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Customer Shop View */}
      {view === "shop" && (
        <div className="space-y-6">
          {/* Shop Hero Card */}
          <div className="rounded-2xl bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-900 p-8 text-white shadow-sm relative overflow-hidden">
            <div className="absolute right-0 bottom-0 opacity-10 translate-x-8 translate-y-8">
              <Store size={220} />
            </div>
            <div className="relative z-10 max-w-xl">
              <span className="inline-flex items-center rounded-full bg-white/20 px-3 py-1 text-xs font-medium text-white backdrop-blur mb-3">
                <ShieldCheck size={13} className="mr-1" /> No Account Required • Instant Guest Checkout
              </span>
              <h2 className="text-3xl font-extrabold tracking-tight">Browse Products & Order Online</h2>
              <p className="mt-2 text-sm text-blue-100">
                Place your order with name, contact number, and delivery address. Fast shipping directly to your doorstep.
              </p>
            </div>
          </div>

          {/* Catalog Filter Controls */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="relative w-full sm:w-80">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search products by title or SKU..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 text-sm"
              />
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
              <button
                onClick={() => setSelectedCategory("all")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  selectedCategory === "all"
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                All Categories
              </button>
              {categories.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCategory(String(c.id))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                    selectedCategory === String(c.id)
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          {/* Product Cards Grid */}
          {loading ? (
            <div className="py-12 text-center text-slate-500">Loading catalog items...</div>
          ) : filteredProducts.length === 0 ? (
            <div className="py-12 text-center bg-white rounded-xl border border-slate-200 p-8">
              <Package size={36} className="mx-auto text-slate-400 mb-2" />
              <p className="text-slate-700 font-medium">No products found</p>
              <p className="text-xs text-slate-500 mt-1">Try modifying your search or filter criteria.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredProducts.map((p) => {
                const stockQty = p.inventory?.quantity ?? 0;
                const inStock = stockQty > 0;
                return (
                  <div
                    key={p.id}
                    className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:shadow-md"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-medium text-slate-500">
                          {p.category?.name || "Retail"}
                        </span>
                        <Badge variant={inStock ? "success" : "danger"}>
                          {inStock ? `${stockQty} in stock` : "Out of stock"}
                        </Badge>
                      </div>
                      <div className="h-28 flex items-center justify-center bg-slate-50 rounded-lg mb-4 text-blue-600">
                        <Package size={48} className="opacity-80" />
                      </div>
                      <h3 className="font-semibold text-slate-900 line-clamp-1">{p.name}</h3>
                      <p className="text-xs text-slate-400 mt-0.5">SKU: {p.sku}</p>
                    </div>

                    <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                      <div>
                        <span className="text-xs text-slate-500 block">Price</span>
                        <span className="text-lg font-bold text-slate-900">{formatMoney(p.price)}</span>
                      </div>
                      <Button
                        size="sm"
                        disabled={!inStock}
                        onClick={() => addToCart(p)}
                        className="bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
                      >
                        <ShoppingCart size={14} className="mr-1" /> Add
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Admin/Staff View: Incoming Online Orders */}
      {view === "orders" && isStaffOrAdmin && (
        <div className="space-y-6">
          {/* External Simulation Explanation Banner */}
          <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 text-xs text-blue-900 shadow-2xs">
            <h4 className="font-bold flex items-center gap-1.5 text-blue-950 mb-1">
              <Store className="h-4 w-4 text-blue-700" />
              Storefront Integration & External Order Simulation
            </h4>
            <p className="text-blue-800 leading-relaxed">
              Incoming orders simulate customer purchases made through an external e-commerce channel or the public storefront. Each order validates inventory in real time, reserves stock using atomic database transactions to prevent overselling, and links guest customer details without duplicate profile creation. Order status transitions (Pending → Confirmed → Processing → Shipped → Completed) preserve inventory consistency without multiple deductions.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Card>
              <CardContent className="p-5">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Channel Status</p>
                <p className="mt-1 font-bold text-lg text-emerald-600 flex items-center gap-1.5">
                  <Check size={16} /> Online Storefront Active
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Online Orders Received</p>
                <p className="mt-1 font-bold text-2xl text-slate-900">{orders.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Channel Revenue</p>
                <p className="mt-1 font-bold text-2xl text-blue-600">
                  {formatMoney(orders.reduce((acc, o) => acc + Number(o.total || o.amount || 0), 0))}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className="border border-slate-200">
            <CardHeader className="py-4 px-5 border-b border-slate-100">
              <CardTitle className="text-base font-semibold">Incoming Online Storefront Orders</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <DataTable columns={orderColumns} data={orders} loading={loading} empty="No online storefront orders recorded yet" />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Shopping Cart & Guest Checkout Drawer / Modal */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs transition-opacity">
          <div className="flex h-full w-full max-w-lg flex-col bg-white shadow-2xl p-6 overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div className="flex items-center gap-2">
                <ShoppingCart className="text-blue-600" size={20} />
                <h3 className="text-lg font-bold text-slate-900">Your Shopping Cart</h3>
              </div>
              <button
                onClick={() => setCartOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            {cart.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-12 text-center">
                <ShoppingBag size={48} className="text-slate-300 mb-3" />
                <p className="text-base font-semibold text-slate-700">Your cart is empty</p>
                <p className="text-xs text-slate-500 mt-1 max-w-xs">
                  Browse products and click "Add" to start a guest order.
                </p>
              </div>
            ) : (
              <div className="flex-1 flex flex-col justify-between py-4 space-y-6">
                {/* Cart Items List */}
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Order Items</h4>
                  <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto pr-1">
                    {cart.map((item) => (
                      <div key={item.product.id} className="flex items-center justify-between py-2.5">
                        <div className="flex-1 pr-3">
                          <p className="text-sm font-medium text-slate-900 line-clamp-1">{item.product.name}</p>
                          <p className="text-xs text-slate-500">{formatMoney(item.product.price)} each</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => updateCartQuantity(item.product.id, item.quantity - 1)}
                            className="h-6 w-6 rounded bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 text-xs"
                          >
                            -
                          </button>
                          <span className="text-sm font-medium w-4 text-center">{item.quantity}</span>
                          <button
                            onClick={() => updateCartQuantity(item.product.id, item.quantity + 1)}
                            className="h-6 w-6 rounded bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 text-xs"
                          >
                            +
                          </button>
                        </div>
                        <span className="text-sm font-semibold text-slate-900 w-20 text-right">
                          {formatMoney(Number(item.product.price) * item.quantity)}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="border-t border-slate-200 pt-3 flex justify-between items-center">
                    <span className="text-sm font-bold text-slate-700">Subtotal</span>
                    <span className="text-lg font-extrabold text-blue-600">{formatMoney(cartTotal)}</span>
                  </div>
                </div>

                {/* Guest Checkout Form */}
                <form onSubmit={handleGuestCheckout} className="space-y-3.5 border-t border-slate-200 pt-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      <User size={13} className="text-blue-600" /> Guest Customer Details
                    </h4>
                    <span className="text-[11px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-medium">
                      No account required
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Full Customer Name *</label>
                    <Input
                      required
                      placeholder="Jane Doe"
                      value={checkoutName}
                      onChange={(e) => setCheckoutName(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Email Address *</label>
                      <Input
                        required
                        type="email"
                        placeholder="jane@example.com"
                        value={checkoutEmail}
                        onChange={(e) => setCheckoutEmail(e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Contact Number *</label>
                      <Input
                        required
                        type="tel"
                        placeholder="+1 555-0199"
                        value={checkoutPhone}
                        onChange={(e) => setCheckoutPhone(e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Delivery Address *</label>
                    <Input
                      required
                      placeholder="House number, Street, City, Postal Code"
                      value={checkoutAddress}
                      onChange={(e) => setCheckoutAddress(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Payment Method</label>
                    <select
                      value={checkoutPayment}
                      onChange={(e) => setCheckoutPayment(e.target.value)}
                      className="w-full h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-800"
                    >
                      <option value="card">Credit / Debit Card</option>
                      <option value="cash">Cash on Delivery (COD)</option>
                      <option value="ewallet">eWallet / Mobile Pay</option>
                      <option value="bank_transfer">Direct Bank Transfer</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Order Notes (Optional)</label>
                    <Input
                      placeholder="Delivery instructions..."
                      value={checkoutNotes}
                      onChange={(e) => setCheckoutNotes(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={submitting}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 h-10 mt-2"
                  >
                    {submitting ? "Processing Guest Order..." : `Complete Guest Checkout (${formatMoney(cartTotal)})`}
                  </Button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Order Confirmation Dialog */}
      {orderConfirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl text-center space-y-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 mx-auto">
              <CheckCircle2 size={32} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900">Order Placed Successfully!</h3>
              <p className="text-xs text-slate-500 mt-1">Thank you for your purchase. Your order has been confirmed.</p>
            </div>

            <div className="rounded-xl bg-slate-50 p-4 text-left space-y-2 border border-slate-200 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Order Reference:</span>
                <span className="font-mono font-bold text-slate-900">{String(orderConfirmation.order_number || "-")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Customer Name:</span>
                <span className="font-medium text-slate-800">{checkoutName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Recipient Email:</span>
                <span className="font-medium text-slate-800">{checkoutEmail}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Contact Number:</span>
                <span className="font-medium text-slate-800">{checkoutPhone}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Delivery Address:</span>
                <span className="font-medium text-slate-800 text-right max-w-xs truncate">{checkoutAddress}</span>
              </div>
              {Boolean(orderConfirmation.tracking_number) && (
                <div className="flex justify-between pt-2 border-t border-slate-200">
                  <span className="text-blue-700 font-semibold">3PL Tracking #:</span>
                  <span className="font-mono font-bold text-blue-800">{String(orderConfirmation.tracking_number)}</span>
                </div>
              )}
              {Boolean(orderConfirmation.logistics_provider) && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Carrier:</span>
                  <span className="font-medium text-slate-800">{String(orderConfirmation.logistics_provider)}</span>
                </div>
              )}
            </div>

            <Button
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => {
                setOrderConfirmation(null);
                setCartOpen(false);
              }}
            >
              Continue Shopping
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatMoney(v: unknown) {
  const n = Number(v ?? 0);
  if (Number.isNaN(n)) return "₱0.00";
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(n);
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
