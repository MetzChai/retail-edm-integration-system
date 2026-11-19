"use client";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { normalizeList } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import {
  ShoppingCart,
  Plus,
  Trash2,
  Receipt,
  User,
  CreditCard,
  Printer,
  CheckCircle2,
  AlertTriangle,
  Search,
  Sparkles,
  Tag,
} from "lucide-react";

type Product = Record<string, unknown>;
type Customer = { id: number; name: string; email?: string; phone?: string };
type CartItem = { product: Product; quantity: number };

export default function POSPage() {
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchFilter, setSearchFilter] = useState("");
  const [selectedProduct, setSelectedProduct] = useState("");
  const [qty, setQty] = useState("1");
  const [discountAmount, setDiscountAmount] = useState<string>("0");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [customerId, setCustomerId] = useState("");
  const [customerOffers, setCustomerOffers] = useState<Array<{ title: string; code: string; discount_percent?: number; fixed_discount?: number }> | null>(null);
  const [receipt, setReceipt] = useState<Record<string, unknown> | null>(null);
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    const [pRes, cRes] = await Promise.all([
      api.get("/products?per_page=200&status=active"),
      api.get("/customers?per_page=100&active_only=1"),
    ]);

    if (pRes.ok) setProducts(normalizeList(pRes.data).items);
    if (cRes.ok) setCustomers(normalizeList(cRes.data).items as Customer[]);
  };

  useEffect(() => {
    loadData();
  }, []);

  // Fetch personalized offers when a customer profile is selected
  useEffect(() => {
    if (!customerId) {
      setCustomerOffers(null);
      return;
    }
    const fetchOffers = async () => {
      try {
        const res = await api.get<{ offers?: Array<{ title: string; code: string; discount_percent?: number; fixed_discount?: number }> }>(
          `/customers/${customerId}/offers`
        );
        if (res.ok && res.data?.offers) {
          setCustomerOffers(res.data.offers);
        } else {
          setCustomerOffers(null);
        }
      } catch {
        setCustomerOffers(null);
      }
    };
    fetchOffers();
  }, [customerId]);

  const addToCart = () => {
    const p = products.find((x) => String(x.id) === selectedProduct);
    if (!p) {
      toast("Please select a product first.", "error");
      return;
    }

    const q = Math.max(1, Number(qty) || 1);
    const inv = p.inventory as Record<string, unknown> | undefined;
    const availableStock = Number(inv?.quantity ?? p.stock ?? 0);

    const existing = cart.find((c) => String(c.product.id) === selectedProduct);
    const existingQty = existing ? existing.quantity : 0;

    if (existingQty + q > availableStock) {
      toast(
        `Insufficient inventory for "${p.name}". Available: ${availableStock}, in cart: ${existingQty}.`,
        "error"
      );
      return;
    }

    if (existing) {
      setCart(cart.map((c) => (c === existing ? { ...c, quantity: c.quantity + q } : c)));
    } else {
      setCart([...cart, { product: p, quantity: q }]);
    }

    setSelectedProduct("");
    setQty("1");
    toast(`Added "${p.name}" to cart.`, "success");
  };

  const removeItem = (id: unknown) =>
    setCart(cart.filter((c) => String(c.product.id) !== String(id)));

  const updateQty = (id: unknown, newQ: number) => {
    const item = cart.find((c) => String(c.product.id) === String(id));
    if (!item) return;

    const inv = item.product.inventory as Record<string, unknown> | undefined;
    const availableStock = Number(inv?.quantity ?? item.product.stock ?? 0);

    if (newQ > availableStock) {
      toast(`Cannot exceed available stock of ${availableStock} units.`, "error");
      return;
    }

    setCart(
      cart.map((c) =>
        String(c.product.id) === String(id) ? { ...c, quantity: Math.max(1, newQ) } : c
      )
    );
  };

  const subtotal = cart.reduce(
    (sum, c) => sum + Number(c.product.price ?? 0) * c.quantity,
    0
  );

  const discount = Math.min(subtotal, Math.max(0, Number(discountAmount) || 0));
  const total = Math.max(0, subtotal - discount);

  const applyOfferDiscount = (offer: { discount_percent?: number; fixed_discount?: number; code: string }) => {
    if (offer.discount_percent) {
      const calc = (subtotal * offer.discount_percent) / 100;
      setDiscountAmount(calc.toFixed(2));
      toast(`Applied ${offer.discount_percent}% discount code [${offer.code}]!`, "success");
    } else if (offer.fixed_discount) {
      setDiscountAmount(String(offer.fixed_discount));
      toast(`Applied ₱${offer.fixed_discount} credit discount code [${offer.code}]!`, "success");
    }
  };

  const checkout = async () => {
    if (cart.length === 0) {
      toast("Cart is empty.", "error");
      return;
    }

    setSaving(true);
    const body = {
      customer_id: customerId ? Number(customerId) : null,
      payment_method: paymentMethod,
      source: "pos",
      discount,
      items: cart.map((c) => ({
        product_id: c.product.id,
        quantity: c.quantity,
        price: c.product.price,
      })),
      total,
    };

    const res = await api.post<{ message?: string; sale?: Record<string, unknown> }>("/sales", body);
    setSaving(false);

    if (res.ok) {
      toast("POS Transaction completed and inventory deducted.", "success");
      const d = (res.data || {}) as Record<string, unknown>;
      setReceipt((d.sale || d) as Record<string, unknown>);
      setCart([]);
      setDiscountAmount("0");
      loadData(); // Reload inventory counts
    } else {
      toast(res.error || "Checkout failed.", "error");
    }
  };

  // Filter products by search term
  const filteredProducts = products.filter((p) => {
    const s = searchFilter.toLowerCase();
    if (!s) return true;
    return (
      String(p.name || "").toLowerCase().includes(s) ||
      String(p.sku || "").toLowerCase().includes(s) ||
      String(p.barcode || "").toLowerCase().includes(s)
    );
  });

  return (
    <div className="space-y-6">
      {/* Module Description Header */}
      <div className="border-b border-slate-200 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-bold text-slate-900">Point of Sale (POS)</h1>
            <Badge variant="info">Live Checkout Till</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Process counter sales with live product search, personalized loyalty discounts, and atomic warehouse deduction.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Column: Product Selector & Cart */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="shadow-2xs">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <ShoppingCart className="h-4 w-4 text-blue-600" /> Search & Select Products
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-3">
              {/* Product Live Search Bar */}
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="Instant search by product name, SKU, or barcode..."
                  className="pl-9 text-xs"
                />
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <select
                  value={selectedProduct}
                  onChange={(e) => setSelectedProduct(e.target.value)}
                  className="w-full sm:flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 outline-hidden focus:border-blue-500 cursor-pointer"
                >
                  <option value="">Choose matching item to add...</option>
                  {filteredProducts.map((p) => {
                    const inv = p.inventory as Record<string, unknown> | undefined;
                    const availableQty = Number(inv?.quantity ?? p.stock ?? 0);
                    const isOutOfStock = availableQty <= 0;
                    return (
                      <option key={String(p.id)} value={String(p.id)} disabled={isOutOfStock}>
                        {String(p.name)} ({String(p.sku)}) — {formatMoney(p.price)} [
                        {isOutOfStock ? "OUT OF STOCK" : `${availableQty} in stock`}]
                      </option>
                    );
                  })}
                </select>

                <div className="flex gap-2">
                  <Input
                    type="number"
                    min="1"
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    className="w-20 text-xs text-center"
                    placeholder="Qty"
                  />
                  <Button
                    onClick={addToCart}
                    disabled={!selectedProduct}
                    className="bg-blue-600 hover:bg-blue-700 text-white shadow-xs cursor-pointer text-xs"
                  >
                    <Plus size={14} className="mr-1" /> Add
                  </Button>
                </div>
              </div>

              {/* Quick Tap Product Grid */}
              <div className="pt-1 border-t border-slate-100">
                <p className="text-[11px] font-semibold text-slate-500 mb-2">Quick Item Tap (Click card to add directly):</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-48 overflow-y-auto pr-1">
                  {filteredProducts.slice(0, 8).map((p) => {
                    const inv = p.inventory as Record<string, unknown> | undefined;
                    const stock = Number(inv?.quantity ?? p.stock ?? 0);
                    const out = stock <= 0;
                    return (
                      <button
                        key={String(p.id)}
                        type="button"
                        disabled={out}
                        onClick={() => {
                          const existing = cart.find((c) => c.product.id === p.id);
                          const curQty = existing ? existing.quantity : 0;
                          if (curQty + 1 > stock) {
                            toast(`Cannot add more than ${stock} available units.`, "error");
                            return;
                          }
                          if (existing) {
                            setCart(cart.map((c) => (c.product.id === p.id ? { ...c, quantity: c.quantity + 1 } : c)));
                          } else {
                            setCart([...cart, { product: p, quantity: 1 }]);
                          }
                          toast(`Added ${String(p.name)} to cart.`);
                        }}
                        className={`text-left p-2.5 rounded-lg border text-xs transition-all duration-150 ${
                          out
                            ? "bg-slate-50 border-slate-200 opacity-50 cursor-not-allowed"
                            : "bg-white border-slate-200/90 hover:border-blue-500 hover:bg-blue-50/40 hover:shadow-xs cursor-pointer"
                        }`}
                      >
                        <p className="font-semibold text-slate-800 truncate leading-tight">{String(p.name)}</p>
                        <div className="mt-1 flex items-center justify-between text-[11px]">
                          <span className="font-bold text-blue-600">{formatMoney(p.price)}</span>
                          <span className={`text-[10px] font-medium ${out ? "text-rose-500 font-semibold" : "text-slate-400 font-mono"}`}>
                            {out ? "Out of Stock" : `${stock} left`}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Cart Table */}
          <Card className="shadow-2xs">
            <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-bold text-slate-900">Current Cart Ledger</CardTitle>
              <Badge variant="muted">{cart.length} item{cart.length === 1 ? "" : "s"}</Badge>
            </CardHeader>
            <CardContent className="p-4">
              {cart.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  Cart is currently empty. Search and select products above to begin a transaction.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {cart.map((c) => {
                    const price = Number(c.product.price ?? 0);
                    const itemSubtotal = price * c.quantity;
                    return (
                      <div
                        key={String(c.product.id)}
                        className="flex items-center justify-between py-3 text-xs"
                      >
                        <div className="flex-1 pr-4">
                          <p className="font-semibold text-slate-900 leading-tight">
                            {String(c.product.name)}
                          </p>
                          <p className="text-[11px] text-slate-400 font-mono">
                            SKU: {String(c.product.sku)} • {formatMoney(price)} each
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => updateQty(c.product.id, c.quantity - 1)}
                            className="h-7 w-7 rounded-md bg-slate-100 text-slate-700 font-bold hover:bg-slate-200"
                          >
                            -
                          </button>
                          <span className="w-8 text-center font-bold text-slate-900">
                            {c.quantity}
                          </span>
                          <button
                            onClick={() => updateQty(c.product.id, c.quantity + 1)}
                            className="h-7 w-7 rounded-md bg-slate-100 text-slate-700 font-bold hover:bg-slate-200"
                          >
                            +
                          </button>
                        </div>

                        <span className="w-24 text-right font-bold text-slate-900 text-xs">
                          {formatMoney(itemSubtotal)}
                        </span>

                        <button
                          onClick={() => removeItem(c.product.id)}
                          className="ml-3 text-slate-400 hover:text-rose-600 transition-colors"
                          title="Remove item"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Checkout Summary, Discounts & Payment */}
        <div className="space-y-4">
          <Card className="shadow-2xs">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <CreditCard className="h-4 w-4 text-emerald-600" /> Checkout & Payment
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Customer Profile (CRM Link)
                </label>
                <select
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 outline-hidden focus:border-blue-500 cursor-pointer"
                >
                  <option value="">Guest Walk-in Customer</option>
                  {customers.map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      {c.name} {c.phone ? `(${c.phone})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* Personalized Loyalty Offers Banner if Customer Selected */}
              {customerOffers && customerOffers.length > 0 && (
                <div className="rounded-xl border border-purple-200 bg-purple-50/70 p-3 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-purple-950">
                    <Sparkles className="h-3.5 w-3.5 text-purple-600" />
                    <span>Personalized Offers Available</span>
                  </div>
                  <div className="space-y-1.5">
                    {customerOffers.slice(0, 2).map((offer, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between rounded-lg bg-white p-2 border border-purple-100 text-xs"
                      >
                        <div className="min-w-0 pr-2">
                          <p className="font-semibold text-slate-800 truncate">{offer.title}</p>
                          <span className="font-mono text-[10px] text-purple-700 font-bold">{offer.code}</span>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => applyOfferDiscount(offer)}
                          className="h-6 px-2 text-[10px] text-purple-700 border-purple-200 hover:bg-purple-50"
                        >
                          Apply
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Discount Input Field */}
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Tag size={13} className="text-slate-500" /> Transaction Discount (₱)
                  </span>
                  {discount > 0 && <span className="text-[11px] font-bold text-emerald-600">Saved: {formatMoney(discount)}</span>}
                </label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={discountAmount}
                  onChange={(e) => setDiscountAmount(e.target.value)}
                  className="text-xs"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Payment Tender</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 outline-hidden focus:border-blue-500 cursor-pointer"
                >
                  <option value="cash">Cash Tendered</option>
                  <option value="card">Credit / Debit Card</option>
                  <option value="ewallet">eWallet (GCash / Maya)</option>
                  <option value="bank_transfer">Bank Transfer</option>
                </select>
              </div>

              <div className="border-t border-slate-100 pt-3 space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Gross Subtotal</span>
                  <span>{formatMoney(subtotal)}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-emerald-600 font-medium">
                    <span>Loyalty / Special Discount</span>
                    <span>- {formatMoney(discount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-extrabold text-base text-slate-900 pt-1 border-t border-slate-100">
                  <span>Total Payable</span>
                  <span className="text-blue-700">{formatMoney(total)}</span>
                </div>
              </div>

              <Button
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 h-10 shadow-xs cursor-pointer"
                onClick={checkout}
                disabled={saving || cart.length === 0}
              >
                {saving ? "Processing Transaction..." : `Charge ${formatMoney(total)}`}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* POS Receipt Modal */}
      <Modal open={!!receipt} onClose={() => setReceipt(null)} title="Official Transaction Receipt">
        {receipt && (
          <div className="space-y-4">
            <div className="text-center pb-2 border-b border-slate-100">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 mx-auto mb-1">
                <CheckCircle2 size={24} />
              </span>
              <h3 className="font-bold text-slate-900 text-sm">Sale Completed Successfully</h3>
              <p className="text-xs text-slate-400 font-mono mt-0.5">#{String(receipt.transaction_no || receipt.id)}</p>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Gross Subtotal:</span>
                <span className="text-slate-800">{formatMoney(receipt.subtotal ?? subtotal)}</span>
              </div>
              {Number(receipt.discount ?? 0) > 0 && (
                <div className="flex justify-between text-emerald-600 font-semibold">
                  <span>Discount Applied:</span>
                  <span>- {formatMoney(receipt.discount)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-slate-200/60 pt-1">
                <span className="font-bold text-slate-700">Total Tendered:</span>
                <strong className="text-slate-900 text-sm font-bold">{formatMoney(receipt.total ?? total)}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Payment Channel:</span>
                <span className="font-semibold uppercase text-slate-700">{String(receipt.payment_method ?? paymentMethod)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Transaction Time:</span>
                <span className="text-slate-600">{formatDate(receipt.created_at)}</span>
              </div>
            </div>

            <div className="mt-4 flex justify-between border-t border-slate-100 pt-3">
              <Button variant="outline" size="sm" onClick={() => setReceipt(null)}>
                New Sale
              </Button>
              <Button size="sm" onClick={() => window.print()} className="bg-blue-600 hover:bg-blue-700 text-white">
                <Printer size={14} className="mr-1.5" /> Print Receipt
              </Button>
            </div>
          </div>
        )}
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
