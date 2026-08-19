"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from "react";
import { Product, Category, StoreSettings, UnitOfMeasure } from "@/types/inventory";
import { fetchProducts } from "@/services/productService";
import {
  fetchCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from "@/services/categoryService";
import {
  DEFAULT_UNITS,
  DEFAULT_STORE_SETTINGS,
  loadStoreSettings,
  saveStoreSettings,
} from "@/services/settingsService";

export type ToastType = "success" | "error" | "info" | "warning";

export interface ToastInfo {
  id: number;
  message: string;
  type: ToastType;
}

interface InventoryContextType {
  products: Product[];
  categories: Category[];
  settings: StoreSettings;
  allUnits: UnitOfMeasure[];
  totalSKUs: number;
  totalUnits: number;
  totalCapital: number;
  totalRevenue: number;
  totalTubo: number;
  overallMargin: string;
  lowStockCount: number;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  refreshInventory: () => Promise<void>;
  updateSettings: (newSettings: StoreSettings) => void;
  addCategory: (name: string) => Promise<Category>;
  editCategory: (id: number, name: string) => Promise<Category>;
  removeCategory: (id: number) => Promise<void>;
  isLoading: boolean;
  toast: ToastInfo | null;
  showToast: (message: string, type?: ToastType) => void;
  hideToast: () => void;
}

const InventoryContext = createContext<InventoryContextType | undefined>(undefined);

export function InventoryProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_STORE_SETTINGS);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState<ToastInfo | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = useCallback((message: string, type: ToastType = "success") => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    const newToast: ToastInfo = { id: Date.now(), message, type };
    setToast(newToast);
    toastTimeoutRef.current = setTimeout(() => {
      setToast(null);
    }, 4000);
  }, []);

  const hideToast = useCallback(() => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToast(null);
  }, []);

  // Refresh Products and Categories
  const refreshInventory = useCallback(async () => {
    try {
      const [prodData, catData] = await Promise.allSettled([
        fetchProducts(),
        fetchCategories(),
      ]);
      if (prodData.status === "fulfilled") setProducts(prodData.value);
      if (catData.status === "fulfilled") setCategories(catData.value);
    } catch (err) {
      console.error("Failed to load inventory:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial Load
  useEffect(() => {
    let ignore = false;
    async function init() {
      try {
        const loadedSettings = loadStoreSettings();
        setSettings(loadedSettings);

        const [prodData, catData] = await Promise.allSettled([
          fetchProducts(),
          fetchCategories(),
        ]);
        if (!ignore) {
          if (prodData.status === "fulfilled") setProducts(prodData.value);
          if (catData.status === "fulfilled") setCategories(catData.value);
        }
      } catch (err) {
        console.error("Failed to initialize inventory:", err);
      } finally {
        if (!ignore) setIsLoading(false);
      }
    }
    init();
    return () => {
      ignore = true;
    };
  }, []);

  // Update Settings
  const updateSettings = useCallback((newSettings: StoreSettings) => {
    setSettings(newSettings);
    saveStoreSettings(newSettings);
  }, []);

  // Category Actions
  const addCategory = useCallback(async (name: string) => {
    const created = await createCategory(name);
    setCategories((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    return created;
  }, []);

  const editCategory = useCallback(async (id: number, name: string) => {
    const updated = await updateCategory(id, name);
    setCategories((prev) =>
      prev.map((c) => (c.id === id ? updated : c)).sort((a, b) => a.name.localeCompare(b.name))
    );
    return updated;
  }, []);

  const removeCategory = useCallback(async (id: number) => {
    await deleteCategory(id);
    setCategories((prev) => prev.filter((c) => c.id !== id));
    await refreshInventory();
  }, [refreshInventory]);

  // Combined Standard & Custom Units
  const allUnits: UnitOfMeasure[] = [
    ...DEFAULT_UNITS,
    ...(settings.custom_units || []),
  ];

  // Compute Store Metrics
  const totalSKUs = products.length;
  const totalUnits = products.reduce((acc, p) => acc + (p.stock_quantity || 0), 0);
  const lowStockCount = products.filter((p) => p.stock_quantity <= p.reorder_level).length;

  const totalCapital = products.reduce(
    (acc, p) => acc + (parseFloat(p.cost_price) || 0) * (p.stock_quantity || 0),
    0
  );
  const totalRevenue = products.reduce(
    (acc, p) => acc + (parseFloat(p.selling_price) || 0) * (p.stock_quantity || 0),
    0
  );
  const totalTubo = totalRevenue - totalCapital;
  const overallMargin =
    totalCapital > 0 ? ((totalTubo / totalCapital) * 100).toFixed(1) : "0";

  return (
    <InventoryContext.Provider
      value={{
        products,
        categories,
        settings,
        allUnits,
        totalSKUs,
        totalUnits,
        totalCapital,
        totalRevenue,
        totalTubo,
        overallMargin,
        lowStockCount,
        sidebarOpen,
        setSidebarOpen,
        refreshInventory,
        updateSettings,
        addCategory,
        editCategory,
        removeCategory,
        isLoading,
        toast,
        showToast,
        hideToast,
      }}
    >
      {children}
    </InventoryContext.Provider>
  );
}

export function useInventory() {
  const context = useContext(InventoryContext);
  if (!context) {
    throw new Error("useInventory must be used within an InventoryProvider");
  }
  return context;
}
