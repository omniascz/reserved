// Portal API klient. Stejný stack jako apps/web, ale s endpointy /portal/*.
// Tenant slug se nepřenáší v JWT — token vždy patří k jednomu tenantovi.
// Při loginu se posílá X-Tenant-ID header (jak to dělá widget i admin).

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

const TOKEN_KEY = 'portal_access_token';
const REFRESH_KEY = 'portal_refresh_token';
const TENANT_KEY = 'portal_tenant_slug';
const CUSTOMER_KEY = 'portal_customer_email';

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getTenantSlug(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TENANT_KEY);
}

export function setAuth(access: string, refresh: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
}

export function setTenantSlug(slug: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TENANT_KEY, slug);
}

export function setCustomerEmail(email: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CUSTOMER_KEY, email);
}

export function getCustomerEmail(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(CUSTOMER_KEY);
}

export function clearAuth(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(CUSTOMER_KEY);
  // tenant slug ponecháme — uživatel se na něj může vrátit
}

export class PortalApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function fetchApi<T>(
  path: string,
  init?: RequestInit,
  opts: { withAuth?: boolean; tenantSlug?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init?.headers as Record<string, string>) ?? {}),
  };
  if (opts.withAuth !== false) {
    const token = getAccessToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }
  const slug = opts.tenantSlug ?? getTenantSlug();
  if (slug) headers['X-Tenant-ID'] = slug;

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = body?.error ?? { code: 'UNKNOWN', message: `HTTP ${res.status}` };
    throw new PortalApiError(res.status, err.code, err.message);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ─── Auth ─────────────────────────────────────────────────────────────

export async function requestMagicLink(
  tenantSlug: string,
  email: string,
  firstName?: string,
  lastName?: string,
): Promise<{ sent: true }> {
  return fetchApi<{ sent: true }>(
    '/portal/auth/magic-link',
    {
      method: 'POST',
      body: JSON.stringify({ email, firstName, lastName }),
    },
    { withAuth: false, tenantSlug },
  );
}

export async function verifyMagicLink(
  tenantSlug: string,
  token: string,
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  return fetchApi(
    `/portal/auth/verify?token=${encodeURIComponent(token)}`,
    { method: 'GET' },
    { withAuth: false, tenantSlug },
  );
}

export async function passwordLogin(
  tenantSlug: string,
  email: string,
  password: string,
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  return fetchApi(
    '/portal/auth/login',
    {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    },
    { withAuth: false, tenantSlug },
  );
}

export async function setPassword(password: string): Promise<void> {
  await fetchApi('/portal/auth/set-password', {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
}

export async function logout(): Promise<void> {
  const refresh = typeof window !== 'undefined' ? localStorage.getItem(REFRESH_KEY) : null;
  if (refresh) {
    await fetchApi(
      '/portal/auth/logout',
      {
        method: 'POST',
        body: JSON.stringify({ refreshToken: refresh }),
      },
      { withAuth: false },
    ).catch(() => {});
  }
  clearAuth();
}

// ─── Me ──────────────────────────────────────────────────────────────

export interface PortalProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  marketingOptIn: boolean;
  hasPassword: boolean;
  emailVerifiedAt: string | null;
  createdAt: string;
}

export async function getProfile(): Promise<PortalProfile> {
  const { data } = await fetchApi<{ data: PortalProfile }>('/portal/me');
  return data;
}

export async function updateProfile(input: {
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  marketingOptIn?: boolean;
}): Promise<PortalProfile> {
  const { data } = await fetchApi<{ data: PortalProfile }>('/portal/me', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return data;
}

// ─── Bookings ────────────────────────────────────────────────────────

export interface PortalBooking {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  referenceCode: string;
  pricePaidHellers: number;
  currency: string;
  customerNote: string | null;
  serviceName: string | null;
  serviceDuration: number | null;
  serviceColor: string | null;
  employeeName: string | null;
}

export async function listMyBookings(): Promise<PortalBooking[]> {
  const { data } = await fetchApi<{ data: PortalBooking[] }>('/portal/me/bookings');
  return data;
}

export async function cancelMyBooking(id: string, reason?: string): Promise<PortalBooking> {
  const { data } = await fetchApi<{ data: PortalBooking }>(`/portal/me/bookings/${id}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
  return data;
}

// ─── Credit packs (sprint 3.1) ───────────────────────────────────────

export interface PortalCreditPack {
  id: string;
  creditPackId: string;
  packName: string | null;
  creditsRemaining: number;
  creditsAtPurchase: number;
  snapshotMode: 'per_visit' | 'per_credit';
  validFrom: string;
  validUntil: string | null;
  status: 'active' | 'expired' | 'used_up' | 'refunded' | 'cancelled';
  pricePaidHellers: number;
  purchasedAt: string;
}

export async function listMyCreditPacks(): Promise<PortalCreditPack[]> {
  const { data } = await fetchApi<{ data: PortalCreditPack[] }>(`/portal/me/credit-packs`);
  return data;
}

export interface PortalBundleItem {
  serviceId: string;
  quantity: number;
}

export interface PortalBundlePack {
  id: string;
  bundlePackId: string;
  packName: string | null;
  itemsRemaining: PortalBundleItem[];
  snapshotItems: PortalBundleItem[];
  validFrom: string;
  validUntil: string | null;
  status: 'active' | 'expired' | 'used_up' | 'refunded' | 'cancelled';
  pricePaidHellers: number;
  note: string | null;
  purchasedAt: string;
}

export async function listMyBundlePacks(): Promise<PortalBundlePack[]> {
  const { data } = await fetchApi<{ data: PortalBundlePack[] }>(`/portal/me/bundle-packs`);
  return data;
}

export interface PortalTimePack {
  id: string;
  timePackId: string;
  packName: string | null;
  bookingsUsed: number;
  snapshotMaxBookingsPerPeriod: number | null;
  snapshotMaxBookingsPerDay: number | null;
  validFrom: string;
  validUntil: string;
  status: 'active' | 'expired' | 'used_up' | 'refunded' | 'cancelled';
  pricePaidHellers: number;
  note: string | null;
  purchasedAt: string;
}

export async function listMyTimePacks(): Promise<PortalTimePack[]> {
  const { data } = await fetchApi<{ data: PortalTimePack[] }>(`/portal/me/time-packs`);
  return data;
}

export interface PortalSubscriptionBenefits {
  discountPercent?: number;
  priorityAccess?: boolean;
  freeCreditsPerPeriod?: number;
  exclusiveServiceIds?: string[];
}

export interface PortalSubscription {
  id: string;
  planId: string;
  planName: string | null;
  status: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  trialEnd: string | null;
  canceledAt: string | null;
  cancelAtPeriodEnd: boolean;
  snapshotBenefits: PortalSubscriptionBenefits;
  snapshotBillingInterval: string;
  snapshotPriceHellers: number;
  note: string | null;
  createdAt: string;
}

export async function listMySubscriptions(): Promise<PortalSubscription[]> {
  const { data } = await fetchApi<{ data: PortalSubscription[] }>(`/portal/me/subscriptions`);
  return data;
}

export async function rescheduleMyBooking(
  id: string,
  newStartsAt: string,
  reason?: string,
): Promise<PortalBooking> {
  const { data } = await fetchApi<{ data: PortalBooking }>(`/portal/me/bookings/${id}/reschedule`, {
    method: 'POST',
    body: JSON.stringify({ newStartsAt, reason }),
  });
  return data;
}

// ─── Format helpers ──────────────────────────────────────────────────

export function formatPrice(hellers: number, currency = 'CZK'): string {
  const value = hellers / 100;
  return new Intl.NumberFormat('cs-CZ', { style: 'currency', currency }).format(value);
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('cs-CZ', {
    timeZone: 'Europe/Prague',
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
}
