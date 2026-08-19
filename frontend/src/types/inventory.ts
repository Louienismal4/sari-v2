export interface Category {
  id: number;
  name: string;
  products_count?: number;
}

export interface UnitOfMeasure {
  id: string;
  name: string;
  label: string;
  is_custom?: boolean;
}

export interface StoreSettings {
  store_name: string;
  owner_name: string;
  currency_symbol: string;
  default_markup_percent: string;
  default_reorder_level: string;
  enable_audio_beeper: boolean;
  enable_haptic_feedback: boolean;
  custom_units: UnitOfMeasure[];
}

export interface Product {
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

export interface ProductFormData {
  name: string;
  original_name?: string;
  barcode?: string;
  category_id: string;
  unit: string;
  cost_price: string;
  markup_percent: string;
  selling_price: string;
  stock_quantity: string;
  reorder_level: string;
  pieces_per_pack: string;
}

export interface StockMovement {
  id: number;
  product_id: number;
  type: "restock" | "damage" | "expired" | "adjustment";
  quantity_change: number;
  notes: string | null;
  created_at: string;
  product?: Product;
}

export interface ScannedItem {
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

export interface ScanQuota {
  scans_used_today: number;
  scans_remaining_today: number;
  daily_limit: number;
  tokens_used_last_scan: number;
  approx_tokens_remaining: number;
}

export type StockFilter = "all" | "in_stock" | "low_stock" | "out_of_stock";
export type SortField = "name" | "stock_quantity" | "cost_price" | "selling_price" | "margin";
export type SortOrder = "asc" | "desc";
