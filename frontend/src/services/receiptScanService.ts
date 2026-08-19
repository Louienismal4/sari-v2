import { ScannedItem, ScanQuota } from "@/types/inventory";
import { getApiUrl } from "./api";

export async function fetchScanQuota(): Promise<ScanQuota> {
  const apiUrl = getApiUrl();
  const res = await fetch(`${apiUrl}/scan-quota`, {
    headers: { Accept: "application/json" },
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.message || "Failed to fetch scan quota");
  }
  return json.data as ScanQuota;
}

export async function scanReceiptImage(imageBase64: string): Promise<{ data: ScannedItem[]; quota?: ScanQuota }> {
  const apiUrl = getApiUrl();
  const res = await fetch(`${apiUrl}/scan-receipt`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ image_base64: imageBase64 }),
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

  return {
    data: json.data || [],
    quota: json.quota,
  };
}

export function processImageFile(file: File): Promise<string> {
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
}
