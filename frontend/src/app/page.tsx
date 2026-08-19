"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import {
  Store,
  Menu,
  X,
  Search,
  AlertTriangle,
  Layers,
  Settings,
  RefreshCw,
  Plus,
  Minus,
  TrendingUp,
  Coins,
  Package,
  Barcode,
  ChevronRight,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { getApiUrl } from "@/lib/utils";

interface Category {
  id: number;
  name: string;
}

interface Product {
  id: number;
  name: string;
  barcode: string | null;
  unit: string;
  cost_price: string;
  selling_price: string;
  stock_quantity: number;
  reorder_level: number;
  category: Category | null;
}

type NavSection = "all" | "low_stock" | number;

export default function InventoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeSection, setActiveSection] = useState<NavSection>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [updatingStockId, setUpdatingStockId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Proper Philippine retail unit pluralization helper
  const formatUnit = (count: number, unit: string) => {
    const cleanUnit = unit.toLowerCase().trim();
    if (count === 1) return `${count} ${cleanUnit}`;

    const pluralMap: Record<string, string> = {
      sachet: "sachets",
      can: "cans",
      pc: "pcs",
      piece: "pieces",
      pack: "packs",
      bottle: "bottles",
      box: "boxes",
      bag: "bags",
      pouch: "pouches",
      kg: "kg",
      g: "g",
    };

    return `${count} ${pluralMap[cleanUnit] || `${cleanUnit}s`}`;
  };

  // Keyboard shortcut: '/' to focus search input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement !== searchInputRef.current) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Debounce search input by 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch Categories
  useEffect(() => {
    let ignore = false;
    async function loadCategories() {
      try {
        const apiUrl = getApiUrl();
        const res = await fetch(`${apiUrl}/categories`, {
          headers: { Accept: "application/json" },
        });
        if (res.ok) {
          const json = await res.json();
          if (!ignore && json.status === "success") {
            setCategories(json.data);
          }
        }
      } catch (err) {
        console.error("Failed to load categories:", err);
      }
    }
    loadCategories();
    return () => { ignore = true; };
  }, []);

  // Fetch Products from API on search or category filter change
  useEffect(() => {
    let ignore = false;
    async function fetchProducts() {
      try {
        setLoading(true);
        setError(null);
        const apiUrl = getApiUrl();
        
        const params = new URLSearchParams();
        if (debouncedSearch) params.append("search", debouncedSearch);
        if (typeof activeSection === "number") {
          params.append("category_id", activeSection.toString());
        }

        const res = await fetch(`${apiUrl}/products?${params.toString()}`, {
          headers: { Accept: "application/json" },
        });

        if (!res.ok) {
          const errorData = await res.json().catch(() => null);
          const message = errorData?.message || `Server returned ${res.status} ${res.statusText}`;
          throw new Error(message);
        }

        const json = await res.json();
        if (!ignore && json.status === "success") {
          setProducts(json.data);
        }
      } catch (err: unknown) {
        if (!ignore) {
          const message = err instanceof Error ? err.message : "Failed to fetch inventory data.";
          console.error("Failed to fetch inventory:", message);
          setError(message);
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    fetchProducts();
    return () => {
      ignore = true;
    };
  }, [debouncedSearch, activeSection]);

  // Standalone reload helper for manual refresh
  const loadProducts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const apiUrl = getApiUrl();
      const params = new URLSearchParams();
      if (debouncedSearch) params.append("search", debouncedSearch);
      if (typeof activeSection === "number") {
        params.append("category_id", activeSection.toString());
      }
      const res = await fetch(`${apiUrl}/products?${params.toString()}`, {
        headers: { Accept: "application/json" },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.status === "success") {
          setProducts(json.data);
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to fetch inventory data.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, activeSection]);

  // Handle Quick Stock Adjust (+1 / -1)
  const handleStockAdjust = async (product: Product, delta: number) => {
    const newStock = product.stock_quantity + delta;
    if (newStock < 0) return;

    setUpdatingStockId(product.id);
    
    // Optimistic UI update
    setProducts((prev) =>
      prev.map((p) => (p.id === product.id ? { ...p, stock_quantity: newStock } : p))
    );

    try {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/stock-movements`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          product_id: product.id,
          type: "adjustment",
          quantity_change: delta,
          notes: delta > 0 ? "Quick Restock" : "Counter Sale",
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to record stock update");
      }

      const actionText = delta > 0 ? `+${delta} restocked` : `${delta} sold`;
      showToast(`${product.name}: ${actionText}`);
    } catch (err) {
      console.error("Stock update failed:", err);
      // Revert optimistic update
      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, stock_quantity: product.stock_quantity } : p))
      );
      showToast("Stock update failed. Please try again.");
    } finally {
      setUpdatingStockId(null);
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((current) => (current === msg ? null : current));
    }, 3000);
  };

  // Filter products based on navigation selection
  const displayedProducts = products.filter((item) => {
    if (activeSection === "low_stock") {
      return item.stock_quantity <= item.reorder_level;
    }
    return true;
  });

  // Calculate metrics
  const totalProducts = products.length;
  const lowStockCount = products.filter((p) => p.stock_quantity <= p.reorder_level).length;
  const totalCapital = products.reduce((acc, p) => acc + (parseFloat(p.cost_price) || 0) * p.stock_quantity, 0);
  const totalRevenue = products.reduce((acc, p) => acc + (parseFloat(p.selling_price) || 0) * p.stock_quantity, 0);
  const totalTubo = totalRevenue - totalCapital;

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 flex font-sans antialiased">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-zinc-900 text-zinc-100 text-xs px-3.5 py-2.5 rounded-lg shadow-lg flex items-center gap-2 border border-zinc-800 animate-pulse">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
          {toastMessage}
        </div>
      )}

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-zinc-900/40 backdrop-blur-xs md:hidden"
        />
      )}

      {/* Minimalist Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-zinc-200 flex flex-col transition-transform duration-200 ease-out md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Brand Header */}
        <div className="h-16 px-5 flex items-center justify-between border-b border-zinc-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-zinc-900 text-white flex items-center justify-center">
              <Store className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight text-zinc-900">Sari Ledger</h1>
              <p className="text-[10px] text-zinc-400 font-mono">Store Inventory</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(false)}
            className="md:hidden text-zinc-400 hover:text-zinc-700"
            aria-label="Close navigation"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Sidebar Nav Items */}
        <div className="flex-1 overflow-y-auto p-3 space-y-5">
          {/* Main Navigation */}
          <div className="space-y-1">
            <span className="px-3 text-[10px] font-bold tracking-wider uppercase text-zinc-400">
              Overview
            </span>
            <Button
              variant={activeSection === "all" ? "default" : "ghost"}
              onClick={() => { setActiveSection("all"); setSidebarOpen(false); }}
              className="w-full justify-between"
            >
              <div className="flex items-center gap-2">
                <Package className="w-3.5 h-3.5" />
                <span>All Products</span>
              </div>
              <Badge variant={activeSection === "all" ? "secondary" : "outline"} className="text-[10px] px-1.5 py-0">
                {totalProducts}
              </Badge>
            </Button>

            <Button
              variant={activeSection === "low_stock" ? "destructive" : "ghost"}
              onClick={() => { setActiveSection("low_stock"); setSidebarOpen(false); }}
              className="w-full justify-between"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Low Stock Alerts</span>
              </div>
              {lowStockCount > 0 && (
                <Badge variant={activeSection === "low_stock" ? "default" : "destructive"} className="text-[10px] px-1.5 py-0">
                  {lowStockCount}
                </Badge>
              )}
            </Button>
          </div>

          {/* Manage Station */}
          <div className="space-y-1">
            <span className="px-3 text-[10px] font-bold tracking-wider uppercase text-zinc-400">
              Manage
            </span>
            <Link href="/manage" className="block">
              <Button variant="outline" className="w-full justify-between bg-zinc-50 hover:bg-zinc-100">
                <div className="flex items-center gap-2">
                  <Settings className="w-3.5 h-3.5 text-zinc-600" />
                  <span>Manage &amp; Scanners</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
              </Button>
            </Link>
          </div>

          <Separator />

          {/* Categories Navigation */}
          <div className="space-y-1">
            <span className="px-3 text-[10px] font-bold tracking-wider uppercase text-zinc-400">
              Categories
            </span>
            {categories.map((cat) => (
              <Button
                key={cat.id}
                variant={activeSection === cat.id ? "default" : "ghost"}
                onClick={() => { setActiveSection(cat.id); setSidebarOpen(false); }}
                className="w-full justify-start gap-2 truncate"
              >
                <Layers className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{cat.name}</span>
              </Button>
            ))}
          </div>

          {/* Financial Summary Card */}
          <Card className="bg-zinc-50 border-zinc-200">
            <CardContent className="p-3 space-y-2.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">
                Store Metrics
              </span>
              <div className="flex justify-between items-center text-xs">
                <div className="flex items-center gap-1.5 text-zinc-500">
                  <Coins className="w-3.5 h-3.5" />
                  <span>Capital</span>
                </div>
                <span className="font-mono font-semibold text-zinc-800">
                  ₱{totalCapital.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <div className="flex items-center gap-1.5 text-emerald-700 font-medium">
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>Est. Tubo</span>
                </div>
                <span className="font-mono font-bold text-emerald-600">
                  +₱{totalTubo.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Footer Status */}
        <div className="p-3 border-t border-zinc-100 text-[11px] text-zinc-400 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>MySQL Synced</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={loadProducts}
            title="Refresh data"
            className="h-6 w-6 text-zinc-400 hover:text-zinc-700"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </aside>

      {/* Main Content View */}
      <div className="flex-1 md:pl-64 flex flex-col min-w-0">
        {/* Top Header Bar */}
        <header className="h-16 bg-white border-b border-zinc-200 px-4 sm:px-8 flex items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(true)}
              className="md:hidden text-zinc-600 hover:text-zinc-900"
              aria-label="Open navigation"
            >
              <Menu className="w-4 h-4" />
            </Button>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-zinc-900 truncate">
                {activeSection === "all"
                  ? "All Inventory"
                  : activeSection === "low_stock"
                  ? "Low Stock Alert"
                  : categories.find((c) => c.id === activeSection)?.name ?? "Category"}
              </h2>
              <p className="text-[11px] text-zinc-400 hidden sm:block">
                Showing {displayedProducts.length} items
              </p>
            </div>
          </div>

          {/* Minimalist Search Field */}
          <div className="relative w-48 sm:w-72">
            <Input
              ref={searchInputRef}
              type="text"
              aria-label="Search items by product name or barcode"
              placeholder="Search or barcode... [/]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-7 text-xs font-mono"
            />
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-2.5 pointer-events-none" />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
                className="absolute right-2 top-2 text-zinc-400 hover:text-zinc-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </header>

        {/* Content Body */}
        <main className="p-4 sm:p-8 flex-1">
          {error ? (
            /* Error State */
            <Card className="border-rose-200 bg-white max-w-lg mx-auto mt-8">
              <CardContent className="p-8 text-center space-y-3">
                <div className="w-8 h-8 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center mx-auto">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <p className="font-bold text-sm text-zinc-900">Failed to load inventory data</p>
                <p className="text-xs text-rose-600 font-mono">{error}</p>
                <Button onClick={loadProducts} className="mt-2 gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retry Connection</span>
                </Button>
              </CardContent>
            </Card>
          ) : loading ? (
            /* Loading State */
            <div aria-busy="true" className="p-16 text-center text-zinc-400 space-y-3">
              <div className="inline-block w-6 h-6 border-2 border-zinc-300 border-t-zinc-900 rounded-full animate-spin"></div>
              <p className="text-xs font-mono text-zinc-500">Fetching inventory items...</p>
            </div>
          ) : displayedProducts.length === 0 ? (
            /* Empty State */
            <Card className="bg-white border-zinc-200">
              <CardContent className="p-16 text-center text-zinc-400 space-y-3">
                <Package className="w-8 h-8 mx-auto text-zinc-300" />
                <p className="text-sm font-semibold text-zinc-700">No items match your criteria</p>
                <p className="text-xs text-zinc-400 max-w-xs mx-auto">
                  Try clearing search query or switching categories.
                </p>
                {(search || activeSection !== "all") && (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setSearch("");
                      setActiveSection("all");
                    }}
                    className="mt-2 gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset to All Products</span>
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card className="bg-white border-zinc-200 overflow-hidden shadow-2xs">
              {/* Desktop Table View */}
              <div className="hidden sm:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item &amp; Barcode</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Capital</TableHead>
                      <TableHead className="text-right">Retail</TableHead>
                      <TableHead className="text-right">Tubo</TableHead>
                      <TableHead className="text-center">Stock</TableHead>
                      <TableHead className="text-right">Quick Stock</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayedProducts.map((item) => {
                      const cost = parseFloat(item.cost_price) || 0;
                      const selling = parseFloat(item.selling_price) || 0;
                      const profit = selling - cost;
                      const isLowStock = item.stock_quantity <= item.reorder_level;

                      return (
                        <TableRow key={item.id}>
                          {/* Item Name & Barcode */}
                          <TableCell>
                            <div className="font-semibold text-zinc-900">{item.name}</div>
                            {item.barcode && (
                              <div className="text-[10px] text-zinc-400 font-mono mt-0.5 flex items-center gap-1">
                                <Barcode className="w-3 h-3" />
                                <span>{item.barcode}</span>
                              </div>
                            )}
                          </TableCell>

                          {/* Category Tag */}
                          <TableCell>
                            <Badge variant="secondary" className="font-normal text-[11px]">
                              {item.category?.name ?? "Uncategorized"}
                            </Badge>
                          </TableCell>

                          {/* Capital (Cost) */}
                          <TableCell className="text-right text-zinc-600 font-mono">
                            ₱{cost.toFixed(2)}
                          </TableCell>

                          {/* Retail Price */}
                          <TableCell className="text-right font-bold text-zinc-900 font-mono">
                            ₱{selling.toFixed(2)}
                          </TableCell>

                          {/* Tubo / Margin */}
                          <TableCell className="text-right text-emerald-600 font-bold font-mono">
                            +₱{profit.toFixed(2)}
                          </TableCell>

                          {/* Stock Status Badge */}
                          <TableCell className="text-center">
                            <Badge
                              variant={isLowStock ? "destructive" : "success"}
                              className="text-[11px]"
                            >
                              {formatUnit(item.stock_quantity, item.unit)}
                            </Badge>
                          </TableCell>

                          {/* Quick 1-Tap Counter Action Buttons */}
                          <TableCell className="text-right">
                            <div className="inline-flex items-center gap-1 bg-zinc-50 p-0.5 rounded-md border border-zinc-200">
                              <Button
                                variant="outline"
                                size="icon"
                                disabled={item.stock_quantity <= 0 || updatingStockId === item.id}
                                onClick={() => handleStockAdjust(item, -1)}
                                title="Sell 1 unit (-1 stock)"
                                className="h-6 w-6 bg-white"
                              >
                                <Minus className="w-3 h-3" />
                              </Button>
                              <span className="w-7 text-center text-xs font-bold font-mono text-zinc-900">
                                {item.stock_quantity}
                              </span>
                              <Button
                                variant="outline"
                                size="icon"
                                disabled={updatingStockId === item.id}
                                onClick={() => handleStockAdjust(item, 1)}
                                title="Restock 1 unit (+1 stock)"
                                className="h-6 w-6 bg-white"
                              >
                                <Plus className="w-3 h-3" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Card Deck View */}
              <div className="sm:hidden divide-y divide-zinc-100">
                {displayedProducts.map((item) => {
                  const cost = parseFloat(item.cost_price) || 0;
                  const selling = parseFloat(item.selling_price) || 0;
                  const profit = selling - cost;
                  const isLowStock = item.stock_quantity <= item.reorder_level;

                  return (
                    <div key={item.id} className="p-4 space-y-2.5">
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <h3 className="font-semibold text-zinc-900 text-xs">{item.name}</h3>
                          {item.barcode && (
                            <p className="text-[10px] text-zinc-400 font-mono mt-0.5 flex items-center gap-1">
                              <Barcode className="w-2.5 h-2.5" />
                              <span>{item.barcode}</span>
                            </p>
                          )}
                        </div>
                        <Badge
                          variant={isLowStock ? "destructive" : "success"}
                          className="text-[10px]"
                        >
                          {formatUnit(item.stock_quantity, item.unit)}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-3 gap-2 bg-zinc-50 p-2 rounded text-[11px] border border-zinc-100">
                        <div>
                          <span className="text-[9px] text-zinc-400 uppercase font-semibold block">Capital</span>
                          <span className="font-mono text-zinc-700">₱{cost.toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="text-[9px] text-zinc-400 uppercase font-semibold block">Retail</span>
                          <span className="font-mono font-bold text-zinc-900">₱{selling.toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="text-[9px] text-emerald-700 uppercase font-semibold block">Tubo</span>
                          <span className="font-mono font-bold text-emerald-600">+₱{profit.toFixed(2)}</span>
                        </div>
                      </div>

                      <div className="flex justify-between items-center pt-1">
                        <span className="text-[11px] text-zinc-400">
                          {item.category?.name ?? "Uncategorized"}
                        </span>
                        
                        <div className="inline-flex items-center gap-1.5 bg-zinc-50 p-0.5 rounded-md border border-zinc-200">
                          <Button
                            variant="outline"
                            size="icon"
                            disabled={item.stock_quantity <= 0 || updatingStockId === item.id}
                            onClick={() => handleStockAdjust(item, -1)}
                            className="h-7 w-7 bg-white"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </Button>
                          <span className="w-7 text-center text-xs font-bold font-mono text-zinc-900">
                            {item.stock_quantity}
                          </span>
                          <Button
                            variant="outline"
                            size="icon"
                            disabled={updatingStockId === item.id}
                            onClick={() => handleStockAdjust(item, 1)}
                            className="h-7 w-7 bg-white"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </main>
      </div>
    </div>
  );
}
