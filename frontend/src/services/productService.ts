import { Product } from "@/types/inventory";
import { getApiUrl, handleApiResponse } from "./api";

export async function fetchProducts(params?: {
  search?: string;
  category_id?: number | string;
  low_stock?: boolean;
}): Promise<Product[]> {
  const apiUrl = getApiUrl();
  const query = new URLSearchParams();
  if (params?.search) query.append("search", params.search);
  if (params?.category_id && params.category_id !== "all") {
    query.append("category_id", params.category_id.toString());
  }
  if (params?.low_stock) query.append("low_stock", "true");

  const res = await fetch(`${apiUrl}/products?${query.toString()}`, {
    headers: { Accept: "application/json" },
  });

  return handleApiResponse<Product[]>(res, "Failed to fetch products");
}

export async function createProduct(payload: Partial<Product>): Promise<Product> {
  const apiUrl = getApiUrl();
  const res = await fetch(`${apiUrl}/products`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  return handleApiResponse<Product>(res, "Failed to create product");
}

export async function updateProduct(id: number, payload: Partial<Product>): Promise<Product> {
  const apiUrl = getApiUrl();
  const res = await fetch(`${apiUrl}/products/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  return handleApiResponse<Product>(res, "Failed to update product");
}

export async function deleteProduct(id: number): Promise<void> {
  const apiUrl = getApiUrl();
  const res = await fetch(`${apiUrl}/products/${id}`, {
    method: "DELETE",
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.message || "Failed to delete product");
  }
}

export async function batchStoreProducts(products: Partial<Product>[]): Promise<Product[]> {
  const apiUrl = getApiUrl();
  const res = await fetch(`${apiUrl}/products/batch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ products }),
  });

  return handleApiResponse<Product[]>(res, "Failed to batch import products");
}
