export const API_BASE = (import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? "http://localhost:4000/api" : "/api")).replace(/\/$/, "");

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.name = "ApiError"; this.status = status; }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: "include"
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(data.error || `Request failed (${response.status})`, response.status);
  return data as T;
}

export type ApiUser = { id: string; name: string; email: string };
export type ApiCase = {
  id: string;
  reference: string;
  title: string;
  type: string;
  description: string;
  date: string | null;
  incidentDate?: string | null;
  amount: number;
  status: string;
  priority: string;
  mode?: string | null;
  platform?: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { evidence: number; timeline: number; tasks: number };
};
export type ApiEvidence = { id: string; caseId: string; name: string; mimeType: string; sizeBytes: number; createdAt: string; downloadUrl: string };

export async function uploadEvidence(caseId: string, files: File[]) {
  const body = new FormData();
  files.forEach(file => body.append("files", file));
  return api<{ evidence: ApiEvidence[]; storage: string }>(`/cases/${encodeURIComponent(caseId)}/evidence`, { method: "POST", body });
}
