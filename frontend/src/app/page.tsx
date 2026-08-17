"use client";

import { useEffect, useState } from "react";

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

export default function InventoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;

    async function loadProducts() {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";
        const res = await fetch(
          `${apiUrl}/products?search=${encodeURIComponent(search)}`,
        );
        const json = await res.json();
        if (!ignore && json.status === "success") {
          setProducts(json.data);
        }
      } catch (err) {
        if (!ignore) {
          console.error("Failed to fetch inventory:", err);
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    loadProducts();

    return () => {
      ignore = true;
    };
  }, [search]);

  return (
    <main className="min-h-screen bg-slate-50 p-6 sm:p-10 font-sans text-slate-900">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Sari-Sari Store Inventory
            </h1>
            <p className="text-sm text-slate-500">
              Real-time stock monitoring & inventory movements
            </p>
          </div>
          <input
            type="text"
            placeholder="Search by product name or barcode..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-80"
          />
        </header>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-slate-400">
              Loading products...
            </div>
          ) : products.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              No products found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-100/75 border-b border-slate-200 text-slate-700 font-semibold">
                  <tr>
                    <th className="p-4">Item Name</th>
                    <th className="p-4">Category</th>
                    <th className="p-4">Unit</th>
                    <th className="p-4">Cost Price</th>
                    <th className="p-4">Selling Price</th>
                    <th className="p-4">Margin</th>
                    <th className="p-4 text-right">In Stock</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {products.map((item) => {
                    const cost = parseFloat(item.cost_price);
                    const selling = parseFloat(item.selling_price);
                    const profit = selling - cost;
                    const isLowStock =
                      item.stock_quantity <= item.reorder_level;

                    return (
                      <tr key={item.id} className="hover:bg-slate-50/50">
                        <td className="p-4 font-medium text-slate-800">
                          {item.name}
                          {item.barcode && (
                            <div className="text-xs text-slate-400 font-mono">
                              {item.barcode}
                            </div>
                          )}
                        </td>
                        <td className="p-4 text-slate-600">
                          <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                            {item.category?.name ?? "Uncategorized"}
                          </span>
                        </td>
                        <td className="p-4 text-slate-600 font-mono text-xs">
                          {item.unit}
                        </td>
                        <td className="p-4 text-slate-600">
                          ₱{cost.toFixed(2)}
                        </td>
                        <td className="p-4 font-semibold text-slate-900">
                          ₱{selling.toFixed(2)}
                        </td>
                        <td className="p-4 text-emerald-600 text-xs font-semibold">
                          +₱{profit.toFixed(2)}
                        </td>
                        <td className="p-4 text-right">
                          <span
                            className={`inline-block px-2.5 py-1 rounded-md text-xs font-bold ${
                              isLowStock
                                ? "bg-rose-100 text-rose-700"
                                : "bg-emerald-50 text-emerald-700"
                            }`}
                          >
                            {item.stock_quantity} {item.unit}s
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
