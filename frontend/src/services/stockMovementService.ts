import { StockMovement } from "@/types/inventory";
import { getApiUrl, handleApiResponse } from "./api";

export async function fetchStockMovements(limit = 20): Promise<StockMovement[]> {
  const apiUrl = getApiUrl();
  const res = await fetch(`${apiUrl}/stock-movements?limit=${limit}`, {
    headers: { Accept: "application/json" },
  });

  return handleApiResponse<StockMovement[]>(res, "Failed to fetch stock movements");
}

export async function recordStockMovement(payload: {
  product_id: number;
  type: "restock" | "damage" | "expired" | "adjustment";
  quantity_change: number;
  notes?: string;
}): Promise<StockMovement> {
  const apiUrl = getApiUrl();
  const res = await fetch(`${apiUrl}/stock-movements`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  return handleApiResponse<StockMovement>(res, "Failed to record stock movement");
}
