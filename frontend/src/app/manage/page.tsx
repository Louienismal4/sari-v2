"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Plus, AlertCircle, X } from "lucide-react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AppHeader } from "@/components/layout/AppHeader";
import { ReceiptScannerCard } from "@/components/station/ReceiptScannerCard";
import { BarcodeScannerCard } from "@/components/station/BarcodeScannerCard";
import { ScannedQueueTable } from "@/components/station/ScannedQueueTable";
import { QueueSummaryBar } from "@/components/station/QueueSummaryBar";
import { ProductModal } from "@/components/products/ProductModal";
import { DeleteConfirmationModal } from "@/components/common/DeleteConfirmationModal";
import { Product, ScannedItem, ScanQuota, ProductFormData } from "@/types/inventory";
import { batchStoreProducts, updateProduct } from "@/services/productService";
import { fetchScanQuota, scanReceiptImage, processImageFile } from "@/services/receiptScanService";
import { useInventory } from "@/context/InventoryContext";

interface DeleteModalState {
  isOpen: boolean;
  type: "single" | "all";
  itemIndex: number | null;
  itemName: string;
}

export default function ManageStationPage() {
  const {
    products,
    categories,
    allUnits,
    setSidebarOpen,
    refreshInventory,
    showToast,
  } = useInventory();

  const [modalLoading, setModalLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Gemini Scan & Token Quota State
  const [scanQuota, setScanQuota] = useState<ScanQuota | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [editingScannedIndex, setEditingScannedIndex] = useState<number | null>(null);
  const [editingProductId, setEditingProductId] = useState<number | null>(null);

  // Delete Confirmation Modal State
  const [deleteModalState, setDeleteModalState] = useState<DeleteModalState>({
    isOpen: false,
    type: "single",
    itemIndex: null,
    itemName: "",
  });

  // Table Search Filter
  const [tableSearch, setTableSearch] = useState("");

  // Scanner States (Persisted to localStorage via lazy initializers)
  const [scanning, setScanning] = useState(false);
  const [scannedItems, setScannedItems] = useState<ScannedItem[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = localStorage.getItem("sari_scanned_receipt_queue");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [];
  });
  const [selectedReceiptPreview, setSelectedReceiptPreview] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      return sessionStorage.getItem("sari_receipt_preview");
    } catch {
      return null;
    }
  });
  const [batchImporting, setBatchImporting] = useState(false);

  // Camera & Barcode States
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorchCapability, setHasTorchCapability] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const zxingControlsRef = useRef<{ stop: () => void } | null>(null);
  const nativeAnimFrameRef = useRef<number | null>(null);

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

  // Sync Scanned Queue to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("sari_scanned_receipt_queue", JSON.stringify(scannedItems));
    } catch (e) {
      console.error("Failed to persist scanned items:", e);
    }
  }, [scannedItems]);

  // Sync Receipt Preview to sessionStorage
  useEffect(() => {
    try {
      if (selectedReceiptPreview) {
        sessionStorage.setItem("sari_receipt_preview", selectedReceiptPreview);
      } else {
        sessionStorage.removeItem("sari_receipt_preview");
      }
    } catch {}
  }, [selectedReceiptPreview]);

  // Audio Beep Feedback Helper
  const playBeep = () => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(1400, ctx.currentTime);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch {}
  };

  // Stop Camera Scanner Helper
  const stopCameraScanner = useCallback(() => {
    if (nativeAnimFrameRef.current) {
      cancelAnimationFrame(nativeAnimFrameRef.current);
      nativeAnimFrameRef.current = null;
    }
    if (zxingControlsRef.current) {
      try {
        zxingControlsRef.current.stop();
      } catch {}
      zxingControlsRef.current = null;
    }
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    setTorchOn(false);
    setHasTorchCapability(false);
  }, []);

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      stopCameraScanner();
    };
  }, [stopCameraScanner]);

  // Load quota on mount
  useEffect(() => {
    let ignore = false;
    async function loadQuota() {
      try {
        const quota = await fetchScanQuota();
        if (!ignore) setScanQuota(quota);
      } catch {}
    }
    loadQuota();
    return () => {
      ignore = true;
    };
  }, []);

  // Convert Pack to Pieces in Modal
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

  // Open Modal to Add to Queue
  const handleOpenAddModal = (prefillBarcode?: string) => {
    setModalMode("create");
    setEditingScannedIndex(null);
    setEditingProductId(null);
    setFormData({
      name: "",
      original_name: "",
      barcode: prefillBarcode || "",
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

  // Open Modal to Edit Scanned Queue Item
  const handleOpenScannedItemModal = (item: ScannedItem, index: number) => {
    const cost = parseFloat(item.cost_price) || 0;
    const retail = parseFloat(item.selling_price) || 0;
    const initialMarkup = cost > 0 ? (((retail - cost) / cost) * 100).toFixed(1) : "25";

    setModalMode("edit");
    setEditingScannedIndex(index);
    setEditingProductId(null);
    setFormData({
      name: item.name,
      original_name: item.original_name || item.name,
      barcode: item.barcode || "",
      category_id: item.category_id ? item.category_id.toString() : (categories[0]?.id ? categories[0].id.toString() : ""),
      unit: item.unit || "pc",
      cost_price: item.cost_price,
      markup_percent: initialMarkup,
      selling_price: item.selling_price,
      stock_quantity: item.stock_quantity.toString(),
      reorder_level: (item.reorder_level || 5).toString(),
      pieces_per_pack: "12",
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  // Open Modal to Edit Existing Database Product
  const handleOpenEditProductModal = (prod: Product) => {
    const cost = parseFloat(prod.cost_price) || 0;
    const retail = parseFloat(prod.selling_price) || 0;
    const initialMarkup = cost > 0 ? (((retail - cost) / cost) * 100).toFixed(1) : "25";

    setModalMode("edit");
    setEditingScannedIndex(null);
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

  // Update item field inline in queue
  const handleUpdateScannedItemField = (index: number, field: keyof ScannedItem, val: string | number) => {
    setScannedItems((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, [field]: val } : item))
    );
  };

  // Request Single Item Deletion
  const handleRequestDeleteScannedItem = (index: number) => {
    const item = scannedItems[index];
    setDeleteModalState({
      isOpen: true,
      type: "single",
      itemIndex: index,
      itemName: item?.name || "this item",
    });
  };

  // Request Clear All Queue Items
  const handleRequestClearQueue = () => {
    if (scannedItems.length === 0) return;
    setDeleteModalState({
      isOpen: true,
      type: "all",
      itemIndex: null,
      itemName: "all scanned items in queue",
    });
  };

  // Confirm Deletion Action
  const handleConfirmDelete = () => {
    if (deleteModalState.type === "single" && deleteModalState.itemIndex !== null) {
      const idx = deleteModalState.itemIndex;
      const removedName = scannedItems[idx]?.name || "Item";
      setScannedItems((prev) => prev.filter((_, i) => i !== idx));
      showToast(`Removed "${removedName}" from scan queue.`, "info");
    } else if (deleteModalState.type === "all") {
      setScannedItems([]);
      setSelectedReceiptPreview(null);
      localStorage.removeItem("sari_scanned_receipt_queue");
      sessionStorage.removeItem("sari_receipt_preview");
      if (fileInputRef.current) fileInputRef.current.value = "";
      showToast("Cleared all items from scan queue.", "info");
    }
    setDeleteModalState({ isOpen: false, type: "single", itemIndex: null, itemName: "" });
  };

  // Handle scanned barcode lookup
  const handleScannedBarcodeResult = (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;

    playBeep();
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(120);
    }

    const queueIdx = scannedItems.findIndex((item) => item.barcode === trimmed);
    if (queueIdx !== -1) {
      handleOpenScannedItemModal(scannedItems[queueIdx], queueIdx);
      showToast(`Matched queue item: "${scannedItems[queueIdx].name}"`, "success");
      return;
    }

    const existing = products.find((p) => p.barcode === trimmed);
    if (existing) {
      handleOpenEditProductModal(existing);
      showToast(`Scanned store SKU: "${existing.name}"`, "success");
    } else {
      handleOpenAddModal(trimmed);
      showToast(`New SKU scanned [${trimmed}]. Pre-filled into queue.`, "info");
    }
  };

  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeInput.trim()) return;
    handleScannedBarcodeResult(barcodeInput);
    setBarcodeInput("");
  };

  // Start Camera with Dual Engine
  const startCameraScanner = async () => {
    try {
      setIsCameraActive(true);
      setFormError(null);

      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
        BarcodeFormat.QR_CODE,
        BarcodeFormat.ITF,
      ]);
      hints.set(DecodeHintType.TRY_HARDER, true);

      const codeReader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 80 });
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        const track = stream.getVideoTracks()[0];
        if (track) {
          const cap = (track.getCapabilities?.() || {}) as { torch?: boolean };
          if (cap.torch) setHasTorchCapability(true);
        }

        const controls = await codeReader.decodeFromVideoElement(videoRef.current, (result) => {
          if (result) {
            const text = result.getText();
            if (text) {
              stopCameraScanner();
              handleScannedBarcodeResult(text);
            }
          }
        });
        zxingControlsRef.current = controls;

        if ("BarcodeDetector" in window) {
          try {
            // @ts-expect-error - Native Web API
            const nativeDetector = new window.BarcodeDetector({
              formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"],
            });
            const nativeScanLoop = async () => {
              if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
                try {
                  const barcodes = await nativeDetector.detect(videoRef.current);
                  if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
                    stopCameraScanner();
                    handleScannedBarcodeResult(barcodes[0].rawValue);
                    return;
                  }
                } catch {}
              }
              nativeAnimFrameRef.current = requestAnimationFrame(nativeScanLoop);
            };
            nativeAnimFrameRef.current = requestAnimationFrame(nativeScanLoop);
          } catch {}
        }
      }
    } catch {
      setIsCameraActive(false);
      showToast("Camera access was denied or is not available.", "error");
    }
  };

  const toggleTorch = async () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      const track = stream.getVideoTracks()[0];
      if (track) {
        try {
          // @ts-expect-error - Torch constraint Web API
          await track.applyConstraints({ advanced: [{ torch: !torchOn }] });
          setTorchOn(!torchOn);
        } catch {
          showToast("Flashlight not supported on this camera.", "warning");
        }
      }
    }
  };

  // Receipt File Upload & Scan Handler
  const handleReceiptFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const previewUrl = URL.createObjectURL(file);
    setSelectedReceiptPreview(previewUrl);
    setScanning(true);
    setFormError(null);

    try {
      const base64Data = await processImageFile(file);
      if (!base64Data) throw new Error("Unable to read image file.");

      const result = await scanReceiptImage(base64Data);
      if (result.quota) setScanQuota(result.quota);

      if (result.data.length === 0) {
        showToast("Analyzed receipt, but found no line items.", "warning");
      } else {
        setScannedItems((prev) => [...prev, ...result.data]);
        showToast(`Extracted ${result.data.length} items into staging queue!`, "success");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Receipt scanning failed.";
      setFormError(message);
      showToast(message, "error");
    } finally {
      setScanning(false);
    }
  };

  // Batch Import All to DB
  const handleBatchImportScannedItems = async () => {
    if (scannedItems.length === 0) return;
    setBatchImporting(true);
    setFormError(null);

    try {
      const payload = scannedItems.map((item) => ({
        name: item.name,
        original_name: item.original_name || item.name,
        barcode: item.barcode || null,
        category_id: item.category_id || (categories[0]?.id ?? null),
        unit: item.unit || "pc",
        cost_price: item.cost_price,
        selling_price: item.selling_price,
        stock_quantity: item.stock_quantity || 1,
        reorder_level: item.reorder_level || 5,
      }));

      await batchStoreProducts(payload);

      showToast(`Batch imported ${scannedItems.length} products to ledger!`, "success");
      setScannedItems([]);
      setSelectedReceiptPreview(null);
      localStorage.removeItem("sari_scanned_receipt_queue");
      sessionStorage.removeItem("sari_receipt_preview");
      if (fileInputRef.current) fileInputRef.current.value = "";
      await refreshInventory();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Batch import failed.";
      setFormError(message);
      showToast(message, "error");
    } finally {
      setBatchImporting(false);
    }
  };

  // Submit Modal Form (Local Staging Update vs Database Update)
  const handleSubmitModalForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const parsedCost = parseFloat(formData.cost_price);
    const parsedRetail = parseFloat(formData.selling_price);

    if (!formData.name.trim() || isNaN(parsedCost) || isNaN(parsedRetail)) {
      setFormError("Please fill in all required fields with valid numbers.");
      return;
    }

    const catId = formData.category_id ? parseInt(formData.category_id) : null;
    const catName = categories.find((c) => c.id === catId)?.name || "Uncategorized";

    // 1. UPDATE EXISTING SCANNED QUEUE ITEM (LOCAL ONLY)
    if (editingScannedIndex !== null) {
      const updatedItem: ScannedItem = {
        name: formData.name.trim(),
        original_name: formData.original_name?.trim() || formData.name.trim(),
        barcode: formData.barcode?.trim() || null,
        category_id: catId,
        category_name: catName,
        unit: formData.unit.trim(),
        cost_price: parsedCost.toFixed(2),
        selling_price: parsedRetail.toFixed(2),
        stock_quantity: parseInt(formData.stock_quantity) || 1,
        reorder_level: parseInt(formData.reorder_level) || 5,
      };

      setScannedItems((prev) =>
        prev.map((item, idx) => (idx === editingScannedIndex ? updatedItem : item))
      );

      showToast(`Updated "${updatedItem.name}" in receipt station!`, "success");
      setIsModalOpen(false);
      return;
    }

    // 2. EDIT DATABASE PRODUCT
    if (editingProductId !== null) {
      setModalLoading(true);
      try {
        await updateProduct(editingProductId, {
          name: formData.name.trim(),
          original_name: formData.original_name?.trim() || formData.name.trim(),
          barcode: formData.barcode?.trim() || null,
          category_id: catId,
          unit: formData.unit.trim(),
          cost_price: parsedCost.toFixed(2),
          selling_price: parsedRetail.toFixed(2),
          stock_quantity: parseInt(formData.stock_quantity) || 0,
          reorder_level: parseInt(formData.reorder_level) || 0,
        });

        showToast(`Updated "${formData.name}" in database!`, "success");
        setIsModalOpen(false);
        await refreshInventory();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to update product";
        setFormError(message);
        showToast(message, "error");
      } finally {
        setModalLoading(false);
      }
      return;
    }

    // 3. ADD NEW ITEM TO QUEUE (LOCAL STAGING FIRST)
    const newItem: ScannedItem = {
      name: formData.name.trim(),
      original_name: formData.original_name?.trim() || formData.name.trim(),
      barcode: formData.barcode?.trim() || null,
      category_id: catId,
      category_name: catName,
      unit: formData.unit.trim(),
      cost_price: parsedCost.toFixed(2),
      selling_price: parsedRetail.toFixed(2),
      stock_quantity: parseInt(formData.stock_quantity) || 1,
      reorder_level: parseInt(formData.reorder_level) || 5,
    };

    setScannedItems((prev) => [newItem, ...prev]);
    showToast(`Added "${newItem.name}" to receipt queue!`, "success");
    setIsModalOpen(false);
  };

  const filteredScannedItems = scannedItems.filter((item) => {
    if (!tableSearch) return true;
    const q = tableSearch.toLowerCase();
    return (
      item.name.toLowerCase().includes(q) ||
      (item.original_name && item.original_name.toLowerCase().includes(q)) ||
      (item.barcode && item.barcode.toLowerCase().includes(q)) ||
      (item.category_name && item.category_name.toLowerCase().includes(q))
    );
  });

  return (
    <>
      {/* Header */}
      <AppHeader
        title="Products & Receipt Station"
        subtitle="Review and modify prices in staging queue before saving to store inventory"
        onOpenSidebar={() => setSidebarOpen(true)}
        actions={
          <Button onClick={() => handleOpenAddModal()} size="sm" className="gap-1.5 text-xs">
            <Plus className="w-3.5 h-3.5" />
            <span>Add Item</span>
          </Button>
        }
      />

      {/* Global Error Banner */}
      {formError && (
        <Card className="mx-4 sm:mx-8 mt-4 border-rose-200 bg-rose-50">
          <CardContent className="p-4 flex items-center justify-between text-xs text-rose-800">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{formError}</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setFormError(null)}
              className="h-6 w-6 text-rose-500 hover:text-rose-800"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </CardContent>
        </Card>
      )}

      <main className="p-4 sm:p-8 flex-1">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Staging Queue Table */}
          <Card className="lg:col-span-7 flex flex-col h-[calc(100vh-8.5rem)] overflow-hidden shadow-2xs border-zinc-200">
            <ScannedQueueTable
              scannedItems={scannedItems}
              filteredScannedItems={filteredScannedItems}
              tableSearch={tableSearch}
              setTableSearch={setTableSearch}
              batchImporting={batchImporting}
              onClearQueue={handleRequestClearQueue}
              onBatchImport={handleBatchImportScannedItems}
              onUpdateItemField={handleUpdateScannedItemField}
              onOpenItemModal={handleOpenScannedItemModal}
              onDeleteItem={handleRequestDeleteScannedItem}
            />

            <QueueSummaryBar scannedItems={scannedItems} />
          </Card>

          {/* Right: Scanners */}
          <div className="lg:col-span-5 space-y-5">
            <ReceiptScannerCard
              fileInputRef={fileInputRef}
              onFileChange={handleReceiptFileChange}
              scanning={scanning}
              selectedReceiptPreview={selectedReceiptPreview}
              onClearPreview={() => {
                setSelectedReceiptPreview(null);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
              scannedCount={scannedItems.length}
              scanQuota={scanQuota}
            />

            <BarcodeScannerCard
              isCameraActive={isCameraActive}
              onStartCamera={startCameraScanner}
              onStopCamera={stopCameraScanner}
              hasTorchCapability={hasTorchCapability}
              torchOn={torchOn}
              onToggleTorch={toggleTorch}
              videoRef={videoRef}
              barcodeInput={barcodeInput}
              setBarcodeInput={setBarcodeInput}
              barcodeInputRef={barcodeInputRef}
              onBarcodeSubmit={handleBarcodeSubmit}
            />
          </div>
        </div>
      </main>

      {/* Product Edit / Calculator Modal */}
      <ProductModal
        isOpen={isModalOpen}
        onOpenChange={setIsModalOpen}
        modalMode={modalMode}
        formData={formData}
        setFormData={setFormData}
        categories={categories}
        units={allUnits}
        onSubmit={handleSubmitModalForm}
        loading={modalLoading}
        formError={formError}
        onConvertPackToPieces={handleConvertPackToPieces}
      />

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={deleteModalState.isOpen}
        onOpenChange={(open) => setDeleteModalState((prev) => ({ ...prev, isOpen: open }))}
        onConfirm={handleConfirmDelete}
        title={deleteModalState.type === "all" ? "Clear Entire Scan Queue" : "Remove Item from Queue"}
        itemName={deleteModalState.itemName}
        confirmText={deleteModalState.type === "all" ? "Clear All" : "Remove Item"}
        description={
          deleteModalState.type === "all"
            ? "Are you sure you want to remove all staged items from the receipt queue? Any unsaved edits will be discarded."
            : undefined
        }
      />
    </>
  );
}
