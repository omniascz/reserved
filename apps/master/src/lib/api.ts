// Master admin API klient. Pouziva platform JWT (audience reserved-api-platform).

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
const ADMIN_BASE = process.env.NEXT_PUBLIC_ADMIN_BASE_URL ?? 'http://localhost:3003';

const TOKEN_KEY = 'master_access_token';
const REFRESH_KEY = 'master_refresh_token';

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuth(access: string, refresh: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
}

export function clearAuth(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

export function getAdminBaseUrl(): string {
  return ADMIN_BASE;
}

export class MasterApiError extends Error {
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
    throw new MasterApiError(res.status, err.code, err.message);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ─── Auth ─────────────────────────────────────────────────────────────

export async function login(
  email: string,
  password: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  return fetchApi(
    '/platform/auth/login',
    {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    },
    false,
  );
}

export async function logout(): Promise<void> {
  const refreshToken = typeof window !== 'undefined' ? localStorage.getItem(REFRESH_KEY) : null;
  if (refreshToken) {
    await fetchApi(
      '/platform/auth/logout',
      { method: 'POST', body: JSON.stringify({ refreshToken }) },
      false,
    ).catch(() => undefined);
  }
  clearAuth();
}

export interface MasterAdminMe {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  lastLoginAt: string | null;
  createdAt: string;
}

export async function getMe(): Promise<MasterAdminMe> {
  const { data } = await fetchApi<{ data: MasterAdminMe }>('/platform/auth/me');
  return data;
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await fetchApi('/platform/auth/me/password', {
    method: 'PATCH',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

// ─── Dashboard ────────────────────────────────────────────────────────

export interface DashboardOverview {
  totalTenants: number;
  trialTenants: number;
  activeTenants: number;
  suspendedTenants: number;
  deletedTenants: number;
  newRegistrations7d: number;
  newRegistrations30d: number;
  totalBookings30d: number;
  totalCustomers: number;
  trialEndingSoon: number;
}

export async function getDashboardOverview(): Promise<DashboardOverview> {
  const { data } = await fetchApi<{ data: DashboardOverview }>('/platform/dashboard/overview');
  return data;
}

export interface RegistrationsPerDay {
  day: string;
  count: number;
}

export async function getRegistrationsPerDay(
  from?: string,
  to?: string,
): Promise<RegistrationsPerDay[]> {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const { data } = await fetchApi<{ data: RegistrationsPerDay[] }>(
    `/platform/dashboard/registrations-per-day?${params.toString()}`,
  );
  return data;
}

export interface AtRiskTenant {
  id: string;
  slug: string;
  name: string;
  ownerEmail: string | null;
  reason: 'trial_ending_soon' | 'onboarding_stalled' | 'no_activity';
  details: Record<string, unknown>;
}

export async function getAtRiskTenants(): Promise<AtRiskTenant[]> {
  const { data } = await fetchApi<{ data: AtRiskTenant[] }>('/platform/dashboard/at-risk-tenants');
  return data;
}

// ─── Tenants ──────────────────────────────────────────────────────────

export interface TenantListRow {
  id: string;
  slug: string;
  name: string;
  ownerEmail: string | null;
  businessType: string | null;
  plan: string;
  status: string;
  suspendedAt: string | null;
  trialEndsAt: string | null;
  createdAt: string;
  deletedAt: string | null;
  lastActivityAt: string | null;
}

export interface TenantListResult {
  data: TenantListRow[];
  total: number;
}

export async function listTenants(filters: {
  status?: string;
  plan?: string;
  businessType?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<TenantListResult> {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.plan) params.set('plan', filters.plan);
  if (filters.businessType) params.set('businessType', filters.businessType);
  if (filters.search) params.set('search', filters.search);
  if (filters.limit) params.set('limit', String(filters.limit));
  if (filters.offset) params.set('offset', String(filters.offset));
  return fetchApi<TenantListResult>(`/platform/tenants?${params.toString()}`);
}

export interface TenantDetail extends TenantListRow {
  customDomain: string | null;
  locale: string;
  timezone: string;
  currency: string;
  suspensionReason: string | null;
  updatedAt: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripeSubscriptionStatus: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  billingEmail: string | null;
}

export async function getTenantDetail(id: string): Promise<TenantDetail> {
  const { data } = await fetchApi<{ data: TenantDetail }>(`/platform/tenants/${id}`);
  return data;
}

export interface TenantActivity {
  ownerLastLoginAt: string | null;
  bookingsLast7Days: number;
  bookingsLast30Days: number;
  bookingsLast90Days: number;
  totalBookings: number;
  customersCount: number;
  servicesCount: number;
  employeesCount: number;
  branchesCount: number;
  lastBookingCreatedAt: string | null;
}

export async function getTenantActivity(id: string): Promise<TenantActivity> {
  const { data } = await fetchApi<{ data: TenantActivity }>(`/platform/tenants/${id}/activity`);
  return data;
}

export interface TenantOnboarding {
  emailVerified: boolean;
  firstServiceCreated: boolean;
  workingHoursSet: boolean;
  teamInvited: boolean;
  paymentsConnected: boolean;
  firstBookingReceived: boolean;
  completedAt: string | null;
  startedAt: string | null;
}

export async function getTenantOnboarding(id: string): Promise<TenantOnboarding> {
  const { data } = await fetchApi<{ data: TenantOnboarding }>(`/platform/tenants/${id}/onboarding`);
  return data;
}

export interface AuditEntry {
  id: string;
  adminId: string;
  adminEmail: string | null;
  action: string;
  targetType: string;
  targetId: string;
  payload: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export async function getTenantAudit(id: string, limit?: number): Promise<AuditEntry[]> {
  const { data } = await fetchApi<{ data: AuditEntry[] }>(
    `/platform/tenants/${id}/audit${limit ? `?limit=${limit}` : ''}`,
  );
  return data;
}

export async function getGlobalAudit(filters?: {
  adminId?: string;
  action?: string;
  limit?: number;
}): Promise<AuditEntry[]> {
  const params = new URLSearchParams();
  if (filters?.adminId) params.set('adminId', filters.adminId);
  if (filters?.action) params.set('action', filters.action);
  if (filters?.limit) params.set('limit', String(filters.limit));
  const { data } = await fetchApi<{ data: AuditEntry[] }>(`/platform/audit?${params.toString()}`);
  return data;
}

// ─── Master akce ─────────────────────────────────────────────────────

export async function suspendTenant(id: string, reason: string): Promise<void> {
  await fetchApi(`/platform/tenants/${id}/suspend`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export async function reactivateTenant(id: string): Promise<void> {
  await fetchApi(`/platform/tenants/${id}/reactivate`, { method: 'POST' });
}

export async function extendTrial(id: string, days: number): Promise<{ trialEndsAt: string }> {
  const { data } = await fetchApi<{ data: { trialEndsAt: string } }>(
    `/platform/tenants/${id}/extend-trial`,
    { method: 'POST', body: JSON.stringify({ days }) },
  );
  return data;
}

export async function changeTenantPlan(id: string, plan: string): Promise<void> {
  await fetchApi(`/platform/tenants/${id}/plan`, {
    method: 'PATCH',
    body: JSON.stringify({ plan }),
  });
}

export async function softDeleteTenant(id: string): Promise<void> {
  await fetchApi(`/platform/tenants/${id}`, { method: 'DELETE' });
}

export interface ImpersonateResult {
  accessToken: string;
  expiresIn: number;
  tenant: { id: string; slug: string; name: string };
  owner: { id: string; email: string; firstName: string; lastName: string };
}

export async function impersonateTenant(id: string): Promise<ImpersonateResult> {
  const { data } = await fetchApi<{ data: ImpersonateResult }>(
    `/platform/tenants/${id}/impersonate`,
    { method: 'POST' },
  );
  return data;
}
