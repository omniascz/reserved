// API klient pro admin endpointy. JWT token v paměti + localStorage.

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

const TOKEN_KEY = 'reserved_access_token';
const REFRESH_KEY = 'reserved_refresh_token';
const TENANT_KEY = 'reserved_tenant_slug';

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuth(access: string, refresh: string, slug: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
  localStorage.setItem(TENANT_KEY, slug);
}

export function clearAuth(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(TENANT_KEY);
}

export function getTenantSlug(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TENANT_KEY);
}

export class AdminApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function fetchApi<T>(path: string, init?: RequestInit, withAuth = true): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init?.headers as Record<string, string>) ?? {}),
  };
  if (withAuth) {
    const token = getAccessToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = body?.error ?? { code: 'UNKNOWN', message: `HTTP ${res.status}` };
    throw new AdminApiError(res.status, err.code, err.message);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ─── Auth ─────────────────────────────────────────────────────────────

export async function login(
  tenantSlug: string,
  email: string,
  password: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant-ID': tenantSlug,
    },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new AdminApiError(
      res.status,
      body?.error?.code ?? 'LOGIN_FAILED',
      body?.error?.message ?? 'Přihlášení selhalo',
    );
  }
  return res.json();
}

// ─── Bookings ─────────────────────────────────────────────────────────

export interface AdminBooking {
  id: string;
  tenantId: string;
  branchId: string;
  serviceId: string;
  employeeId: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  startsAt: string;
  endsAt: string;
  bufferStartsAt: string;
  bufferEndsAt: string;
  status: string;
  pricePaidHellers: number;
  currency: string;
  customerNote: string | null;
  internalNote: string | null;
  referenceCode: string;
  createdAt: string;
  updatedAt: string;
}

export async function listBookings(filters: {
  from?: string;
  to?: string;
  status?: string;
}): Promise<AdminBooking[]> {
  const params = new URLSearchParams();
  if (filters.from) params.append('from', filters.from);
  if (filters.to) params.append('to', filters.to);
  if (filters.status) params.append('status', filters.status);
  const { data } = await fetchApi<{ data: AdminBooking[] }>(`/admin/bookings?${params.toString()}`);
  return data;
}

export async function rescheduleBooking(
  id: string,
  newStartsAt: string,
  newEmployeeId?: string,
): Promise<AdminBooking> {
  const body: Record<string, unknown> = { newStartsAt, notifyCustomer: true };
  if (newEmployeeId) body.newEmployeeId = newEmployeeId;
  const { data } = await fetchApi<{ data: AdminBooking }>(`/admin/bookings/${id}/reschedule`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return data;
}

export async function cancelBooking(id: string, reason: string): Promise<AdminBooking> {
  const { data } = await fetchApi<{ data: AdminBooking }>(`/admin/bookings/${id}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason, notifyCustomer: true }),
  });
  return data;
}

// ─── Services + Employees (pro decorating events) ────────────────────

export interface AdminService {
  id: string;
  name: string;
  color: string | null;
  durationMinutes: number;
  priceHellers: number;
  currency: string;
}

export interface AdminEmployee {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string | null;
  color: string | null;
}

export async function listServices(): Promise<AdminService[]> {
  const { data } = await fetchApi<{ data: AdminService[] }>(`/admin/services`);
  return data;
}

export async function listEmployees(): Promise<AdminEmployee[]> {
  const { data } = await fetchApi<{ data: AdminEmployee[] }>(`/admin/employees`);
  return data;
}

// ─── Customers (sprint 1.7) ──────────────────────────────────────────

export interface AdminCustomer {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  customerType: string;
  createdAt: string;
}

export interface AdminCustomerTag {
  id: string;
  tag: string;
  color: string | null;
  createdAt: string;
}

export interface AdminCustomerNote {
  id: string;
  note: string;
  category: string;
  visibility: string;
  createdBy: string | null;
  createdAt: string;
}

export interface AdminCustomerBooking {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  serviceId: string;
  employeeId: string | null;
  referenceCode: string;
  pricePaidHellers: number;
}

export interface AdminCustomerDetail {
  customer: AdminCustomer & {
    marketingOptIn: boolean;
    country: string | null;
    metadata: Record<string, unknown>;
  };
  tags: AdminCustomerTag[];
  notes: AdminCustomerNote[];
  bookings: AdminCustomerBooking[];
  stats: {
    totalBookings: number;
    completedCount: number;
    cancelledCount: number;
    noShowCount: number;
    totalSpentHellers: number;
  };
}

export async function listCustomers(opts: {
  search?: string;
  tag?: string;
}): Promise<AdminCustomer[]> {
  const params = new URLSearchParams();
  if (opts.search) params.append('search', opts.search);
  if (opts.tag) params.append('tag', opts.tag);
  const { data } = await fetchApi<{ data: AdminCustomer[] }>(
    `/admin/customers?${params.toString()}`,
  );
  return data;
}

export async function listCustomerTags(): Promise<
  Array<{ tag: string; color: string | null; count: number }>
> {
  const { data } = await fetchApi<{
    data: Array<{ tag: string; color: string | null; count: number }>;
  }>(`/admin/customers/tags`);
  return data;
}

export async function getCustomerDetail(id: string): Promise<AdminCustomerDetail> {
  const { data } = await fetchApi<{ data: AdminCustomerDetail }>(`/admin/customers/${id}`);
  return data;
}

export async function addCustomerTag(
  customerId: string,
  tag: string,
  color?: string,
): Promise<void> {
  await fetchApi(`/admin/customers/${customerId}/tags`, {
    method: 'POST',
    body: JSON.stringify({ tag, color: color ?? null }),
  });
}

export async function removeCustomerTag(customerId: string, tag: string): Promise<void> {
  await fetchApi(`/admin/customers/${customerId}/tags/${encodeURIComponent(tag)}`, {
    method: 'DELETE',
  });
}

export async function addCustomerNote(
  customerId: string,
  note: string,
  category: string = 'general',
): Promise<void> {
  await fetchApi(`/admin/customers/${customerId}/notes`, {
    method: 'POST',
    body: JSON.stringify({ note, category, visibility: 'all' }),
  });
}
