"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { Plus, Sparkles, AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { AppHeader } from "@/components/layout/AppHeader";
import { ProductFilters } from "@/components/products/ProductFilters";
import { ProductTable } from "@/components/products/ProductTable";
import { ProductModal } from "@/components/products/ProductModal";
import { DeleteConfirmationModal } from "@/components/common/DeleteConfirmationModal";
import { CatalogSummaryBar } from "@/components/products/CatalogSummaryBar";
import { Product, StockFilter, SortField, SortOrder, ProductFormData } from "@/types/inventory";
import { createProduct, updateProduct, deleteProduct } from "@/services/productService";
import { recordStockMovement } from "@/services/stockMovementService";
import { useInventory } from "@/context/InventoryContext";

export default function ProductsListPage() {
  const {
    products,
    categories,
    allUnits,
    totalSKUs,
    totalUnits,
    totalCapital,
    totalRevenue,
    totalTubo,
    overallMargin,
    setSidebarOpen,
    refreshInventory,
    isLoading,
    showToast,
  } = useInventory();

  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [modalLoading, setModalLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [updatingStockId, setUpdatingStockId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Edit / Create Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [editingProductId, setEditingProductId] = useState<number | null>(null);

  // Delete Confirmation Modal State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState<ProductFormData>({
    name: "",
    original_name: "",
    barcode: "",
    category_id: "",
    unit: "pc",
    cost_price: "",
    markup_percent: "25",
    selling_price: "",
    stock_quantity: "10",
    reorder_level: "5",
    pieces_per_pack: "12",
  });

  // Keyboard shortcut '/'
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

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 200);
    return () => clearTimeout(timer);
  }, [search]);

  // Open Create Modal
  const handleOpenCreateModal = () => {
    setModalMode("create");
    setEditingProductId(null);
    setFormData({
      name: "",
      original_name: "",
      barcode: "",
      category_id: categories[0]?.id ? categories[0].id.toString() : "",
      unit: "pc",
      cost_price: "",
      markup_percent: "25",
      selling_price: "",
      stock_quantity: "10",
      reorder_level: "5",
      pieces_per_pack: "12",
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (prod: Product) => {
    const cost = parseFloat(prod.cost_price) || 0;
    const retail = parseFloat(prod.selling_price) || 0;
    const initialMarkup = cost > 0 ? (((retail - cost) / cost) * 100).toFixed(1) : "25";

    setModalMode("edit");
    setEditingProductId(prod.id);
    setFormData({
      name: prod.name,
      original_name: prod.original_name || prod.name,
      barcode: prod.barcode || "",
      category_id: prod.category?.id ? prod.category.id.toString() : (prod.category_id ? prod.category_id.toString() : ""),
      unit: prod.unit,
      cost_price: prod.cost_price,
      markup_percent: initialMarkup,
      selling_price: prod.selling_price,
      stock_quantity: prod.stock_quantity.toString(),
      reorder_level: prod.reorder_level.toString(),
      pieces_per_pack: "12",
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  // Convert Pack to Pieces
  const handleConvertPackToPieces = () => {
    const packSize = parseInt(formData.pieces_per_pack) || 1;
    const currentCost = parseFloat(formData.cost_price) || 0;
    const currentRetail = parseFloat(formData.selling_price) || 0;
    const currentStock = parseInt(formData.stock_quantity) || 1;

    if (packSize <= 1) return;

    const unitCost = (currentCost / packSize).toFixed(2);
    const unitRetail = (currentRetail / packSize).toFixed(2);
    const totalPieces = (currentStock * packSize).toString();

    setFormData((prev) => ({
      ...prev,
      unit: "pc",
      cost_price: unitCost,
      selling_price: unitRetail,
      stock_quantity: totalPieces,
      reorder_level: (parseInt(prev.reorder_level) * packSize).toString(),
    }));

    showToast(`Converted into ${totalPieces} individual pieces at ₱${unitRetail}/pc`, "info");
  };

  // Submit Product Form
  const handleSubmitProductForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setModalLoading(true);

    try {
      const parsedCost = parseFloat(formData.cost_price);
      const parsedRetail = parseFloat(formData.selling_price);

      if (!formData.name.trim() || isNaN(parsedCost) || isNaN(parsedRetail)) {
        throw new Error("Please fill in all required fields with valid values.");
      }

      const payload = {
        name: formData.name.trim(),
        original_name: formData.original_name?.trim() || formData.name.trim(),
        barcode: formData.barcode?.trim() || null,
        category_id: formData.category_id ? parseInt(formData.category_id) : null,
        unit: formData.unit.trim(),
        cost_price: parsedCost.toFixed(2),
        selling_price: parsedRetail.toFixed(2),
        stock_quantity: parseInt(formData.stock_quantity) || 0,
        reorder_level: parseInt(formData.reorder_level) || 0,
      };

      if (modalMode === "edit" && editingProductId) {
        await updateProduct(editingProductId, payload);
      } else {
        await createProduct(payload);
      }

      showToast(modalMode === "edit" ? `Updated "${payload.name}"` : `Added "${payload.name}" to ledger`, "success");
      setIsModalOpen(false);
      await refreshInventory();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "An error occurred";
      setFormError(message);
    } finally {
      setModalLoading(false);
    }
  };

  // Request Delete (Opens Confirmation Modal)
  const handleRequestDelete = (product: Product) => {
    setProductToDelete(product);
    setIsDeleteModalOpen(true);
  };

  // Confirm and Execute Deletion
  const handleConfirmDelete = async () => {
    if (!productToDelete) return;
    setDeleteLoading(true);

    try {
      await deleteProduct(productToDelete.id);
      showToast(`Removed "${productToDelete.name}" from catalog.`, "success");
      setIsDeleteModalOpen(false);
      setProductToDelete(null);
      await refreshInventory();
    } catch {
      showToast("Failed to delete product. Please try again.", "error");
    } finally {
      setDeleteLoading(false);
    }
  };

  // Quick Stock Adjust
  const handleStockAdjust = async (product: Product, delta: number) => {
    const newStock = product.stock_quantity + delta;
    if (newStock < 0) return;

    setUpdatingStockId(product.id);

    try {
      await recordStockMovement({
        product_id: product.id,
        type: delta > 0 ? "restock" : "adjustment",
        quantity_change: delta,
        notes: delta > 0 ? `Restock +${delta} via Items Catalog` : `Sale -${Math.abs(delta)} via Items Catalog`,
      });

      showToast(
        delta > 0
          ? `+${delta} ${product.unit} added to "${product.name}"`
          : `Logged sale: -${Math.abs(delta)} ${product.unit} of "${product.name}"`,
        delta > 0 ? "success" : "info"
      );
      await refreshInventory();
    } catch {
      showToast("Stock update failed.", "error");
    } finally {
      setUpdatingStockId(null);
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  // Filter & Search
  const filteredProducts = products.filter((p) => {
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      const matchName = p.name.toLowerCase().includes(q);
      const matchBarcode = p.barcode?.toLowerCase().includes(q);
      const matchOrig = p.original_name?.toLowerCase().includes(q);
      if (!matchName && !matchBarcode && !matchOrig) return false;
    }

    if (stockFilter === "low_stock") {
      return p.stock_quantity <= p.reorder_level;
    }
    if (stockFilter === "out_of_stock") {
      return p.stock_quantity === 0;
    }
    if (stockFilter === "in_stock") {
      return p.stock_quantity > p.reorder_level;
    }
    return true;
  });

  const sortedProducts = [...filteredProducts].sort((a, b) => {
    let comparison = 0;
    if (sortField === "name") {
      comparison = a.name.localeCompare(b.name);
    } else if (sortField === "stock_quantity") {
      comparison = a.stock_quantity - b.stock_quantity;
    } else if (sortField === "cost_price") {
      comparison = parseFloat(a.cost_price) - parseFloat(b.cost_price);
    } else if (sortField === "selling_price") {
      comparison = parseFloat(a.selling_price) - parseFloat(b.selling_price);
    } else if (sortField === "margin") {
      const aCost = parseFloat(a.cost_price) || 1;
      const aRetail = parseFloat(a.selling_price) || 0;
      const aMargin = (aRetail - aCost) / aCost;

      const bCost = parseFloat(b.cost_price) || 1;
      const bRetail = parseFloat(b.selling_price) || 0;
      const bMargin = (bRetail - bCost) / bCost;

      comparison = aMargin - bMargin;
    }
    return sortOrder === "asc" ? comparison : -comparison;
  });

  return (
    <>
      {/* Header */}
      <AppHeader
        title="List of Items"
        subtitle="Master database catalog of all products, stock counts, profit margins & prices"
        onOpenSidebar={() => setSidebarOpen(true)}
        actions={
          <div className="flex items-center gap-2">
            <Link href="/manage">
              <Button size="sm" variant="outline" className="gap-1.5 text-xs bg-zinc-50 hidden sm:inline-flex">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                <span>Scan Receipt</span>
              </Button>
            </Link>
            <Button
              onClick={handleOpenCreateModal}
              size="sm"
              className="gap-1.5 text-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Add Product</span>
            </Button>
          </div>
        }
      />

      {/* Global Error Banner */}
      {error && (
        <Card className="mx-4 sm:mx-8 mt-4 border-rose-200 bg-rose-50">
          <CardContent className="p-4 flex items-center justify-between text-xs text-rose-800">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setError(null)}
              className="h-6 w-6 text-rose-500 hover:text-rose-800"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Master Catalog Table Container */}
      <main className="p-4 sm:p-8 flex-1">
        <Card className="flex flex-col h-[calc(100vh-8.5rem)] overflow-hidden shadow-2xs border-zinc-200">
          <CardHeader className="p-4 border-b border-zinc-200 space-y-3 bg-zinc-50/80 shrink-0">
            <ProductFilters
              search={search}
              setSearch={setSearch}
              searchInputRef={searchInputRef}
              stockFilter={stockFilter}
              setStockFilter={setStockFilter}
              products={products}
            />
          </CardHeader>

          <div className="flex-1 overflow-y-auto min-h-0 divide-y divide-zinc-100">
            <ProductTable
              products={sortedProducts}
              loading={isLoading}
              onSort={handleSort}
              onEdit={handleOpenEditModal}
              onDelete={handleRequestDelete}
              onStockAdjust={handleStockAdjust}
              updatingStockId={updatingStockId}
              searchQuery={search}
              onResetFilters={() => {
                setSearch("");
                setStockFilter("all");
              }}
            />
          </div>

          <CatalogSummaryBar
            totalSKUs={totalSKUs}
            totalUnits={totalUnits}
            totalCapital={totalCapital}
            totalRevenue={totalRevenue}
            totalTubo={totalTubo}
            overallMargin={overallMargin}
          />
        </Card>
      </main>

      {/* Product Create / Edit Modal */}
      <ProductModal
        isOpen={isModalOpen}
        onOpenChange={setIsModalOpen}
        modalMode={modalMode}
        formData={formData}
        setFormData={setFormData}
        categories={categories}
        units={allUnits}
        onSubmit={handleSubmitProductForm}
        loading={modalLoading}
        formError={formError}
        onConvertPackToPieces={handleConvertPackToPieces}
      />

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={isDeleteModalOpen}
        onOpenChange={setIsDeleteModalOpen}
        onConfirm={handleConfirmDelete}
        title="Delete Product SKU"
        itemName={productToDelete?.name}
        confirmText="Delete SKU"
        loading={deleteLoading}
      />
    </>
  );
}
