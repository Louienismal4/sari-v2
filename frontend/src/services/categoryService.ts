import { Category } from "@/types/inventory";
import { getApiUrl, handleApiResponse } from "./api";

export async function fetchCategories(): Promise<Category[]> {
  const apiUrl = getApiUrl();
  const res = await fetch(`${apiUrl}/categories`, {
    headers: { Accept: "application/json" },
  });

  return handleApiResponse<Category[]>(res, "Failed to fetch categories");
}

export async function createCategory(name: string): Promise<Category> {
  const apiUrl = getApiUrl();
  const res = await fetch(`${apiUrl}/categories`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ name }),
  });

  return handleApiResponse<Category>(res, "Failed to create category");
}

export async function updateCategory(id: number, name: string): Promise<Category> {
  const apiUrl = getApiUrl();
  const res = await fetch(`${apiUrl}/categories/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ name }),
  });

  return handleApiResponse<Category>(res, "Failed to update category");
}

export async function deleteCategory(id: number): Promise<void> {
  const apiUrl = getApiUrl();
  const res = await fetch(`${apiUrl}/categories/${id}`, {
    method: "DELETE",
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.message || "Failed to delete category");
  }
}
