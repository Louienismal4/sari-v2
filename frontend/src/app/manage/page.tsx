"use client";

import { useEffect, useState, useCallback, useId, useRef } from "react";
import Link from "next/link";
import {
  Store,
  ArrowLeft,
  X,
  AlertCircle,
  CheckCircle2,
  Menu,
  UploadCloud,
  Check,
  Loader2,
  Package,
  Barcode,
  MoreVertical,
  Edit3,
  Trash2,
  Plus,
  RefreshCw,
  Search,
  Camera,
  CameraOff,
  Flashlight,
  FlashlightOff,
  Percent,
  Layers,
} from "lucide-react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { getApiUrl } from "@/lib/utils";

interface Category {
  id: number;
  name: string;
}

interface Product {
  id: number;
  name: string;
  original_name?: string | null;
  barcode: string | null;
  unit: string;
  cost_price: string;
  selling_price: string;
  stock_quantity: number;
  reorder_level: number;
  category: Category | null;
  category_id?: number | null;
}

interface ScannedItem {
  name: string;
  original_name: string;
  barcode: string | null;
  cost_price: string;
  selling_price: string;
  stock_quantity: number;
  unit: string;
  category_id: number | null;
  category_name: string;
  reorder_level: number;
}

interface ScanQuota {
  scans_used_today: number;
  scans_remaining_today: number;
  daily_limit: number;
  tokens_used_last_scan: number;
  approx_tokens_remaining: number;
}

export default function ManageProductsPage() {
  const formNameId = useId();
  const formOriginalNameId = useId();
  const formBarcodeId = useId();
  const formCategoryId = useId();
  const formUnitId = useId();
  const formCostPriceId = useId();
  const formMarkupId = useId();
  const formSellingPriceId = useId();
  const formStockQuantityId = useId();
  const formReorderLevelId = useId();
  const formPackQtyId = useId();

  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Gemini Scan & Token Quota State
  const [scanQuota, setScanQuota] = useState<ScanQuota | null>(null);

  // Modal State for Add / Edit (Staging Queue vs Database Product)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"add_scanned" | "edit_scanned" | "edit_product">("add_scanned");
  const [editingScannedIndex, setEditingScannedIndex] = useState<number | null>(null);
  const [editingProductId, setEditingProductId] = useState<number | null>(null);

  // Table Search Filter for Scanned Queue
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
  const modalNameInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const zxingControlsRef = useRef<{ stop: () => void } | null>(null);
  const nativeAnimFrameRef = useRef<number | null>(null);

  // Modal Form State with Auto Profit Margin & Pack Calculator
  const [formData, setFormData] = useState({
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

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((current) => (current === msg ? null : current));
    }, 3500);
  };

  // Save Scanned Queue to localStorage on Change
  useEffect(() => {
    try {
      localStorage.setItem("sari_scanned_receipt_queue", JSON.stringify(scannedItems));
    } catch (e) {
      console.error("Failed to persist scanned items:", e);
    }
  }, [scannedItems]);

  // Save Receipt Preview URL in sessionStorage
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
    } catch {
      // Audio autoplay policy fallback
    }
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

  // Stop camera on unmount
  useEffect(() => {
    return () => {
      stopCameraScanner();
    };
  }, [stopCameraScanner]);

  // Focus name input when modal opens
  useEffect(() => {
    if (isModalOpen) {
      setTimeout(() => {
        modalNameInputRef.current?.focus();
      }, 50);
    }
  }, [isModalOpen]);

  // Reload products helper for refresh button & post-import
  const loadProducts = useCallback(async () => {
    try {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/products`, {
        headers: { Accept: "application/json" },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.status === "success") {
          setProducts(json.data);
        }
      }
    } catch (err) {
      console.error("Failed to fetch products:", err);
    }
  }, []);

  // Fetch initial data on mount
  useEffect(() => {
    let ignore = false;

    async function initializeData() {
      try {
        const apiUrl = getApiUrl();
        const [catRes, prodRes, quotaRes] = await Promise.allSettled([
          fetch(`${apiUrl}/categories`, { headers: { Accept: "application/json" } }),
          fetch(`${apiUrl}/products`, { headers: { Accept: "application/json" } }),
          fetch(`${apiUrl}/scan-quota`, { headers: { Accept: "application/json" } }),
        ]);

        if (!ignore) {
          if (catRes.status === "fulfilled" && catRes.value.ok) {
            const catJson = await catRes.value.json();
            if (catJson.status === "success") {
              setCategories(catJson.data);
            }
          }
          if (prodRes.status === "fulfilled" && prodRes.value.ok) {
            const prodJson = await prodRes.value.json();
            if (prodJson.status === "success") {
              setProducts(prodJson.data);
            }
          }
          if (quotaRes.status === "fulfilled" && quotaRes.value.ok) {
            const quotaJson = await quotaRes.value.json();
            if (quotaJson.status === "success" && quotaJson.data) {
              setScanQuota(quotaJson.data);
            }
          }
        }
      } catch (err) {
        console.error("Failed to initialize management data:", err);
      }
    }

    initializeData();
    return () => {
      ignore = true;
    };
  }, []);

  // Margin / Markup Auto-Calculation Handlers
  const handleCostPriceChange = (newCostStr: string) => {
    const cost = parseFloat(newCostStr);
    const markup = parseFloat(formData.markup_percent);

    if (!isNaN(cost) && cost > 0 && !isNaN(markup)) {
      const computedRetail = (cost * (1 + markup / 100)).toFixed(2);
      setFormData((prev) => ({
        ...prev,
        cost_price: newCostStr,
        selling_price: computedRetail,
      }));
    } else {
      setFormData((prev) => ({ ...prev, cost_price: newCostStr }));
    }
  };

  const handleMarkupPercentChange = (newMarkupStr: string) => {
    const markup = parseFloat(newMarkupStr);
    const cost = parseFloat(formData.cost_price);

    if (!isNaN(cost) && cost > 0 && !isNaN(markup)) {
      const computedRetail = (cost * (1 + markup / 100)).toFixed(2);
      setFormData((prev) => ({
        ...prev,
        markup_percent: newMarkupStr,
        selling_price: computedRetail,
      }));
    } else {
      setFormData((prev) => ({ ...prev, markup_percent: newMarkupStr }));
    }
  };

  const handleSellingPriceChange = (newRetailStr: string) => {
    const retail = parseFloat(newRetailStr);
    const cost = parseFloat(formData.cost_price);

    if (!isNaN(retail) && !isNaN(cost) && cost > 0) {
      const computedMarkup = (((retail - cost) / cost) * 100).toFixed(1);
      setFormData((prev) => ({
        ...prev,
        selling_price: newRetailStr,
        markup_percent: computedMarkup,
      }));
    } else {
      setFormData((prev) => ({ ...prev, selling_price: newRetailStr }));
    }
  };

  const applyPresetMarkup = (percent: number) => {
    handleMarkupPercentChange(percent.toString());
  };

  // Convert Pack to Individual Pieces Handler
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

    showToast(`Converted into ${totalPieces} individual pieces at ₱${unitRetail}/pc`);
  };

  // Open Modal to Add Item into Scanned Queue (Staging first, NOT database)
  const handleOpenAddModal = (prefillBarcode?: string) => {
    setModalMode("add_scanned");
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

  // Open Modal to Edit an Item inside Scanned Queue (Local staging update first)
  const handleOpenScannedItemModal = (item: ScannedItem, index: number) => {
    const cost = parseFloat(item.cost_price) || 0;
    const retail = parseFloat(item.selling_price) || 0;
    const initialMarkup = cost > 0 ? (((retail - cost) / cost) * 100).toFixed(1) : "25";

    setModalMode("edit_scanned");
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

  // Open Modal to Edit an Existing Database Product
  const handleOpenEditProductModal = (prod: Product) => {
    const cost = parseFloat(prod.cost_price) || 0;
    const retail = parseFloat(prod.selling_price) || 0;
    const initialMarkup = cost > 0 ? (((retail - cost) / cost) * 100).toFixed(1) : "25";

    setModalMode("edit_product");
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

  // Update Item Fields inline in Scanned Queue
  const handleUpdateScannedItemField = (index: number, field: keyof ScannedItem, value: string | number) => {
    setScannedItems((prev) =>
      prev.map((item, idx) =>
        idx === index ? { ...item, [field]: value } : item
      )
    );
  };

  // Delete from scanned queue
  const handleDeleteScannedItem = (index: number) => {
    setScannedItems((prev) => prev.filter((_, i) => i !== index));
    showToast("Item removed from scan queue.");
  };

  // Clear entire queue
  const handleClearScannedQueue = () => {
    if (scannedItems.length === 0) return;
    if (confirm("Are you sure you want to clear all scanned receipt items from the queue?")) {
      setScannedItems([]);
      setSelectedReceiptPreview(null);
      localStorage.removeItem("sari_scanned_receipt_queue");
      sessionStorage.removeItem("sari_receipt_preview");
      if (fileInputRef.current) fileInputRef.current.value = "";
      showToast("Scan queue cleared.");
    }
  };

  // Process a Scanned Barcode String with Haptic & Sound
  const handleScannedBarcodeResult = (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;

    playBeep();
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(120);
    }

    // Check if barcode matches an item in current scanned queue
    const queueIdx = scannedItems.findIndex((item) => item.barcode === trimmed);
    if (queueIdx !== -1) {
      handleOpenScannedItemModal(scannedItems[queueIdx], queueIdx);
      showToast(`Matched queue item: "${scannedItems[queueIdx].name}"`);
      return;
    }

    // Check if barcode matches an existing product in store inventory
    const existing = products.find((p) => p.barcode === trimmed);
    if (existing) {
      handleOpenEditProductModal(existing);
      showToast(`Scanned store SKU: "${existing.name}"`);
    } else {
      handleOpenAddModal(trimmed);
      showToast(`New SKU scanned [${trimmed}]. Pre-filled into queue item.`);
    }
  };

  // Manual Barcode Input Submit
  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeInput.trim()) return;
    handleScannedBarcodeResult(barcodeInput);
    setBarcodeInput("");
  };

  // Start Camera with Dual Engine: Native BarcodeDetector + ZXing Sub-pixel Decoder
  const startCameraScanner = async () => {
    try {
      setIsCameraActive(true);
      setFormError(null);

      // Define standard retail barcode formats
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

      const codeReader = new BrowserMultiFormatReader(hints, {
        delayBetweenScanAttempts: 80,
      });

      // Request continuous focus and high-definition video stream
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

        // Check if device camera supports torch
        const track = stream.getVideoTracks()[0];
        if (track) {
          const cap = (track.getCapabilities?.() || {}) as { torch?: boolean };
          if (cap.torch) setHasTorchCapability(true);
        }

        // Start ZXing decoder loop on video element
        const controls = await codeReader.decodeFromVideoElement(
          videoRef.current,
          (result) => {
            if (result) {
              const scannedText = result.getText();
              if (scannedText) {
                stopCameraScanner();
                handleScannedBarcodeResult(scannedText);
              }
            }
          }
        );

        zxingControlsRef.current = controls;

        // Simultaneous Native BarcodeDetector acceleration if supported
        if ("BarcodeDetector" in window) {
          try {
            // @ts-expect-error - Native Web API
            const nativeDetector = new window.BarcodeDetector({
              formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"],
            });

            const nativeScanLoop = async () => {
              if (
                videoRef.current &&
                videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA
              ) {
                try {
                  const barcodes = await nativeDetector.detect(videoRef.current);
                  if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
                    stopCameraScanner();
                    handleScannedBarcodeResult(barcodes[0].rawValue);
                    return;
                  }
                } catch {
                  // Frame skip
                }
              }
              nativeAnimFrameRef.current = requestAnimationFrame(nativeScanLoop);
            };

            nativeAnimFrameRef.current = requestAnimationFrame(nativeScanLoop);
          } catch {
            // Native fallback to ZXing
          }
        }
      }
    } catch (err) {
      console.error("Camera scanner error:", err);
      setIsCameraActive(false);
      showToast("Camera access was denied or is not available. Please type barcode manually.");
    }
  };

  // Toggle Torch / Flashlight
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
          showToast("Flashlight not supported on this camera.");
        }
      }
    }
  };

  // Helper to read & optimize receipt image to base64
  const processImageFile = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const rawResult = e.target?.result as string;
        const img = new Image();
        img.onload = () => {
          const maxDim = 1600;
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL("image/jpeg", 0.85));
          } else {
            resolve(rawResult);
          }
        };
        img.onerror = () => resolve(rawResult);
        img.src = rawResult;
      };
      reader.onerror = () => resolve("");
      reader.readAsDataURL(file);
    });
  };

  // Receipt Scanner
  const handleReceiptFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const previewUrl = URL.createObjectURL(file);
    setSelectedReceiptPreview(previewUrl);

    setScanning(true);
    setFormError(null);

    try {
      const base64Data = await processImageFile(file);
      if (!base64Data) {
        throw new Error("Unable to read image file from device.");
      }

      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/scan-receipt`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ image_base64: base64Data }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        let errorMsg = json.message || "Failed to scan receipt with Gemini AI";
        if (json.errors && typeof json.errors === "object") {
          const details = Object.values(json.errors).flat().join(". ");
          if (details) errorMsg = details;
        }
        throw new Error(errorMsg);
      }

      if (json.quota) {
        setScanQuota(json.quota);
      }

      const items: ScannedItem[] = json.data || [];
      if (items.length === 0) {
        showToast("Analyzed receipt, but found no line items.");
      } else {
        setScannedItems((prev) => [...prev, ...items]);
        showToast(`Extracted ${items.length} items into staging queue!`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Receipt scanning failed.";
      setFormError(message);
    } finally {
      setScanning(false);
    }
  };

  // Batch Import All Scanned Items to Database
  const handleBatchImportScannedItems = async () => {
    if (scannedItems.length === 0) return;
    setBatchImporting(true);
    setFormError(null);

    try {
      const apiUrl = getApiUrl();
      const payload = {
        products: scannedItems.map((item) => ({
          name: item.name,
          original_name: item.original_name || item.name,
          barcode: item.barcode || null,
          category_id: item.category_id || (categories[0]?.id ?? null),
          unit: item.unit || "pc",
          cost_price: parseFloat(item.cost_price) || 0,
          selling_price: parseFloat(item.selling_price) || 0,
          stock_quantity: item.stock_quantity || 1,
          reorder_level: item.reorder_level || 5,
        })),
      };

      const res = await fetch(`${apiUrl}/products/batch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        let errorMsg = json.message || "Failed to batch import products";
        if (json.errors && typeof json.errors === "object") {
          const details = Object.values(json.errors).flat().join(". ");
          if (details) errorMsg = details;
        }
        throw new Error(errorMsg);
      }

      showToast(`Batch imported ${scannedItems.length} products to ledger!`);
      setScannedItems([]);
      setSelectedReceiptPreview(null);
      localStorage.removeItem("sari_scanned_receipt_queue");
      sessionStorage.removeItem("sari_receipt_preview");
      if (fileInputRef.current) fileInputRef.current.value = "";
      loadProducts();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Batch import failed.";
      setFormError(message);
    } finally {
      setBatchImporting(false);
    }
  };

  // Modal Form Submission:
  // - If editing an item in the scanned queue: Updates local state & table FIRST (NO database call)
  // - If adding a new item to queue: Appends to local state & table FIRST (NO database call)
  // - If editing existing DB product: Updates database
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
    if (modalMode === "edit_scanned" && editingScannedIndex !== null) {
      const updatedItem: ScannedItem = {
        name: formData.name.trim(),
        original_name: formData.original_name.trim() || formData.name.trim(),
        barcode: formData.barcode.trim() || null,
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

      showToast(`Updated "${updatedItem.name}" in receipt station!`);
      setIsModalOpen(false);
      return;
    }

    // 2. ADD NEW ITEM TO SCANNED QUEUE (LOCAL STAGING FIRST)
    if (modalMode === "add_scanned") {
      const newItem: ScannedItem = {
        name: formData.name.trim(),
        original_name: formData.original_name.trim() || formData.name.trim(),
        barcode: formData.barcode.trim() || null,
        category_id: catId,
        category_name: catName,
        unit: formData.unit.trim(),
        cost_price: parsedCost.toFixed(2),
        selling_price: parsedRetail.toFixed(2),
        stock_quantity: parseInt(formData.stock_quantity) || 1,
        reorder_level: parseInt(formData.reorder_level) || 5,
      };

      setScannedItems((prev) => [newItem, ...prev]);
      showToast(`Added "${newItem.name}" to receipt queue!`);
      setIsModalOpen(false);
      return;
    }

    // 3. EDIT EXISTING INVENTORY PRODUCT IN DATABASE
    if (modalMode === "edit_product" && editingProductId) {
      setLoading(true);
      try {
        const apiUrl = getApiUrl();
        const payload = {
          name: formData.name.trim(),
          original_name: formData.original_name.trim() || formData.name.trim(),
          barcode: formData.barcode.trim() || null,
          category_id: catId,
          unit: formData.unit.trim(),
          cost_price: parsedCost,
          selling_price: parsedRetail,
          stock_quantity: parseInt(formData.stock_quantity) || 0,
          reorder_level: parseInt(formData.reorder_level) || 0,
        };

        const res = await fetch(`${apiUrl}/products/${editingProductId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(payload),
        });

        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          let errorMsg = json.message || "Failed to update product in database";
          if (json.errors && typeof json.errors === "object") {
            const details = Object.values(json.errors).flat().join(". ");
            if (details) errorMsg = details;
          }
          throw new Error(errorMsg);
        }

        showToast(`Updated "${payload.name}" in database!`);
        setIsModalOpen(false);
        loadProducts();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "An error occurred";
        setFormError(message);
      } finally {
        setLoading(false);
      }
    }
  };

  // Filtered Scanned Items for Left Table
  const filteredScannedItems = scannedItems.filter((item) => {
    if (!tableSearch) return true;
    const query = tableSearch.toLowerCase();
    return (
      item.name.toLowerCase().includes(query) ||
      (item.original_name && item.original_name.toLowerCase().includes(query)) ||
      (item.barcode && item.barcode.toLowerCase().includes(query)) ||
      (item.category_name && item.category_name.toLowerCase().includes(query))
    );
  });

  // Totals Calculations for the Scanned Queue Table
  const queueTotalUnits = scannedItems.reduce((acc, item) => acc + (item.stock_quantity || 1), 0);
  const queueTotalCost = scannedItems.reduce(
    (acc, item) => acc + (parseFloat(item.cost_price) || 0) * (item.stock_quantity || 1),
    0
  );
  const queueTotalRetail = scannedItems.reduce(
    (acc, item) => acc + (parseFloat(item.selling_price) || 0) * (item.stock_quantity || 1),
    0
  );
  const queueTotalProfit = queueTotalRetail - queueTotalCost;
  const queueOverallMargin = queueTotalCost > 0 ? ((queueTotalProfit / queueTotalCost) * 100).toFixed(1) : "0";

  // Profit Margin Live Preview in Modal
  const costVal = parseFloat(formData.cost_price) || 0;
  const retailVal = parseFloat(formData.selling_price) || 0;
  const tuboVal = retailVal - costVal;
  const markupVal = costVal > 0 ? ((tuboVal / costVal) * 100).toFixed(1) : "0";

  // Multi-unit Pack Live Calculations in Modal
  const isMultiUnit = ["pack", "box", "case", "dozen", "sachet", "pouch"].includes(formData.unit);
  const packUnitsCount = parseInt(formData.pieces_per_pack) || 1;
  const pieceCost = packUnitsCount > 0 ? (costVal / packUnitsCount).toFixed(2) : "0.00";
  const pieceRetail = packUnitsCount > 0 ? (retailVal / packUnitsCount).toFixed(2) : "0.00";
  const pieceProfit = packUnitsCount > 0 ? (tuboVal / packUnitsCount).toFixed(2) : "0.00";

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 flex font-sans antialiased">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-zinc-900 text-zinc-100 text-xs px-3.5 py-2.5 rounded-lg shadow-lg flex items-center gap-2 border border-zinc-800 animate-pulse">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
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
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-zinc-900 text-white flex items-center justify-center">
              <Store className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight text-zinc-900">Sari Ledger</h1>
              <p className="text-[10px] text-zinc-400 font-mono">Product Station</p>
            </div>
          </Link>
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

        {/* Sidebar Navigation */}
        <div className="flex-1 p-3 space-y-4 overflow-y-auto">
          <div className="space-y-1">
            <span className="px-3 text-[10px] font-bold tracking-wider uppercase text-zinc-400">
              Views
            </span>
            <Link href="/" className="block">
              <Button variant="ghost" className="w-full justify-start gap-2">
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Store Ledger</span>
              </Button>
            </Link>
          </div>

          <div className="space-y-1">
            <span className="px-3 text-[10px] font-bold tracking-wider uppercase text-zinc-400">
              Quick Action
            </span>
            <Button
              onClick={() => handleOpenAddModal()}
              className="w-full justify-start gap-2"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Add to Staging Queue</span>
            </Button>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-zinc-100 text-[11px] text-zinc-400 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>MySQL Synced</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={loadProducts}
            title="Refresh database items"
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
              <h2 className="text-sm sm:text-base font-bold text-zinc-900">
                Products &amp; Receipt Station
              </h2>
              <p className="text-[11px] text-zinc-400">
                Review and modify prices in staging queue before saving to store inventory
              </p>
            </div>
          </div>

          <Button
            onClick={() => handleOpenAddModal()}
            className="gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Item</span>
          </Button>
        </header>

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

        {/* 2-COLUMN MAIN WORKSPACE */}
        <main className="p-4 sm:p-8 flex-1">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* ============================================================ */}
            {/* LEFT COLUMN: SCANNED RECEIPT QUEUE TABLE (VIEWPORT CONSTRAINED) */}
            {/* ============================================================ */}
            <Card className="lg:col-span-7 flex flex-col h-[calc(100vh-8.5rem)] overflow-hidden shadow-sm">
              {/* Table Header Strip & Search Filter */}
              <CardHeader className="p-4 border-b border-zinc-200 space-y-3 bg-zinc-50/80 shrink-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-sm text-zinc-900">
                      Receipt Queue ({scannedItems.length})
                    </h3>
                    <p className="text-[11px] text-zinc-500">
                      Changes update here first. Click &quot;Import All&quot; when ready to sync to inventory.
                    </p>
                  </div>

                  {/* Actions: Clear & Import All */}
                  {scannedItems.length > 0 && (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleClearScannedQueue}
                        className="h-8 text-xs text-zinc-500 hover:text-rose-600"
                        title="Clear queue"
                      >
                        Clear
                      </Button>
                      <Button
                        variant="emerald"
                        size="sm"
                        disabled={batchImporting}
                        onClick={handleBatchImportScannedItems}
                        className="gap-1.5 h-8 text-xs"
                      >
                        {batchImporting ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span>Importing...</span>
                          </>
                        ) : (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Import All ({scannedItems.length})</span>
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </div>

                {/* Search Bar for Scanned Items Queue */}
                {scannedItems.length > 0 && (
                  <div className="relative">
                    <Input
                      type="text"
                      placeholder="Filter queue by name, original receipt name, or category..."
                      value={tableSearch}
                      onChange={(e) => setTableSearch(e.target.value)}
                      className="pl-8 pr-7 text-xs font-mono"
                    />
                    <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-2.5 pointer-events-none" />
                    {tableSearch && (
                      <button
                        type="button"
                        onClick={() => setTableSearch("")}
                        className="absolute right-2 top-2 text-zinc-400 hover:text-zinc-600"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </CardHeader>

              {/* SCROLLABLE TABLE BODY (Fits viewport, scrollable) */}
              <div className="flex-1 overflow-y-auto min-h-0 divide-y divide-zinc-100">
                {filteredScannedItems.length === 0 ? (
                  <div className="p-12 text-center text-zinc-400 space-y-2.5 my-auto">
                    <Package className="w-8 h-8 mx-auto text-zinc-300" />
                    <p className="text-xs font-semibold text-zinc-700">
                      {scannedItems.length === 0 ? "Scan queue is empty" : "No matching items in queue"}
                    </p>
                    <p className="text-[11px] text-zinc-400 max-w-sm mx-auto">
                      {scannedItems.length === 0
                        ? "Upload or snap a receipt photo on the right to extract items into this queue."
                        : "Try a different search keyword."}
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader className="sticky top-0 bg-zinc-50/95 backdrop-blur-xs z-10">
                      <TableRow>
                        <TableHead className="w-[38%]">Item Name &amp; Original</TableHead>
                        <TableHead className="text-right w-[16%]">Cost (₱)</TableHead>
                        <TableHead className="text-right w-[16%]">Retail (₱)</TableHead>
                        <TableHead className="text-center w-[14%]">Qty</TableHead>
                        <TableHead className="text-right w-[16%]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredScannedItems.map((item, idx) => {
                        const cost = parseFloat(item.cost_price) || 0;
                        const retail = parseFloat(item.selling_price) || 0;
                        const itemMargin = cost > 0 ? (((retail - cost) / cost) * 100).toFixed(0) : "0";

                        return (
                          <TableRow key={idx}>
                            {/* Product Name (Inline Editable) & Original Name */}
                            <TableCell>
                              <Input
                                type="text"
                                value={item.name}
                                onChange={(e) => handleUpdateScannedItemField(idx, "name", e.target.value)}
                                className="h-7 text-xs font-semibold text-zinc-900 border-zinc-200 focus:border-zinc-900"
                                title="Click to rename item"
                              />
                              <div className="text-[10px] text-zinc-400 font-mono mt-1 flex items-center gap-1 truncate">
                                <span className="font-semibold text-zinc-500">Original:</span>
                                <span className="truncate" title={item.original_name}>
                                  {item.original_name || item.name}
                                </span>
                              </div>
                            </TableCell>

                            {/* Cost Price (Read-only on table, editable via modal calculator) */}
                            <TableCell className="text-right font-mono text-zinc-700 font-medium text-xs">
                              ₱{cost.toFixed(2)}
                            </TableCell>

                            {/* Retail Price (Read-only on table, auto-calculated via modal) */}
                            <TableCell className="text-right">
                              <div className="font-mono font-bold text-zinc-900 text-xs">
                                ₱{retail.toFixed(2)}
                              </div>
                              <span className="text-[9px] text-emerald-600 font-mono block mt-0.5">
                                +{itemMargin}% margin
                              </span>
                            </TableCell>

                            {/* Quantity (Read-only on table) */}
                            <TableCell className="text-center font-mono text-zinc-800 text-xs">
                              <span className="font-semibold">{item.stock_quantity}</span>{" "}
                              <span className="text-[10px] text-zinc-400 font-mono">{item.unit}</span>
                            </TableCell>

                            {/* Dropdown Menu Actions */}
                            <TableCell className="text-right">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-zinc-500">
                                    <MoreVertical className="w-4 h-4" />
                                    <span className="sr-only">Actions</span>
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => handleOpenScannedItemModal(item, idx)}>
                                    <Edit3 className="w-3.5 h-3.5 text-zinc-500 mr-2" />
                                    <span>Calculator &amp; Margin</span>
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => handleDeleteScannedItem(idx)}
                                    className="text-rose-600 focus:text-rose-700 focus:bg-rose-50"
                                  >
                                    <Trash2 className="w-3.5 h-3.5 mr-2" />
                                    <span>Remove</span>
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </div>

              {/* TOTALS SUMMARY BAR AT BOTTOM OF TABLE */}
              {scannedItems.length > 0 && (
                <div className="p-3 bg-zinc-50/90 border-t border-zinc-200 shrink-0 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider font-mono">
                      Queue Summary:
                    </span>
                    <span className="font-semibold text-zinc-900 text-xs">
                      {scannedItems.length} SKUs ({queueTotalUnits} total units)
                    </span>
                  </div>

                  <div className="flex items-center gap-4 font-mono">
                    <div>
                      <span className="text-[10px] text-zinc-400 block font-sans">Total Cost</span>
                      <span className="text-zinc-600 font-semibold text-xs">
                        ₱{queueTotalCost.toFixed(2)}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] text-zinc-400 block font-sans">Est. Sales</span>
                      <span className="text-zinc-900 font-bold text-xs">
                        ₱{queueTotalRetail.toFixed(2)}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] text-emerald-600 block font-sans font-semibold">
                        Est. Profit
                      </span>
                      <span className="text-emerald-600 font-bold text-xs">
                        +₱{queueTotalProfit.toFixed(2)} ({queueOverallMargin}%)
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </Card>

            {/* ============================================================ */}
            {/* RIGHT COLUMN: SCANNERS (5 COLS ON DESKTOP) */}
            {/* ============================================================ */}
            <div className="lg:col-span-5 space-y-5">
              {/* 1. SCAN RECEIPT (FIRST) */}
              <Card>
                <CardHeader className="p-4 pb-3">
                  <div>
                    <CardTitle>Scan receipt</CardTitle>
                    <CardDescription>
                      Snap or upload store receipt to auto-extract items
                    </CardDescription>
                  </div>
                </CardHeader>

                <CardContent className="p-4 pt-0 space-y-3">
                  {/* Dropzone */}
                  <label
                    htmlFor="receipt-upload"
                    className={`w-full border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors flex flex-col items-center justify-center gap-2 relative ${
                      scanning
                        ? "border-zinc-400 bg-zinc-50/40 pointer-events-none"
                        : "border-zinc-200 hover:border-zinc-400 bg-zinc-50/50 hover:bg-zinc-50"
                    }`}
                  >
                    <input
                      id="receipt-upload"
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/heic"
                      onChange={handleReceiptFileChange}
                      disabled={scanning}
                      className="sr-only"
                    />
                    {scanning ? (
                      <div className="flex flex-col items-center gap-2 text-zinc-700 py-2">
                        <Loader2 className="w-6 h-6 animate-spin text-zinc-900" />
                        <span className="text-xs font-semibold text-zinc-900">
                          Extracting receipt line items...
                        </span>
                        <span className="text-[10px] text-zinc-400 font-mono">
                          Extracting SKUs, wholesale costs &amp; quantities
                        </span>
                      </div>
                    ) : (
                      <>
                        <div className="w-9 h-9 rounded-full bg-zinc-100 text-zinc-700 flex items-center justify-center">
                          <UploadCloud className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="text-xs font-bold text-zinc-800 block">
                            Upload Receipt Photo
                          </span>
                          <span className="text-[10px] text-zinc-400 font-mono">
                            JPG, PNG, WEBP (Puregold, Wholesaler)
                          </span>
                        </div>
                      </>
                    )}
                  </label>

                  {/* Receipt Image Thumbnail Preview */}
                  {selectedReceiptPreview && (
                    <div className="flex items-center justify-between p-2 bg-zinc-50 rounded-lg border border-zinc-200">
                      <div className="flex items-center gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={selectedReceiptPreview}
                          alt="Receipt thumbnail"
                          className="w-10 h-10 object-cover rounded border border-zinc-200"
                        />
                        <div>
                          <span className="text-xs font-semibold text-zinc-800 block">
                            Receipt Image Loaded
                          </span>
                          <span className="text-[10px] text-zinc-400 font-mono">
                            {scannedItems.length} items in queue
                          </span>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setSelectedReceiptPreview(null);
                          if (fileInputRef.current) fileInputRef.current.value = "";
                        }}
                        className="h-6 w-6 text-zinc-400 hover:text-zinc-700"
                        title="Dismiss preview"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  )}

                  {/* Live Scan & Token Quota Indicator */}
                  <div className="pt-2 border-t border-zinc-100 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 text-zinc-700">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span className="text-[11px] font-medium">
                        {scanQuota
                          ? `${scanQuota.scans_remaining_today.toLocaleString()} of ${scanQuota.daily_limit.toLocaleString()} scans left today`
                          : "1,500 scans left today"}
                      </span>
                    </div>
                    <span className="text-[10px] text-zinc-400 font-mono">
                      {scanQuota?.tokens_used_last_scan
                        ? `~${scanQuota.tokens_used_last_scan} tokens/scan`
                        : "Google AI Studio Free Tier"}
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* 2. BARCODE SCANNER (SECOND) */}
              <Card>
                <CardHeader className="p-4 pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-zinc-100 text-zinc-800 flex items-center justify-center">
                        <Barcode className="w-4 h-4" />
                      </div>
                      <div>
                        <CardTitle>Barcode Scanner</CardTitle>
                        <CardDescription>
                          Scan physical retail barcodes live via phone camera
                        </CardDescription>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      {isCameraActive && hasTorchCapability && (
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={toggleTorch}
                          className="h-8 w-8 text-amber-600"
                          title="Toggle Flashlight"
                        >
                          {torchOn ? <FlashlightOff className="w-3.5 h-3.5" /> : <Flashlight className="w-3.5 h-3.5" />}
                        </Button>
                      )}
                      <Button
                        variant={isCameraActive ? "destructive" : "default"}
                        size="sm"
                        onClick={isCameraActive ? stopCameraScanner : startCameraScanner}
                        className="gap-1.5"
                      >
                        {isCameraActive ? (
                          <>
                            <CameraOff className="w-3.5 h-3.5" />
                            <span>Stop</span>
                          </>
                        ) : (
                          <>
                            <Camera className="w-3.5 h-3.5" />
                            <span>Scan Barcode</span>
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="p-4 pt-0 space-y-3">
                  {/* Live Camera Viewfinder with Optical Alignment Grid */}
                  {isCameraActive && (
                    <div className="relative rounded-xl overflow-hidden bg-black aspect-4/3 sm:aspect-video border border-zinc-300 shadow-inner flex items-center justify-center">
                      <video
                        ref={videoRef}
                        playsInline
                        muted
                        autoPlay
                        className="w-full h-full object-cover"
                      />
                      {/* Targeting Reticle & Active Laser Sweep */}
                      <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-6">
                        <div className="w-full h-3/4 max-w-xs border-2 border-emerald-400/80 rounded-xl relative shadow-[0_0_15px_rgba(52,211,153,0.3)]">
                          {/* Corner Markers */}
                          <span className="absolute -top-1 -left-1 w-3 h-3 border-t-2 border-l-2 border-emerald-300" />
                          <span className="absolute -top-1 -right-1 w-3 h-3 border-t-2 border-r-2 border-emerald-300" />
                          <span className="absolute -bottom-1 -left-1 w-3 h-3 border-b-2 border-l-2 border-emerald-300" />
                          <span className="absolute -bottom-1 -right-1 w-3 h-3 border-b-2 border-r-2 border-emerald-300" />
                          {/* Laser Scan Line */}
                          <div className="absolute inset-x-2 top-1/2 h-0.5 bg-emerald-400 shadow-[0_0_10px_#34d399] animate-pulse" />
                        </div>
                      </div>
                      <div className="absolute bottom-2.5 inset-x-0 text-center pointer-events-none">
                        <span className="text-[10px] bg-zinc-950/85 text-emerald-300 font-mono font-bold px-3 py-1 rounded-full border border-emerald-500/40 shadow-sm">
                          Align barcode inside target frame
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Manual / Handheld USB Laser Scanner Input */}
                  <form onSubmit={handleBarcodeSubmit} className="space-y-2">
                    <div className="relative">
                      <Input
                        ref={barcodeInputRef}
                        type="text"
                        placeholder="Scan or type barcode (e.g. 4800016644810)..."
                        value={barcodeInput}
                        onChange={(e) => setBarcodeInput(e.target.value)}
                        className="pl-8 pr-20 font-mono"
                      />
                      <Barcode className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-2.5 pointer-events-none" />
                      <Button
                        type="submit"
                        size="sm"
                        className="absolute right-1 top-1 h-6 px-2.5"
                      >
                        Lookup
                      </Button>
                    </div>
                    <p className="text-[10px] text-zinc-400">
                      Optimized for retail products (Lucky Me, Kopiko, 555 Sardines) via optical camera &amp; USB readers.
                    </p>
                  </form>
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
      </div>

      {/* ============================================================ */}
      {/* SHADCN DIALOG / MODAL: ADD / EDIT PRODUCT */}
      {/* ============================================================ */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {modalMode === "edit_product"
                ? "Edit Product in Database"
                : modalMode === "edit_scanned"
                ? "Edit Item in Receipt Station"
                : "Add Item to Receipt Station"}
            </DialogTitle>
            <DialogDescription>
              {modalMode === "edit_product"
                ? "Update pricing, margin, unit packaging, or reorder threshold in inventory database."
                : "Modify pricing, margins, and pack sizes in your staging queue before importing to inventory."}
            </DialogDescription>
          </DialogHeader>

          {/* Modal Form */}
          <form onSubmit={handleSubmitModalForm} className="space-y-4 pt-1">
            {/* Product Name */}
            <div className="space-y-1">
              <label htmlFor={formNameId} className="text-xs font-semibold text-zinc-700">
                Product Name *
              </label>
              <Input
                id={formNameId}
                ref={modalNameInputRef}
                type="text"
                required
                placeholder="e.g. Lucky Me! Pancit Canton Kalamansi"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            {/* Original Name Reference (if present) */}
            {formData.original_name && formData.original_name !== formData.name && (
              <div className="space-y-1">
                <label htmlFor={formOriginalNameId} className="text-xs font-semibold text-zinc-500">
                  Original Receipt Name
                </label>
                <Input
                  id={formOriginalNameId}
                  type="text"
                  readOnly
                  value={formData.original_name}
                  className="bg-zinc-50 text-zinc-600 font-mono text-xs cursor-default"
                />
              </div>
            )}

            {/* Barcode & Category */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor={formBarcodeId} className="text-xs font-semibold text-zinc-700">
                  Barcode / SKU
                </label>
                <Input
                  id={formBarcodeId}
                  type="text"
                  placeholder="4800016644810"
                  value={formData.barcode}
                  onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                  className="font-mono"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor={formCategoryId} className="text-xs font-semibold text-zinc-700">
                  Category
                </label>
                <select
                  id={formCategoryId}
                  value={formData.category_id}
                  onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                  className="flex h-8 w-full rounded-lg border border-zinc-200 bg-white px-3 py-1 text-xs text-zinc-900 shadow-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950"
                >
                  <option value="">-- Uncategorized --</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Unit & Reorder Threshold */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor={formUnitId} className="text-xs font-semibold text-zinc-700">
                  Unit of Measure *
                </label>
                <select
                  id={formUnitId}
                  value={formData.unit}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                  className="flex h-8 w-full rounded-lg border border-zinc-200 bg-white px-3 py-1 text-xs text-zinc-900 shadow-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950"
                >
                  <option value="pc">Piece (pc)</option>
                  <option value="pack">Pack</option>
                  <option value="box">Box</option>
                  <option value="sachet">Sachet</option>
                  <option value="can">Can</option>
                  <option value="bottle">Bottle</option>
                  <option value="pouch">Pouch</option>
                  <option value="dozen">Dozen (12 pcs)</option>
                  <option value="kg">Kilogram (kg)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label htmlFor={formReorderLevelId} className="text-xs font-semibold text-zinc-700">
                  Reorder Alert Level
                </label>
                <Input
                  id={formReorderLevelId}
                  type="number"
                  min="0"
                  placeholder="5"
                  value={formData.reorder_level}
                  onChange={(e) => setFormData({ ...formData, reorder_level: e.target.value })}
                  className="font-mono"
                />
              </div>
            </div>

            {/* MULTI-UNIT / "HOW MANY IN PACK" CALCULATOR */}
            {isMultiUnit && (
              <div className="p-3 bg-indigo-50/70 border border-indigo-200/80 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-900">
                    <Layers className="w-4 h-4 text-indigo-600" />
                    <span>Package Breakdown ({formData.unit.toUpperCase()})</span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleConvertPackToPieces}
                    className="h-6 text-[10px] bg-white border-indigo-300 text-indigo-700 hover:bg-indigo-100"
                    title="Convert this bulk pack into individual piece units in inventory"
                  >
                    Sell by Individual Piece
                  </Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label htmlFor={formPackQtyId} className="text-[11px] font-medium text-indigo-900">
                      How many pieces in this {formData.unit}?
                    </label>
                    <Input
                      id={formPackQtyId}
                      type="number"
                      min="1"
                      placeholder="12"
                      value={formData.pieces_per_pack}
                      onChange={(e) => setFormData({ ...formData, pieces_per_pack: e.target.value })}
                      className="h-7 text-xs bg-white font-mono"
                    />
                  </div>

                  <div className="p-2 bg-white/90 rounded-lg border border-indigo-100 text-[11px] space-y-0.5 font-mono">
                    <div className="flex justify-between text-zinc-600">
                      <span>Cost / piece:</span>
                      <span className="font-semibold text-zinc-900">₱{pieceCost}</span>
                    </div>
                    <div className="flex justify-between text-zinc-600">
                      <span>Retail / piece:</span>
                      <span className="font-bold text-zinc-900">₱{pieceRetail}</span>
                    </div>
                    <div className="flex justify-between text-emerald-600 pt-0.5 border-t border-zinc-100">
                      <span>Profit / piece:</span>
                      <span className="font-bold">+₱{pieceProfit}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* CAPITAL COST, PROFIT MARGIN & RETAIL PRICE */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {/* Capital Cost */}
              <div className="space-y-1">
                <label htmlFor={formCostPriceId} className="text-[11px] font-semibold text-zinc-700">
                  Capital (₱) *
                </label>
                <Input
                  id={formCostPriceId}
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  placeholder="12.50"
                  value={formData.cost_price}
                  onChange={(e) => handleCostPriceChange(e.target.value)}
                  className="font-mono"
                />
              </div>

              {/* Profit Margin Markup % (Auto Adapting) */}
              <div className="space-y-1">
                <label htmlFor={formMarkupId} className="text-[11px] font-semibold text-zinc-700 flex items-center justify-between">
                  <span>Markup (%)</span>
                  <Percent className="w-3 h-3 text-zinc-400" />
                </label>
                <Input
                  id={formMarkupId}
                  type="number"
                  step="0.1"
                  placeholder="25"
                  value={formData.markup_percent}
                  onChange={(e) => handleMarkupPercentChange(e.target.value)}
                  className="font-mono text-emerald-700 font-semibold"
                />
              </div>

              {/* Retail Selling Price (Auto Adapting) */}
              <div className="space-y-1">
                <label htmlFor={formSellingPriceId} className="text-[11px] font-semibold text-zinc-700">
                  Retail Price (₱) *
                </label>
                <Input
                  id={formSellingPriceId}
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  placeholder="16.00"
                  value={formData.selling_price}
                  onChange={(e) => handleSellingPriceChange(e.target.value)}
                  className="font-mono font-bold text-zinc-900"
                />
              </div>
            </div>

            {/* Quick Profit Margin Presets */}
            <div className="space-y-1">
              <span className="text-[10px] text-zinc-400 font-mono block">Quick Profit Margin Presets:</span>
              <div className="flex flex-wrap items-center gap-1.5">
                {[15, 20, 25, 30, 35, 40].map((pct) => (
                  <Button
                    key={pct}
                    type="button"
                    variant={parseFloat(formData.markup_percent) === pct ? "default" : "outline"}
                    size="sm"
                    onClick={() => applyPresetMarkup(pct)}
                    className="h-6 px-2 text-[10px] font-mono"
                  >
                    +{pct}%
                  </Button>
                ))}
              </div>
            </div>

            {/* Stock Quantity */}
            <div className="space-y-1">
              <label htmlFor={formStockQuantityId} className="text-[11px] font-semibold text-zinc-700">
                Quantity *
              </label>
              <Input
                id={formStockQuantityId}
                type="number"
                min="1"
                required
                placeholder="24"
                value={formData.stock_quantity}
                onChange={(e) => setFormData({ ...formData, stock_quantity: e.target.value })}
                className="font-mono"
              />
            </div>

            {/* Profit Margin Preview Bar */}
            <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-lg flex items-center justify-between text-xs">
              <div>
                <span className="text-[10px] text-zinc-400 uppercase font-semibold block">Tubo Breakdown</span>
                <span className="text-zinc-600 text-[11px]">
                  ₱{costVal.toFixed(2)} → ₱{retailVal.toFixed(2)}
                </span>
              </div>
              <div className="text-right">
                <span className="font-mono font-bold text-emerald-600 text-xs block">
                  +₱{tuboVal.toFixed(2)} Tubo
                </span>
                <span className="text-[10px] text-zinc-400 font-mono">({markupVal}% Margin)</span>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading}
              >
                {loading
                  ? "Saving..."
                  : modalMode === "edit_product"
                  ? "Update Database Product"
                  : modalMode === "edit_scanned"
                  ? "Save to Queue"
                  : "Add to Queue"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
