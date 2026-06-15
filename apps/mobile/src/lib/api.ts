// API klient pro mobilní app — napojení na stávající Reserved API.
// Multi-tenant: uživatel zadá slug studia; auth přes portál (magic-link/heslo).

import Constants from 'expo-constants';
import { getSession } from './auth';

const API_URL =
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ?? 'http://localhost:4000/api/v1';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(
  path: string,
  opts: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const session = await getSession();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session?.tenantSlug) headers['X-Tenant-ID'] = session.tenantSlug;
  if (opts.auth !== false && session?.token) headers['Authorization'] = `Bearer ${session.token}`;

  const res = await fetch(`${API_URL}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: T;
    error?: { code?: string; message?: string };
  };
  if (!res.ok) {
    throw new ApiError(res.status, json.error?.code ?? 'ERROR', json.error?.message ?? 'Chyba');
  }
  return json.data as T;
}

// ─── Auth ──────────────────────────────────────────────────────────
export async function portalLogin(
  tenantSlug: string,
  email: string,
  password: string,
): Promise<{ accessToken: string }> {
  const res = await fetch(`${API_URL}/portal/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Tenant-ID': tenantSlug },
    body: JSON.stringify({ email, password }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    accessToken?: string;
    error?: { code?: string; message?: string };
  };
  if (!res.ok || !json.accessToken) {
    throw new ApiError(
      res.status,
      json.error?.code ?? 'LOGIN_FAILED',
      json.error?.message ?? 'Přihlášení selhalo',
    );
  }
  return { accessToken: json.accessToken };
}

// ─── Profil + rezervace + permanentky ────────────────────────────────
export interface Profile {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
}
export const getProfile = () => call<Profile>('/portal/me');

export interface MyBooking {
  id: string;
  referenceCode: string;
  serviceName?: string;
  startsAt: string;
  endsAt: string;
  status: string;
}
export const getMyBookings = () => call<MyBooking[]>('/portal/me/bookings');

export interface MyPack {
  id: string;
  name?: string;
  creditsRemaining?: number;
  validUntil?: string | null;
}
export const getMyCreditPacks = () => call<MyPack[]>('/portal/me/credit-packs');

// ─── Rozvrh lekcí (veřejné) + přihlášení ─────────────────────────────
export interface ClassSession {
  id: string;
  serviceId: string;
  serviceName?: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  bookedCount: number;
}

export async function getTimetable(
  tenantSlug: string,
  from: string,
  to: string,
): Promise<ClassSession[]> {
  return call<ClassSession[]>(`/public/${tenantSlug}/class-sessions?from=${from}&to=${to}`, {
    auth: false,
  });
}

export async function joinClass(
  tenantSlug: string,
  sessionId: string,
  customer: { customerName: string; customerEmail: string },
): Promise<{ referenceCode: string }> {
  return call<{ referenceCode: string }>(`/public/${tenantSlug}/class-sessions/${sessionId}/join`, {
    method: 'POST',
    body: customer,
    auth: false,
  });
}
