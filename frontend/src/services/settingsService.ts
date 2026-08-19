import { StoreSettings, UnitOfMeasure } from "@/types/inventory";
import { getApiUrl } from "./api";

export const DEFAULT_UNITS: UnitOfMeasure[] = [
  { id: "pc", name: "pc", label: "Piece (pc)" },
  { id: "pack", name: "pack", label: "Pack" },
  { id: "box", name: "box", label: "Box" },
  { id: "sachet", name: "sachet", label: "Sachet" },
  { id: "can", name: "can", label: "Can" },
  { id: "bottle", name: "bottle", label: "Bottle" },
  { id: "pouch", name: "pouch", label: "Pouch" },
  { id: "dozen", name: "dozen", label: "Dozen (12 pcs)" },
  { id: "kg", name: "kg", label: "Kilogram (kg)" },
  { id: "g", name: "g", label: "Gram (g)" },
  { id: "L", name: "L", label: "Liter (L)" },
  { id: "mL", name: "mL", label: "Milliliter (mL)" },
  { id: "bar", name: "bar", label: "Bar (Soap/Snack)" },
  { id: "roll", name: "roll", label: "Roll" },
  { id: "bundle", name: "bundle", label: "Bundle" },
];

export const DEFAULT_STORE_SETTINGS: StoreSettings = {
  store_name: "Aling Nena's Sari-Sari Store",
  owner_name: "Store Owner",
  currency_symbol: "₱",
  default_markup_percent: "25",
  default_reorder_level: "5",
  enable_audio_beeper: true,
  enable_haptic_feedback: true,
  custom_units: [],
};

const SETTINGS_STORAGE_KEY = "sari_store_settings";

export function loadStoreSettings(): StoreSettings {
  if (typeof window === "undefined") return DEFAULT_STORE_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_STORE_SETTINGS,
        ...parsed,
        custom_units: Array.isArray(parsed.custom_units) ? parsed.custom_units : [],
      };
    }
  } catch (e) {
    console.error("Failed to load settings:", e);
  }
  return DEFAULT_STORE_SETTINGS;
}

export function saveStoreSettings(settings: StoreSettings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error("Failed to save settings:", e);
  }
}

export async function resetDatabaseApi(
  confirmation: string,
  mode: "clean_slate" | "demo_seed" | "keep_categories" = "clean_slate"
): Promise<string> {
  const apiUrl = getApiUrl();
  const res = await fetch(`${apiUrl}/database/reset`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ confirmation, mode }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.message || "Failed to reset database");
  }
  return json.message || "Database reset successfully";
}
