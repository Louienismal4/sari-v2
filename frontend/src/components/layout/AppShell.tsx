"use client";

import { ReactNode } from "react";
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from "lucide-react";
import { AppSidebar } from "./AppSidebar";
import { useInventory } from "@/context/InventoryContext";

export function AppShell({ children }: { children: ReactNode }) {
  const {
    sidebarOpen,
    setSidebarOpen,
    categories,
    totalSKUs,
    totalCapital,
    totalTubo,
    refreshInventory,
    toast,
    hideToast,
  } = useInventory();

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 flex font-sans antialiased">
      {/* Persistent Global Toast Notification */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-5 right-5 z-50 text-xs px-3.5 py-2.5 rounded-xl shadow-xl flex items-center gap-2.5 border transition-all animate-in fade-in slide-in-from-bottom-3 duration-200 ${
            toast.type === "success"
              ? "bg-zinc-950 text-white border-zinc-800"
              : toast.type === "error"
              ? "bg-rose-950 text-rose-50 border-rose-800"
              : toast.type === "warning"
              ? "bg-amber-950 text-amber-50 border-amber-800"
              : "bg-zinc-900 text-zinc-100 border-zinc-800"
          }`}
        >
          {toast.type === "success" && (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          )}
          {toast.type === "error" && (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          {toast.type === "warning" && (
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          )}
          {toast.type === "info" && (
            <Info className="w-4 h-4 text-blue-400 shrink-0" />
          )}
          <span className="font-medium">{toast.message}</span>
          <button
            type="button"
            onClick={hideToast}
            className="ml-1 p-0.5 text-zinc-400 hover:text-white rounded transition-colors"
            aria-label="Dismiss toast notification"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Persistent AppSidebar */}
      <AppSidebar
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        categories={categories}
        totalSKUs={totalSKUs}
        totalCapital={totalCapital}
        totalTubo={totalTubo}
        onRefresh={refreshInventory}
      />

      {/* Dynamic Inner Page Content */}
      <div className="flex-1 md:pl-64 flex flex-col min-w-0">
        {children}
      </div>
    </div>
  );
}
