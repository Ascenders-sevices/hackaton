/**
 * AIR BEE — AWS API Gateway Client
 * Replaces the Supabase client for all data fetching.
 * Uses AWS Amplify to get Cognito JWT tokens for every request.
 */

import { fetchAuthSession } from "aws-amplify/auth";

const API_URL = import.meta.env.VITE_API_URL as string;
const LOCAL_DEV = import.meta.env.VITE_LOCAL_DEV === "true";

async function getAuthHeader(): Promise<string> {
  if (LOCAL_DEV) return "Bearer local-dev-token";
  const session = await fetchAuthSession();
  const idToken = session.tokens?.idToken?.toString();
  if (!idToken) throw new Error("No auth token");
  return `Bearer ${idToken}`;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const auth = await getAuthHeader();
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      Authorization: auth,
      "Content-Type": "application/json",
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body: unknown) => request<T>("PUT", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),

  /** Call an AI endpoint — returns parsed JSON response */
  ai: async <T>(endpoint: string, body: unknown = {}): Promise<T> => {
    const auth = await getAuthHeader();
    const res = await fetch(`${API_URL}/ai/${endpoint}`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`AI ${endpoint} failed: ${res.status}`);
    return res.json() as Promise<T>;
  },

  /** Stream an AI endpoint (ai-copilot) — returns Response for SSE reading */
  aiStream: async (endpoint: string, body: unknown): Promise<Response> => {
    const auth = await getAuthHeader();
    const res = await fetch(`${API_URL}/ai/${endpoint}`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`AI stream ${endpoint} failed: ${res.status}`);
    return res;
  },
};
