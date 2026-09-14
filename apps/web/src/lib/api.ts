// API klient pro admin endpointy. JWT token v paměti + localStorage.

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4010/api/v1';

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

/**
 * Dekoduje JWT a vrati impersonatedBy claim (UUID master admina), pokud existuje.
 * Pouziva se k zobrazeni impersonace banneru.
 */
export function getImpersonatedBy(): string | null {
  const token = getAccessToken();
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payloadJson = atob(parts[1]!.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(payloadJson) as { impersonatedBy?: string };
    return payload.impersonatedBy ?? null;
  } catch {
    return null;
  }
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
  onlineMeetingUrl: string | null;
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

export async function markBookingNoShow(id: string): Promise<AdminBooking> {
  const { data } = await fetchApi<{ data: AdminBooking }>(`/admin/bookings/${id}/mark-no-show`, {
    method: 'POST',
  });
  return data;
}

export async function markBookingCompleted(id: string): Promise<AdminBooking> {
  const { data } = await fetchApi<{ data: AdminBooking }>(`/admin/bookings/${id}/mark-completed`, {
    method: 'POST',
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

// ─── Services CRUD (sprint 1.3) ───────────────────────────────────────

export interface AdminServiceFull extends AdminService {
  description: string | null;
  categoryId: string | null;
  bufferAfterMinutes: number;
  bufferBeforeMinutes: number;
  imageUrl: string | null;
  isPublic: boolean;
  depositPercent: number | null;
  capacity: number;
  /** Archetyp služby (sprint 10.1) — NULL = bez archetypu. */
  archetype: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
}

// ─── Archetypy služeb (sprint 10.1) ───────────────────────────────────

export interface ServiceArchetypeSpec {
  id: string;
  label: string;
  description: string;
  defaultCapacity: number;
  group: boolean;
}

export async function listServiceArchetypes(): Promise<ServiceArchetypeSpec[]> {
  const { data } = await fetchApi<{ data: ServiceArchetypeSpec[] }>(`/admin/services/archetypes`);
  return data;
}

export interface AdminServiceCategory {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
}

export async function listServicesFull(): Promise<AdminServiceFull[]> {
  const { data } = await fetchApi<{ data: AdminServiceFull[] }>(`/admin/services`);
  return data;
}

export async function listServiceCategories(): Promise<AdminServiceCategory[]> {
  const { data } = await fetchApi<{ data: AdminServiceCategory[] }>(`/admin/service-categories`);
  return data;
}

export async function createService(input: {
  categoryId?: string | null;
  name: string;
  description?: string | null;
  durationMinutes: number;
  bufferAfterMinutes?: number;
  bufferBeforeMinutes?: number;
  priceHellers: number;
  currency?: string;
  color?: string | null;
  imageUrl?: string | null;
  isPublic?: boolean;
  depositPercent?: number | null;
  capacity?: number;
  archetype?: string | null;
  sortOrder?: number;
}): Promise<AdminServiceFull> {
  const { data } = await fetchApi<{ data: AdminServiceFull }>(`/admin/services`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data;
}

export async function updateService(
  id: string,
  input: Partial<Parameters<typeof createService>[0]> & { isActive?: boolean },
): Promise<AdminServiceFull> {
  const { data } = await fetchApi<{ data: AdminServiceFull }>(`/admin/services/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return data;
}

export async function deleteService(id: string): Promise<void> {
  await fetchApi(`/admin/services/${id}`, { method: 'DELETE' });
}

export async function createServiceCategory(input: {
  name: string;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
  sortOrder?: number;
}): Promise<AdminServiceCategory> {
  const { data } = await fetchApi<{ data: AdminServiceCategory }>(`/admin/service-categories`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data;
}

// ─── Employees CRUD (sprint 1.3) ──────────────────────────────────────

export interface AdminEmployeeFull extends AdminEmployee {
  email: string | null;
  phone: string | null;
  title: string | null;
  bio: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  isPublic: boolean;
  acceptsOnlineBookings: boolean;
  sortOrder: number;
  createdAt: string;
}

export async function listEmployeesFull(): Promise<AdminEmployeeFull[]> {
  const { data } = await fetchApi<{ data: AdminEmployeeFull[] }>(`/admin/employees`);
  return data;
}

export async function createEmployee(input: {
  firstName: string;
  lastName: string;
  displayName?: string | null;
  email?: string | null;
  phone?: string | null;
  title?: string | null;
  bio?: string | null;
  color?: string | null;
  avatarUrl?: string | null;
  isPublic?: boolean;
  acceptsOnlineBookings?: boolean;
  sortOrder?: number;
}): Promise<AdminEmployeeFull> {
  const { data } = await fetchApi<{ data: AdminEmployeeFull }>(`/admin/employees`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data;
}

export async function updateEmployee(
  id: string,
  input: Partial<Parameters<typeof createEmployee>[0]> & { isActive?: boolean },
): Promise<AdminEmployeeFull> {
  const { data } = await fetchApi<{ data: AdminEmployeeFull }>(`/admin/employees/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return data;
}

export async function deleteEmployee(id: string): Promise<void> {
  await fetchApi(`/admin/employees/${id}`, { method: 'DELETE' });
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

// ─── GDPR: export a výmaz osobních údajů ─────────────────────────────

export interface GdprExport {
  format: string;
  generatedAt: string;
  tenantId: string;
  subject: { type: string; id: string };
  customer?: Record<string, unknown>;
  employee?: Record<string, unknown>;
  data: Record<string, Array<Record<string, unknown>>>;
  pocty: Record<string, number>;
  nezahrnuto: Array<{ zdroj: string; duvod: string }>;
}

export interface GdprEraseResult {
  subject: { type: string; id: string };
  erasedAt: string;
  anonymizedEmail: string;
  smazano: Record<string, number>;
  anonymizovano: Record<string, number>;
  ponechano: Array<{ zdroj: string; duvod: string }>;
}

export async function exportCustomerGdpr(customerId: string): Promise<GdprExport> {
  const { data } = await fetchApi<{ data: GdprExport }>(
    `/admin/gdpr/customers/${customerId}/export`,
  );
  return data;
}

/** Nevratné. `confirm: true` posílá API schválně explicitně — viz gdpr.dto.ts. */
export async function eraseCustomerGdpr(
  customerId: string,
  reason?: string,
): Promise<GdprEraseResult> {
  const { data } = await fetchApi<{ data: GdprEraseResult }>(
    `/admin/gdpr/customers/${customerId}/erase`,
    {
      method: 'POST',
      body: JSON.stringify({ confirm: true, ...(reason ? { reason } : {}) }),
    },
  );
  return data;
}

export async function exportEmployeeGdpr(employeeId: string): Promise<GdprExport> {
  const { data } = await fetchApi<{ data: GdprExport }>(
    `/admin/gdpr/employees/${employeeId}/export`,
  );
  return data;
}

export async function eraseEmployeeGdpr(
  employeeId: string,
  reason?: string,
): Promise<GdprEraseResult> {
  const { data } = await fetchApi<{ data: GdprEraseResult }>(
    `/admin/gdpr/employees/${employeeId}/erase`,
    {
      method: 'POST',
      body: JSON.stringify({ confirm: true, ...(reason ? { reason } : {}) }),
    },
  );
  return data;
}

// ─── Settings, Blocks, Holidays (sprint 1.8) ─────────────────────────

export interface BookingRules {
  maxDaysAhead: number;
  minHoursBefore: number;
  stornoLimitHours: number;
  presunLimitHours: number;
  slotIntervalMinutes: number;
  perDayRescheduleRules: Array<{ fromDay: string; toDay: string | null }>;
}

export async function getBookingRules(): Promise<BookingRules> {
  const { data } = await fetchApi<{ data: BookingRules }>(`/admin/settings/booking`);
  return data;
}

export async function updateBookingRules(rules: Partial<BookingRules>): Promise<BookingRules> {
  const { data } = await fetchApi<{ data: BookingRules }>(`/admin/settings/booking`, {
    method: 'PATCH',
    body: JSON.stringify(rules),
  });
  return data;
}

export interface AdminBlock {
  id: string;
  startsAt: string;
  endsAt: string;
  blockType: string;
  title: string | null;
  note: string | null;
  branchId: string | null;
  employeeId: string | null;
}

export async function listBlocks(from?: string, to?: string): Promise<AdminBlock[]> {
  const params = new URLSearchParams();
  if (from) params.append('from', from);
  if (to) params.append('to', to);
  const { data } = await fetchApi<{ data: AdminBlock[] }>(`/admin/blocks?${params.toString()}`);
  return data;
}

export async function createBlock(input: {
  startsAt: string;
  endsAt: string;
  blockType: string;
  title?: string;
  note?: string;
  employeeId?: string;
}): Promise<AdminBlock> {
  const { data } = await fetchApi<{ data: AdminBlock }>(`/admin/blocks`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data;
}

export async function deleteBlock(id: string): Promise<void> {
  await fetchApi(`/admin/blocks/${id}`, { method: 'DELETE' });
}

export interface AdminHoliday {
  id: string;
  date: string;
  name: string;
  source: string;
  isOpen: boolean;
}

export async function listHolidays(from?: string, to?: string): Promise<AdminHoliday[]> {
  const params = new URLSearchParams();
  if (from) params.append('from', from);
  if (to) params.append('to', to);
  const { data } = await fetchApi<{ data: AdminHoliday[] }>(`/admin/holidays?${params.toString()}`);
  return data;
}

export async function createHoliday(input: {
  date: string;
  name: string;
  isOpen?: boolean;
}): Promise<AdminHoliday> {
  const { data } = await fetchApi<{ data: AdminHoliday }>(`/admin/holidays`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data;
}

export async function deleteHoliday(id: string): Promise<void> {
  await fetchApi(`/admin/holidays/${id}`, { method: 'DELETE' });
}

export async function importCzHolidays(
  year: number,
): Promise<{ inserted: number; skipped: number }> {
  const { data } = await fetchApi<{ data: { inserted: number; skipped: number } }>(
    `/admin/holidays/import-cz?year=${year}`,
    { method: 'POST' },
  );
  return data;
}

// ─── Branches (sprint 2.4) ───────────────────────────────────────────

export interface AdminBranch {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  country: string;
  phone: string | null;
  email: string | null;
  timezone: string | null;
  isDefault: string | null;
  createdAt: string;
}

export async function listBranches(): Promise<AdminBranch[]> {
  const { data } = await fetchApi<{ data: AdminBranch[] }>(`/admin/branches`);
  return data;
}

export async function createBranch(input: {
  name: string;
  slug: string;
  address?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  phone?: string;
  email?: string;
}): Promise<AdminBranch> {
  const { data } = await fetchApi<{ data: AdminBranch }>(`/admin/branches`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data;
}

export async function updateBranch(
  id: string,
  input: Partial<{
    name: string;
    slug: string;
    address: string | null;
    city: string | null;
    postalCode: string | null;
    country: string;
    phone: string | null;
    email: string | null;
  }>,
): Promise<AdminBranch> {
  const { data } = await fetchApi<{ data: AdminBranch }>(`/admin/branches/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return data;
}

export async function deleteBranch(id: string): Promise<void> {
  await fetchApi(`/admin/branches/${id}`, { method: 'DELETE' });
}

// ─── Rules (sprint 2.5) ──────────────────────────────────────────────

export interface AdminRule {
  id: string;
  name: string;
  description: string | null;
  triggerEvent: string;
  conditions: unknown;
  actions: Array<{ type: string; config: Record<string, unknown> }>;
  isEnabled: boolean;
  priority: number;
  triggerCount: number;
  lastTriggeredAt: string | null;
  createdAt: string;
}

export interface AdminRuleExecution {
  id: string;
  ruleId: string;
  eventType: string;
  eventPayload: Record<string, unknown>;
  matched: boolean;
  actionResults: Array<{ action: string; status: string; message?: string }>;
  durationMs: number | null;
  error: string | null;
  createdAt: string;
}

export async function listRules(): Promise<AdminRule[]> {
  const { data } = await fetchApi<{ data: AdminRule[] }>(`/admin/rules`);
  return data;
}

export async function createRule(input: {
  name: string;
  description?: string;
  triggerEvent: string;
  conditions: unknown;
  actions: Array<{ type: string; config: Record<string, unknown> }>;
  isEnabled?: boolean;
  priority?: number;
}): Promise<AdminRule> {
  const { data } = await fetchApi<{ data: AdminRule }>(`/admin/rules`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data;
}

export async function updateRule(
  id: string,
  input: Partial<{
    name: string;
    description: string | null;
    triggerEvent: string;
    conditions: unknown;
    actions: Array<{ type: string; config: Record<string, unknown> }>;
    isEnabled: boolean;
    priority: number;
  }>,
): Promise<AdminRule> {
  const { data } = await fetchApi<{ data: AdminRule }>(`/admin/rules/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return data;
}

export async function deleteRule(id: string): Promise<void> {
  await fetchApi(`/admin/rules/${id}`, { method: 'DELETE' });
}

export async function listRuleExecutions(
  ruleId: string,
  limit = 20,
): Promise<AdminRuleExecution[]> {
  const { data } = await fetchApi<{ data: AdminRuleExecution[] }>(
    `/admin/rules/${ruleId}/executions?limit=${limit}`,
  );
  return data;
}

// ─── Credit packs (sprint 3.1) ───────────────────────────────────────

export interface AdminCreditPack {
  id: string;
  name: string;
  description: string | null;
  mode: 'per_visit' | 'per_credit';
  totalCredits: number;
  validityDays: number | null;
  priceHellers: number;
  currency: string;
  allowedServiceIds: string[];
  allowedBranchIds: string[];
  creditCostsByService: Record<string, number>;
  isActive: boolean;
  createdAt: string;
}

export interface AdminCustomerCreditPack {
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
  note: string | null;
  purchasedAt: string;
}

export interface AdminCreditUse {
  id: string;
  bookingId: string | null;
  creditsDeducted: number;
  action: 'consumed' | 'refunded' | 'penalty' | 'admin_adjustment' | 'expired_balance';
  note: string | null;
  createdAt: string;
}

export async function listCreditPacks(): Promise<AdminCreditPack[]> {
  const { data } = await fetchApi<{ data: AdminCreditPack[] }>(`/admin/credit-packs`);
  return data;
}

export async function createCreditPack(input: {
  name: string;
  description?: string;
  mode: 'per_visit' | 'per_credit';
  totalCredits: number;
  validityDays?: number | null;
  priceHellers: number;
  currency?: string;
  allowedServiceIds: string[];
  allowedBranchIds: string[];
  creditCostsByService?: Record<string, number>;
  isActive?: boolean;
}): Promise<AdminCreditPack> {
  const { data } = await fetchApi<{ data: AdminCreditPack }>(`/admin/credit-packs`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data;
}

export async function updateCreditPack(
  id: string,
  input: Partial<Parameters<typeof createCreditPack>[0]>,
): Promise<AdminCreditPack> {
  const { data } = await fetchApi<{ data: AdminCreditPack }>(`/admin/credit-packs/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return data;
}

export async function deleteCreditPack(id: string): Promise<void> {
  await fetchApi(`/admin/credit-packs/${id}`, { method: 'DELETE' });
}

export async function listCustomerCreditPacks(
  customerId: string,
): Promise<AdminCustomerCreditPack[]> {
  const { data } = await fetchApi<{ data: AdminCustomerCreditPack[] }>(
    `/admin/customers/${customerId}/credit-packs`,
  );
  return data;
}

export async function allocateCreditPack(
  customerId: string,
  input: { creditPackId: string; pricePaidHellers?: number; note?: string },
): Promise<AdminCustomerCreditPack> {
  const { data } = await fetchApi<{ data: AdminCustomerCreditPack }>(
    `/admin/customers/${customerId}/credit-packs`,
    { method: 'POST', body: JSON.stringify(input) },
  );
  return data;
}

export async function adjustCreditAllocation(
  allocationId: string,
  creditsDelta: number,
  note: string,
): Promise<{ allocationId: string; newRemaining: number }> {
  const { data } = await fetchApi<{ data: { allocationId: string; newRemaining: number } }>(
    `/admin/credit-packs/allocation/${allocationId}/adjust`,
    { method: 'PATCH', body: JSON.stringify({ creditsDelta, note }) },
  );
  return data;
}

export async function listCreditUses(allocationId: string): Promise<AdminCreditUse[]> {
  const { data } = await fetchApi<{ data: AdminCreditUse[] }>(
    `/admin/credit-packs/allocation/${allocationId}/uses`,
  );
  return data;
}

// ─── Reports (sprint 4.1) ────────────────────────────────────────────

export interface ReportFilters {
  from?: string;
  to?: string;
  branchId?: string;
}

function buildReportQuery(f: ReportFilters): string {
  const params = new URLSearchParams();
  if (f.from) params.append('from', f.from);
  if (f.to) params.append('to', f.to);
  if (f.branchId) params.append('branchId', f.branchId);
  return params.toString();
}

export interface ReportOverview {
  totalBookings: number;
  revenueHellers: number;
  completedCount: number;
  cancelledCount: number;
  noShowCount: number;
  confirmedCount: number;
  uniqueCustomers: number;
  activeCreditPacks: number;
}

export interface ReportOverviewWithCompare {
  current: ReportOverview;
  previous: ReportOverview;
}

export async function getReportOverview(
  filters: ReportFilters,
): Promise<ReportOverviewWithCompare> {
  const qs = buildReportQuery(filters);
  const { data } = await fetchApi<{ data: ReportOverviewWithCompare }>(
    `/admin/reports/overview?${qs}`,
  );
  return data;
}

export interface ClassUtilization {
  sessions: number;
  totalCapacity: number;
  totalBooked: number;
  fillRatePct: number;
  present: number;
  noShow: number;
  attendanceRatePct: number;
}

export async function getClassUtilization(filters: ReportFilters): Promise<ClassUtilization> {
  const qs = buildReportQuery(filters);
  const { data } = await fetchApi<{ data: ClassUtilization }>(
    `/admin/reports/class-utilization?${qs}`,
  );
  return data;
}

export interface MrrReport {
  activeSubscriptions: number;
  mrrHellers: number;
  arrHellers: number;
}

export async function getMrr(): Promise<MrrReport> {
  const { data } = await fetchApi<{ data: MrrReport }>(`/admin/reports/mrr`);
  return data;
}

export interface BookingPerDay {
  day: string;
  count: number;
  revenueHellers: number;
}

export async function getBookingsPerDay(filters: ReportFilters): Promise<BookingPerDay[]> {
  const qs = buildReportQuery(filters);
  const { data } = await fetchApi<{ data: BookingPerDay[] }>(
    `/admin/reports/bookings-per-day?${qs}`,
  );
  return data;
}

export interface TopServiceRow {
  serviceId: string;
  serviceName: string;
  bookings: number;
  revenueHellers: number;
}

export async function getTopServices(filters: ReportFilters): Promise<TopServiceRow[]> {
  const qs = buildReportQuery(filters);
  const { data } = await fetchApi<{ data: TopServiceRow[] }>(`/admin/reports/top-services?${qs}`);
  return data;
}

export interface TopEmployeeRow {
  employeeId: string | null;
  name: string;
  bookings: number;
  completedCount: number;
  revenueHellers: number;
}

export async function getTopEmployees(filters: ReportFilters): Promise<TopEmployeeRow[]> {
  const qs = buildReportQuery(filters);
  const { data } = await fetchApi<{ data: TopEmployeeRow[] }>(`/admin/reports/top-employees?${qs}`);
  return data;
}

export interface TopCustomerRow {
  customerId: string;
  name: string;
  email: string;
  bookings: number;
  spentHellers: number;
  noShowCount: number;
}

export async function getTopCustomers(filters: ReportFilters): Promise<TopCustomerRow[]> {
  const qs = buildReportQuery(filters);
  const { data } = await fetchApi<{ data: TopCustomerRow[] }>(`/admin/reports/top-customers?${qs}`);
  return data;
}

export interface CreditPackSummary {
  status: string;
  count: number;
  totalCreditsRemaining: number;
  totalRevenueHellers: number;
}

export async function getCreditPacksSummary(): Promise<CreditPackSummary[]> {
  const { data } = await fetchApi<{ data: CreditPackSummary[] }>(`/admin/reports/credit-packs`);
  return data;
}

export interface EmailStatsRow {
  template: string;
  total: number;
  sent: number;
  failed: number;
  pending: number;
}

export interface EmailStats {
  totals: { total: number; sent: number; failed: number; pending: number };
  perTemplate: EmailStatsRow[];
}

export async function getEmailStats(filters: ReportFilters): Promise<EmailStats> {
  const qs = buildReportQuery(filters);
  const { data } = await fetchApi<{ data: EmailStats }>(`/admin/reports/emails?${qs}`);
  return data;
}

// ─── Payments (sprint 3.2) ───────────────────────────────────────────

// POZOR: musí se shodovat s PAYMENT_METHOD_TYPES v API
// (apps/api/src/payments/dto/payment.dto.ts). Jsou to dvě nezávislá místa a
// rozešla se: API české brány přijímalo, ale admin o nich nevěděl, takže se
// nedaly nastavit jinak než přímým voláním API.
export type PaymentMethodType =
  | 'cash'
  | 'card_terminal'
  | 'qr_bank'
  | 'stripe'
  | 'gopay'
  | 'comgate'
  | 'thepay'
  | 'payu'
  | 'gpwebpay';
export type PaymentStatus = 'pending' | 'succeeded' | 'failed' | 'refunded' | 'cancelled';

export interface AdminPaymentMethod {
  id: string;
  methodType: PaymentMethodType;
  displayName: string | null;
  config: Record<string, unknown>;
  isEnabled: boolean;
  sortOrder: number;
}

export interface AdminPayment {
  id: string;
  customerId: string | null;
  bookingId: string | null;
  creditPackAllocationId: string | null;
  amountHellers: number;
  currency: string;
  methodType: PaymentMethodType;
  status: PaymentStatus;
  description: string | null;
  referenceCode: string | null;
  paidAt: string | null;
  createdAt: string;
}

export async function listPaymentMethods(): Promise<AdminPaymentMethod[]> {
  const { data } = await fetchApi<{ data: AdminPaymentMethod[] }>(`/admin/payment-methods`);
  return data;
}

export async function upsertPaymentMethod(input: {
  methodType: PaymentMethodType;
  displayName?: string;
  config?: Record<string, unknown>;
  isEnabled?: boolean;
  sortOrder?: number;
}): Promise<AdminPaymentMethod> {
  const { data } = await fetchApi<{ data: AdminPaymentMethod }>(`/admin/payment-methods`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data;
}

export async function deletePaymentMethod(methodType: string): Promise<void> {
  await fetchApi(`/admin/payment-methods/${methodType}`, { method: 'DELETE' });
}

export async function listPayments(filters: {
  from?: string;
  to?: string;
  status?: PaymentStatus;
  methodType?: PaymentMethodType;
  customerId?: string;
}): Promise<AdminPayment[]> {
  const params = new URLSearchParams();
  if (filters.from) params.append('from', filters.from);
  if (filters.to) params.append('to', filters.to);
  if (filters.status) params.append('status', filters.status);
  if (filters.methodType) params.append('methodType', filters.methodType);
  if (filters.customerId) params.append('customerId', filters.customerId);
  const { data } = await fetchApi<{ data: AdminPayment[] }>(`/admin/payments?${params.toString()}`);
  return data;
}

export async function recordPayment(input: {
  customerId?: string;
  bookingId?: string;
  creditPackAllocationId?: string;
  amountHellers: number;
  currency?: string;
  methodType: PaymentMethodType;
  description?: string;
  referenceCode?: string;
}): Promise<AdminPayment> {
  const { data } = await fetchApi<{ data: AdminPayment }>(`/admin/payments`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data;
}

export async function markPaymentPaid(id: string): Promise<AdminPayment> {
  const { data } = await fetchApi<{ data: AdminPayment }>(`/admin/payments/${id}/mark-paid`, {
    method: 'POST',
  });
  return data;
}

export async function refundPayment(
  id: string,
  amountHellers?: number,
  reason?: string,
): Promise<AdminPayment> {
  const { data } = await fetchApi<{ data: AdminPayment }>(`/admin/payments/${id}/refund`, {
    method: 'POST',
    body: JSON.stringify({ amountHellers, reason }),
  });
  return data;
}

export async function generateQrForPayment(
  id: string,
): Promise<{ spayd: string; amount: number; iban: string }> {
  const { data } = await fetchApi<{ data: { spayd: string; amount: number; iban: string } }>(
    `/admin/payments/${id}/qr`,
  );
  return data;
}

export async function createCheckout(input: {
  methodType: 'stripe' | 'gopay' | 'mock';
  amountHellers: number;
  currency?: string;
  description: string;
  customerId?: string;
  customerEmail?: string;
  bookingId?: string;
  creditPackAllocationId?: string;
}): Promise<{ paymentId: string; checkoutUrl: string }> {
  const { data } = await fetchApi<{ data: { paymentId: string; checkoutUrl: string } }>(
    `/admin/payments/checkout`,
    { method: 'POST', body: JSON.stringify(input) },
  );
  return data;
}

// ─── Bundle packs (sprint 3.3 phase A1) ───────────────────────────────

export interface BundleItem {
  serviceId: string;
  quantity: number;
}

export interface AdminBundlePack {
  id: string;
  name: string;
  description: string | null;
  items: BundleItem[];
  validityDays: number | null;
  priceHellers: number;
  currency: string;
  allowedBranchIds: string[];
  sameVisitRequired: boolean;
  isActive: boolean;
  createdAt: string;
}

export async function listBundlePacks(): Promise<AdminBundlePack[]> {
  const { data } = await fetchApi<{ data: AdminBundlePack[] }>(`/admin/bundle-packs`);
  return data;
}

export async function createBundlePack(input: {
  name: string;
  description?: string | null;
  items: BundleItem[];
  validityDays?: number | null;
  priceHellers: number;
  currency?: string;
  allowedBranchIds?: string[];
  sameVisitRequired?: boolean;
  isActive?: boolean;
}): Promise<AdminBundlePack> {
  const { data } = await fetchApi<{ data: AdminBundlePack }>(`/admin/bundle-packs`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data;
}

export async function updateBundlePack(
  id: string,
  input: Partial<Parameters<typeof createBundlePack>[0]>,
): Promise<AdminBundlePack> {
  const { data } = await fetchApi<{ data: AdminBundlePack }>(`/admin/bundle-packs/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return data;
}

export async function deleteBundlePack(id: string): Promise<void> {
  await fetchApi(`/admin/bundle-packs/${id}`, { method: 'DELETE' });
}

export interface AdminCustomerBundlePack {
  id: string;
  bundlePackId: string;
  packName: string | null;
  itemsRemaining: BundleItem[];
  snapshotItems: BundleItem[];
  validFrom: string;
  validUntil: string | null;
  status: 'active' | 'expired' | 'used_up' | 'refunded' | 'cancelled';
  pricePaidHellers: number;
  note: string | null;
  purchasedAt: string;
}

export async function listCustomerBundlePacks(
  customerId: string,
): Promise<AdminCustomerBundlePack[]> {
  const { data } = await fetchApi<{ data: AdminCustomerBundlePack[] }>(
    `/admin/customers/${customerId}/bundle-packs`,
  );
  return data;
}

export async function allocateBundlePack(
  customerId: string,
  input: { bundlePackId: string; pricePaidHellers?: number; note?: string },
): Promise<AdminCustomerBundlePack> {
  const { data } = await fetchApi<{ data: AdminCustomerBundlePack }>(
    `/admin/customers/${customerId}/bundle-packs`,
    { method: 'POST', body: JSON.stringify(input) },
  );
  return data;
}

export async function allocateBundlePackToCorporate(
  corporateAccountId: string,
  input: { bundlePackId: string; pricePaidHellers?: number; note?: string },
): Promise<AdminCustomerBundlePack> {
  const { data } = await fetchApi<{ data: AdminCustomerBundlePack }>(
    `/admin/corporate-accounts/${corporateAccountId}/bundle-packs`,
    { method: 'POST', body: JSON.stringify(input) },
  );
  return data;
}

// ─── Time packs (sprint 3.3 phase A2) ─────────────────────────────────

export interface AdminTimePack {
  id: string;
  name: string;
  description: string | null;
  durationDays: number;
  maxBookingsPerPeriod: number | null;
  maxBookingsPerDay: number | null;
  allowedServiceIds: string[];
  allowedBranchIds: string[];
  priceHellers: number;
  currency: string;
  isActive: boolean;
  createdAt: string;
}

export async function listTimePacks(): Promise<AdminTimePack[]> {
  const { data } = await fetchApi<{ data: AdminTimePack[] }>(`/admin/time-packs`);
  return data;
}

export async function createTimePack(input: {
  name: string;
  description?: string | null;
  durationDays: number;
  maxBookingsPerPeriod?: number | null;
  maxBookingsPerDay?: number | null;
  allowedServiceIds?: string[];
  allowedBranchIds?: string[];
  priceHellers: number;
  currency?: string;
  isActive?: boolean;
}): Promise<AdminTimePack> {
  const { data } = await fetchApi<{ data: AdminTimePack }>(`/admin/time-packs`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data;
}

export async function updateTimePack(
  id: string,
  input: Partial<Parameters<typeof createTimePack>[0]>,
): Promise<AdminTimePack> {
  const { data } = await fetchApi<{ data: AdminTimePack }>(`/admin/time-packs/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return data;
}

export async function deleteTimePack(id: string): Promise<void> {
  await fetchApi(`/admin/time-packs/${id}`, { method: 'DELETE' });
}

export interface AdminCustomerTimePack {
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

export async function listCustomerTimePacks(customerId: string): Promise<AdminCustomerTimePack[]> {
  const { data } = await fetchApi<{ data: AdminCustomerTimePack[] }>(
    `/admin/customers/${customerId}/time-packs`,
  );
  return data;
}

export async function allocateTimePack(
  customerId: string,
  input: { timePackId: string; pricePaidHellers?: number; note?: string },
): Promise<AdminCustomerTimePack> {
  const { data } = await fetchApi<{ data: AdminCustomerTimePack }>(
    `/admin/customers/${customerId}/time-packs`,
    { method: 'POST', body: JSON.stringify(input) },
  );
  return data;
}

export async function allocateTimePackToCorporate(
  corporateAccountId: string,
  input: { timePackId: string; pricePaidHellers?: number; note?: string },
): Promise<AdminCustomerTimePack> {
  const { data } = await fetchApi<{ data: AdminCustomerTimePack }>(
    `/admin/corporate-accounts/${corporateAccountId}/time-packs`,
    { method: 'POST', body: JSON.stringify(input) },
  );
  return data;
}

// ─── Subscriptions (sprint 3.3 phase A3) ──────────────────────────────

export interface SubscriptionBenefits {
  discountPercent?: number;
  priorityAccess?: boolean;
  freeCreditsPerPeriod?: number;
  exclusiveServiceIds?: string[];
}

export interface AdminSubscriptionPlan {
  id: string;
  name: string;
  description: string | null;
  billingInterval: 'monthly' | 'quarterly' | 'yearly';
  priceHellers: number;
  currency: string;
  trialDays: number;
  benefits: SubscriptionBenefits;
  stripeProductId: string | null;
  stripePriceId: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface AdminCustomerSubscription {
  id: string;
  planId: string;
  planName: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  status: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  trialEnd: string | null;
  canceledAt: string | null;
  cancelAtPeriodEnd: boolean;
  snapshotBenefits: SubscriptionBenefits;
  snapshotBillingInterval: string;
  snapshotPriceHellers: number;
  note: string | null;
  createdAt: string;
}

export async function listSubscriptionPlans(): Promise<AdminSubscriptionPlan[]> {
  const { data } = await fetchApi<{ data: AdminSubscriptionPlan[] }>(`/admin/subscription-plans`);
  return data;
}

export async function createSubscriptionPlan(input: {
  name: string;
  description?: string | null;
  billingInterval: 'monthly' | 'quarterly' | 'yearly';
  priceHellers: number;
  currency?: string;
  trialDays?: number;
  benefits?: SubscriptionBenefits;
  isActive?: boolean;
}): Promise<AdminSubscriptionPlan> {
  const { data } = await fetchApi<{ data: AdminSubscriptionPlan }>(`/admin/subscription-plans`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data;
}

export async function updateSubscriptionPlan(
  id: string,
  input: Partial<Parameters<typeof createSubscriptionPlan>[0]>,
): Promise<AdminSubscriptionPlan> {
  const { data } = await fetchApi<{ data: AdminSubscriptionPlan }>(
    `/admin/subscription-plans/${id}`,
    { method: 'PATCH', body: JSON.stringify(input) },
  );
  return data;
}

export async function deleteSubscriptionPlan(id: string): Promise<void> {
  await fetchApi(`/admin/subscription-plans/${id}`, { method: 'DELETE' });
}

export async function listCustomerSubscriptions(
  customerId: string,
): Promise<AdminCustomerSubscription[]> {
  const { data } = await fetchApi<{ data: AdminCustomerSubscription[] }>(
    `/admin/customers/${customerId}/subscriptions`,
  );
  return data;
}

export async function subscribeCustomer(
  customerId: string,
  input: { planId: string; successUrl: string; cancelUrl: string; note?: string },
): Promise<{ subscriptionId: string; checkoutUrl: string }> {
  const { data } = await fetchApi<{
    data: { subscriptionId: string; checkoutUrl: string };
  }>(`/admin/customers/${customerId}/subscriptions`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data;
}

export async function cancelSubscription(
  subscriptionId: string,
  input: { atPeriodEnd?: boolean; reason?: string },
): Promise<{ subscriptionId: string; status: string; cancelAtPeriodEnd: boolean }> {
  const { data } = await fetchApi<{
    data: { subscriptionId: string; status: string; cancelAtPeriodEnd: boolean };
  }>(`/admin/subscriptions/${subscriptionId}/cancel`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data;
}

export async function allocateCreditPackToCorporate(
  corporateAccountId: string,
  input: { creditPackId: string; pricePaidHellers?: number; note?: string },
): Promise<AdminCustomerCreditPack> {
  const { data } = await fetchApi<{ data: AdminCustomerCreditPack }>(
    `/admin/corporate-accounts/${corporateAccountId}/credit-packs`,
    { method: 'POST', body: JSON.stringify(input) },
  );
  return data;
}

// ─── Corporate accounts (sprint 3.3 B1-B3) ────────────────────────────

export interface AdminCorporateAccount {
  id: string;
  companyName: string;
  vatId: string | null;
  companyRegId: string | null;
  billingAddressLine1: string | null;
  billingAddressLine2: string | null;
  billingCity: string | null;
  billingZip: string | null;
  billingCountry: string;
  contactEmail: string | null;
  contactPhone: string | null;
  contactPersonName: string | null;
  note: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface AdminCorporateMember {
  id: string;
  corporateAccountId: string;
  customerId: string;
  role: 'member' | 'admin';
  joinedAt: string;
  removedAt: string | null;
  customer: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
  };
}

export interface AdminCorporateSummary {
  activeMembers: number;
  creditPacks: {
    total: number;
    active: number;
    remainingCredits: number;
    totalSpentHellers: number;
  };
  bundlePacks: { total: number; active: number; remainingItems: number; totalSpentHellers: number };
  timePacks: { total: number; active: number; totalSpentHellers: number };
  totalSpentHellers: number;
}

export interface AdminCorporateUsage {
  type: 'credit' | 'bundle' | 'time';
  useId: string;
  createdAt: string;
  quantity: number;
  action: string;
  bookingId: string | null;
  customerId: string | null;
  customerName: string | null;
  serviceId: string | null;
}

export interface AdminCorporateUsageReport {
  fromDate: string | null;
  toDate: string | null;
  totalUsages: number;
  usages: AdminCorporateUsage[];
}

export async function listCorporateAccounts(): Promise<AdminCorporateAccount[]> {
  const { data } = await fetchApi<{ data: AdminCorporateAccount[] }>(`/admin/corporate-accounts`);
  return data;
}

export async function getCorporateAccount(id: string): Promise<AdminCorporateAccount> {
  const { data } = await fetchApi<{ data: AdminCorporateAccount }>(
    `/admin/corporate-accounts/${id}`,
  );
  return data;
}

export async function createCorporateAccount(input: {
  companyName: string;
  vatId?: string | null;
  companyRegId?: string | null;
  billingAddressLine1?: string | null;
  billingAddressLine2?: string | null;
  billingCity?: string | null;
  billingZip?: string | null;
  billingCountry?: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  contactPersonName?: string | null;
  note?: string | null;
  isActive?: boolean;
}): Promise<AdminCorporateAccount> {
  const { data } = await fetchApi<{ data: AdminCorporateAccount }>(`/admin/corporate-accounts`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data;
}

export async function updateCorporateAccount(
  id: string,
  input: Partial<Parameters<typeof createCorporateAccount>[0]>,
): Promise<AdminCorporateAccount> {
  const { data } = await fetchApi<{ data: AdminCorporateAccount }>(
    `/admin/corporate-accounts/${id}`,
    { method: 'PATCH', body: JSON.stringify(input) },
  );
  return data;
}

export async function deleteCorporateAccount(id: string): Promise<void> {
  await fetchApi(`/admin/corporate-accounts/${id}`, { method: 'DELETE' });
}

export async function listCorporateMembers(id: string): Promise<AdminCorporateMember[]> {
  const { data } = await fetchApi<{ data: AdminCorporateMember[] }>(
    `/admin/corporate-accounts/${id}/members`,
  );
  return data;
}

export async function addCorporateMember(
  id: string,
  input: { customerId: string; role?: 'member' | 'admin' },
): Promise<AdminCorporateMember> {
  const { data } = await fetchApi<{ data: AdminCorporateMember }>(
    `/admin/corporate-accounts/${id}/members`,
    { method: 'POST', body: JSON.stringify(input) },
  );
  return data;
}

export async function updateCorporateMember(
  memberId: string,
  input: { role: 'member' | 'admin' },
): Promise<AdminCorporateMember> {
  const { data } = await fetchApi<{ data: AdminCorporateMember }>(
    `/admin/corporate-accounts/members/${memberId}`,
    { method: 'PATCH', body: JSON.stringify(input) },
  );
  return data;
}

export async function removeCorporateMember(memberId: string): Promise<void> {
  await fetchApi(`/admin/corporate-accounts/members/${memberId}`, { method: 'DELETE' });
}

export async function getCorporateSummary(id: string): Promise<AdminCorporateSummary> {
  const { data } = await fetchApi<{ data: AdminCorporateSummary }>(
    `/admin/corporate-accounts/${id}/summary`,
  );
  return data;
}

export async function getCorporateUsageReport(
  id: string,
  params?: { from?: string; to?: string },
): Promise<AdminCorporateUsageReport> {
  const query = new URLSearchParams();
  if (params?.from) query.set('from', params.from);
  if (params?.to) query.set('to', params.to);
  const qs = query.toString();
  const { data } = await fetchApi<{ data: AdminCorporateUsageReport }>(
    `/admin/corporate-accounts/${id}/usage-report${qs ? `?${qs}` : ''}`,
  );
  return data;
}

// ─── Google Calendar integration (sprint 3.3 fáze C) ──────────────────

export interface AdminGoogleConnection {
  id: string;
  employeeId: string;
  googleEmail: string | null;
  calendarId: string;
  isActive: boolean;
  inboundSyncEnabled: boolean;
  lastSyncedAt: string | null;
  lastInboundSyncAt: string | null;
  lastSyncError: string | null;
  consecutiveErrors: string;
  revokedAt: string | null;
  createdAt: string;
}

export interface InboundSyncResult {
  created: number;
  updated: number;
  deleted: number;
  skipped: number;
}

export async function setGoogleInboundEnabled(employeeId: string, enabled: boolean): Promise<void> {
  await fetchApi(`/admin/integrations/google/connections/${employeeId}/inbound`, {
    method: 'PATCH',
    body: JSON.stringify({ enabled }),
  });
}

export async function syncGoogleInbound(employeeId: string): Promise<InboundSyncResult> {
  const { data } = await fetchApi<{ data: InboundSyncResult }>(
    `/admin/integrations/google/connections/${employeeId}/sync-inbound`,
    { method: 'POST' },
  );
  return data;
}

export async function listGoogleConnections(): Promise<AdminGoogleConnection[]> {
  const { data } = await fetchApi<{ data: AdminGoogleConnection[] }>(
    `/admin/integrations/google/connections`,
  );
  return data;
}

export async function startGoogleConnect(employeeId: string): Promise<{ authUrl: string }> {
  const { data } = await fetchApi<{ data: { authUrl: string } }>(
    `/admin/integrations/google/connections/${employeeId}/start`,
    { method: 'POST' },
  );
  return data;
}

export async function revokeGoogleConnection(employeeId: string): Promise<void> {
  await fetchApi(`/admin/integrations/google/connections/${employeeId}`, {
    method: 'DELETE',
  });
}

// ─── Feature flags (sprint 3.3 fáze D) ────────────────────────────────

export interface AdminFeatureFlag {
  id: string;
  key: string;
  description: string | null;
  isEnabled: boolean;
  config: Record<string, unknown>;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function listFeatureFlags(): Promise<AdminFeatureFlag[]> {
  const { data } = await fetchApi<{ data: AdminFeatureFlag[] }>(`/admin/feature-flags`);
  return data;
}

export async function upsertFeatureFlag(input: {
  key: string;
  description?: string | null;
  isEnabled: boolean;
  config?: Record<string, unknown>;
}): Promise<AdminFeatureFlag> {
  const { data } = await fetchApi<{ data: AdminFeatureFlag }>(`/admin/feature-flags`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data;
}

export async function toggleFeatureFlag(
  key: string,
  isEnabled: boolean,
): Promise<AdminFeatureFlag> {
  const { data } = await fetchApi<{ data: AdminFeatureFlag }>(
    `/admin/feature-flags/${encodeURIComponent(key)}`,
    { method: 'PATCH', body: JSON.stringify({ isEnabled }) },
  );
  return data;
}

export async function deleteFeatureFlag(key: string): Promise<void> {
  await fetchApi(`/admin/feature-flags/${encodeURIComponent(key)}`, { method: 'DELETE' });
}

// ─── Outgoing webhooks (sprint 3.3 fáze C5) ──────────────────────────

export const WEBHOOK_EVENT_TYPES = [
  'booking.created',
  'booking.confirmed',
  'booking.cancelled',
  'booking.completed',
  'booking.no_show',
  'customer.created',
] as const;
export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export interface AdminWebhook {
  id: string;
  name: string;
  url: string;
  eventTypes: WebhookEventType[];
  isActive: boolean;
  consecutiveErrors: number;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  createdAt: string;
}

export interface AdminWebhookCreated extends Omit<
  AdminWebhook,
  'consecutiveErrors' | 'lastSuccessAt' | 'lastErrorAt' | 'lastError'
> {
  /** Secret se vraci JEDINKRAT pri create — admin ho musi zkopirovat. */
  secret: string;
}

export interface AdminWebhookDelivery {
  id: string;
  webhookId: string;
  eventType: string;
  status: 'pending' | 'sent' | 'failed';
  attempts: number;
  responseStatus: number | null;
  responseBody: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function listWebhooks(): Promise<AdminWebhook[]> {
  const { data } = await fetchApi<{ data: AdminWebhook[] }>(`/admin/webhooks`);
  return data;
}

export async function createWebhook(input: {
  name: string;
  url: string;
  eventTypes: WebhookEventType[];
}): Promise<AdminWebhookCreated> {
  const { data } = await fetchApi<{ data: AdminWebhookCreated }>(`/admin/webhooks`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data;
}

export async function updateWebhook(
  id: string,
  input: {
    name?: string;
    url?: string;
    eventTypes?: WebhookEventType[];
    isActive?: boolean;
  },
): Promise<AdminWebhook> {
  const { data } = await fetchApi<{ data: AdminWebhook }>(`/admin/webhooks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return data;
}

export async function deleteWebhook(id: string): Promise<void> {
  await fetchApi(`/admin/webhooks/${id}`, { method: 'DELETE' });
}

export async function testWebhook(id: string): Promise<{
  ok: boolean;
  responseStatus: number | null;
  responseBody: string | null;
  error: string | null;
}> {
  const { data } = await fetchApi<{
    data: {
      ok: boolean;
      responseStatus: number | null;
      responseBody: string | null;
      error: string | null;
    };
  }>(`/admin/webhooks/${id}/test`, { method: 'POST' });
  return data;
}

export async function listWebhookDeliveries(id: string): Promise<AdminWebhookDelivery[]> {
  const { data } = await fetchApi<{ data: AdminWebhookDelivery[] }>(
    `/admin/webhooks/${id}/deliveries`,
  );
  return data;
}

// ─── API keys (external integrace) ────────────────────────────────────

export const API_KEY_SCOPES = [
  'bookings:read',
  'bookings:write',
  'customers:read',
  'customers:write',
  'services:read',
  'employees:read',
  'availability:read',
  'branches:read',
  'webhooks:read',
] as const;
export type AdminApiKeyScope = (typeof API_KEY_SCOPES)[number] | '*';

export interface AdminApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: AdminApiKeyScope[];
  lastUsedAt: string | null;
  usageCount: number;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface AdminApiKeyCreated extends AdminApiKey {
  /** PLNÝ KLÍČ — vrátí se pouze pri create, nikdy víc. */
  rawKey: string;
}

export async function listApiKeys(): Promise<AdminApiKey[]> {
  const { data } = await fetchApi<{ data: AdminApiKey[] }>(`/admin/api-keys`);
  return data;
}

export async function createApiKey(input: {
  name: string;
  scopes?: AdminApiKeyScope[];
  expiresAt?: string | null;
}): Promise<AdminApiKeyCreated> {
  const { data } = await fetchApi<{ data: AdminApiKeyCreated }>(`/admin/api-keys`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data;
}

export async function revokeApiKey(id: string): Promise<void> {
  await fetchApi(`/admin/api-keys/${id}`, { method: 'DELETE' });
}

// ─── Notification settings ────────────────────────────────────────────

export interface NotificationSettings {
  reminderHoursBefore: number;
  primaryChannel: 'email' | 'sms';
  smsEnabled: boolean;
}

export async function getNotificationSettings(): Promise<NotificationSettings> {
  const { data } = await fetchApi<{ data: NotificationSettings }>(`/admin/settings/notifications`);
  return data;
}

export async function updateNotificationSettings(
  input: Partial<NotificationSettings>,
): Promise<NotificationSettings> {
  const { data } = await fetchApi<{ data: NotificationSettings }>(`/admin/settings/notifications`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return data;
}

// ─── Platform billing (Pavla platí Reserved) ──────────────────────────

export interface PlatformPlan {
  id: string;
  key: string;
  name: string;
  description: string | null;
  monthlyPriceHellers: number;
  yearlyPriceHellers: number;
  currency: string;
  stripeMonthlyPriceId: string | null;
  stripeYearlyPriceId: string | null;
  trialDays: number;
  limits: Record<string, unknown>;
  features: Record<string, boolean>;
  sortOrder: number;
}

export interface BillingStatus {
  tenantId: string;
  plan: string;
  planName: string | null;
  status: string;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  hasPaymentMethod: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
}

export async function listBillingPlans(): Promise<PlatformPlan[]> {
  const { data } = await fetchApi<{ data: PlatformPlan[] }>(`/admin/billing/plans`);
  return data;
}

export async function getBillingStatus(): Promise<BillingStatus> {
  const { data } = await fetchApi<{ data: BillingStatus }>(`/admin/billing/status`);
  return data;
}

export async function createBillingCheckout(input: {
  planKey: string;
  interval: 'monthly' | 'yearly';
}): Promise<{ checkoutUrl: string; sessionId: string }> {
  const { data } = await fetchApi<{ data: { checkoutUrl: string; sessionId: string } }>(
    `/admin/billing/checkout`,
    { method: 'POST', body: JSON.stringify(input) },
  );
  return data;
}

export async function createBillingPortal(returnUrl?: string): Promise<{ portalUrl: string }> {
  const { data } = await fetchApi<{ data: { portalUrl: string } }>(`/admin/billing/portal`, {
    method: 'POST',
    body: JSON.stringify({ returnUrl }),
  });
  return data;
}

export async function cancelBillingSubscription(
  atPeriodEnd = true,
): Promise<{ canceled: true; effectiveAt: 'period_end' | 'immediate' }> {
  const { data } = await fetchApi<{
    data: { canceled: true; effectiveAt: 'period_end' | 'immediate' };
  }>(`/admin/billing/cancel`, { method: 'POST', body: JSON.stringify({ atPeriodEnd }) });
  return data;
}

export async function resumeBillingSubscription(): Promise<{ resumed: true }> {
  const { data } = await fetchApi<{ data: { resumed: true } }>(`/admin/billing/resume`, {
    method: 'POST',
  });
  return data;
}

// ─── Registrace nového tenanta ────────────────────────────────────────

export interface RegisterInput {
  tenantSlug: string;
  tenantName: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  currency?: 'CZK' | 'EUR' | 'USD';
  locale?: string;
}

export interface RegisterResult {
  tenantId: string;
  userId: string;
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  };
}

export async function registerTenant(input: RegisterInput): Promise<RegisterResult> {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new AdminApiError(
      res.status,
      body?.error?.code ?? 'REGISTER_FAILED',
      body?.error?.message ?? 'Registrace selhala.',
    );
  }
  return res.json();
}

// ─── Onboarding ───────────────────────────────────────────────────────

export type OnboardingStep =
  | 'emailVerified'
  | 'firstServiceCreated'
  | 'workingHoursSet'
  | 'teamInvited'
  | 'paymentsConnected'
  | 'firstBookingReceived';

export interface OnboardingChecklist {
  emailVerified: boolean;
  firstServiceCreated: boolean;
  workingHoursSet: boolean;
  teamInvited: boolean;
  paymentsConnected: boolean;
  firstBookingReceived: boolean;
  completedAt: string | null;
  startedAt: string | null;
  completedCount: number;
  totalCount: number;
  progressPercent: number;
}

export async function getOnboardingChecklist(): Promise<OnboardingChecklist> {
  const { data } = await fetchApi<{ data: OnboardingChecklist }>(`/admin/onboarding/checklist`);
  return data;
}

export async function markOnboardingStep(step: OnboardingStep): Promise<OnboardingChecklist> {
  const { data } = await fetchApi<{ data: OnboardingChecklist }>(`/admin/onboarding/checklist`, {
    method: 'PATCH',
    body: JSON.stringify({ step }),
  });
  return data;
}

// ─── Custom doména (Sprint 8.0-1) ──────────────────────────────────────

export interface CustomDomainStatus {
  customDomain: string | null;
  verifiedAt: string | null;
  verificationToken: string | null;
  verificationRecord: string | null;
  dnsTarget: string;
}

export async function getCustomDomain(): Promise<CustomDomainStatus> {
  const { data } = await fetchApi<{ data: CustomDomainStatus }>(`/admin/custom-domain`);
  return data;
}

export async function setCustomDomain(domain: string): Promise<CustomDomainStatus> {
  const { data } = await fetchApi<{ data: CustomDomainStatus }>(`/admin/custom-domain`, {
    method: 'PUT',
    body: JSON.stringify({ domain }),
  });
  return data;
}

export async function verifyCustomDomain(): Promise<CustomDomainStatus> {
  const { data } = await fetchApi<{ data: CustomDomainStatus }>(`/admin/custom-domain/verify`, {
    method: 'POST',
  });
  return data;
}

export async function removeCustomDomain(): Promise<void> {
  await fetchApi<void>(`/admin/custom-domain`, { method: 'DELETE' });
}

// ─── No-show risk score (Sprint 8.0-2) ─────────────────────────────────

export type RiskLevel = 'low' | 'medium' | 'high';

export interface NoShowRisk {
  score: number;
  level: RiskLevel;
  reasons: string[];
  stats: {
    totalBookings: number;
    completedBookings: number;
    noShowCount: number;
    cancelledByCustomerCount: number;
  };
}

export async function getNoShowRisk(customerId: string): Promise<NoShowRisk> {
  const { data } = await fetchApi<{ data: NoShowRisk }>(
    `/admin/customers/${customerId}/no-show-risk`,
  );
  return data;
}

// ─── Katalog public profile (Sprint 8.0-4) ─────────────────────────────

export interface CatalogProfile {
  listedInCatalog: boolean;
  publicDescription: string | null;
  publicCity: string | null;
  publicAddress: string | null;
  publicPhotos: string[];
  publicBusinessHours: Record<string, string>;
}

export async function getCatalogProfile(): Promise<CatalogProfile> {
  const { data } = await fetchApi<{ data: CatalogProfile }>(`/admin/catalog-profile`);
  return data;
}

export async function updateCatalogProfile(
  patch: Partial<CatalogProfile>,
): Promise<CatalogProfile> {
  const { data } = await fetchApi<{ data: CatalogProfile }>(`/admin/catalog-profile`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return data;
}

// ─── Tenant theme (Sprint 8.1) ─────────────────────────────────────────

export interface TenantTheme {
  primaryColor?: string;
  borderRadius?: 'none' | 'sm' | 'md' | 'lg' | 'xl';
  logoUrl?: string;
  fontFamily?: 'system' | 'serif' | 'sans';
  backgroundColor?: string;
  customCss?: string;
}

export async function getTheme(): Promise<TenantTheme> {
  const { data } = await fetchApi<{ data: TenantTheme }>(`/admin/theme`);
  return data;
}

export async function updateTheme(
  patch: TenantTheme & {
    primaryColor?: string | null;
    borderRadius?: TenantTheme['borderRadius'] | null;
    logoUrl?: string | null;
    fontFamily?: TenantTheme['fontFamily'] | null;
    backgroundColor?: string | null;
    customCss?: string | null;
  },
): Promise<TenantTheme> {
  const { data } = await fetchApi<{ data: TenantTheme }>(`/admin/theme`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return data;
}

// ─── Photo upload (Sprint 8.2-C) ───────────────────────────────────────

export interface UploadSignResult {
  uploadUrl: string;
  publicUrl: string;
  storage: 's3' | 'local';
  method?: 'PUT' | 'POST';
}

export async function signUpload(
  kind: 'logo' | 'catalog-photo' | 'service-image',
  contentType: string,
  fileSize?: number,
): Promise<UploadSignResult> {
  const { data } = await fetchApi<{ data: UploadSignResult }>(`/admin/uploads/sign`, {
    method: 'POST',
    body: JSON.stringify({ kind, contentType, fileSize }),
  });
  return data;
}

export async function uploadFile(
  file: File,
  kind: 'logo' | 'catalog-photo' | 'service-image',
): Promise<string> {
  const sign = await signUpload(kind, file.type, file.size);
  const res = await fetch(sign.uploadUrl, {
    method: sign.method ?? 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  if (!res.ok) {
    throw new Error(`Upload selhal (HTTP ${res.status}).`);
  }
  return sign.publicUrl;
}

// ─── Tenant site (Sprint 9.0) ──────────────────────────────────────────

export type SiteTemplate = 'elegant' | 'bold' | 'fresh';

export interface SiteContent {
  hero?: {
    headline?: string;
    subheadline?: string;
    coverPhotoUrl?: string;
    ctaText?: string;
  };
  about?: {
    headline?: string;
    text?: string;
    photoUrl?: string;
  };
  team?: {
    headline?: string;
    members?: Array<{ name: string; role?: string; photoUrl?: string; bio?: string }>;
  };
  gallery?: {
    headline?: string;
    photos?: string[];
  };
  testimonials?: {
    headline?: string;
    items?: Array<{ author: string; text: string }>;
  };
  faq?: {
    headline?: string;
    items?: Array<{ q: string; a: string }>;
  };
  contact?: {
    headline?: string;
    showAddress?: boolean;
    showHours?: boolean;
    showPhone?: boolean;
    phone?: string;
    email?: string;
    mapEmbedUrl?: string;
  };
  enabledSections?: string[];
}

export interface SiteSettings {
  template: SiteTemplate | null;
  enabled: boolean;
  content: SiteContent;
}

export async function getSiteSettings(): Promise<SiteSettings> {
  const { data } = await fetchApi<{ data: SiteSettings }>(`/admin/site`);
  return data;
}

export async function updateSiteSettings(
  patch: Partial<SiteSettings> & { template?: SiteTemplate | null },
): Promise<SiteSettings> {
  const { data } = await fetchApi<{ data: SiteSettings }>(`/admin/site`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return data;
}

// ─── Kiosk self-check-in (access control) ────────────────────────────
export type AccessValidateResult =
  | {
      granted: true;
      grantId: string;
      kind: string;
      customerName: string | null;
      usesRemaining: number | null;
    }
  | { granted: false; reason: string };

export async function validateAccessCode(code: string): Promise<AccessValidateResult> {
  const { data } = await fetchApi<{ data: AccessValidateResult }>(`/admin/access/validate`, {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
  return data;
}

// ─── Restaurace: rezervace stolů (sprint 10.23) ──────────────────────

export interface TableOverviewItem {
  id: string;
  name: string;
  branchId: string | null;
  seats: number;
  x: number | null;
  y: number | null;
  shape: string | null;
  status: 'free' | 'occupied';
  reservationId: string | null;
  freeAt: string | null;
}

export interface AdminTable {
  id: string;
  name: string;
  branchId: string;
  type: string;
  isActive: boolean;
  metadata: { seats?: number; x?: number; y?: number; shape?: string };
}

/** Stoly = resources typu 'table'. */
export async function listTables(): Promise<AdminTable[]> {
  const { data } = await fetchApi<{ data: AdminTable[] }>(`/admin/resources`);
  return data.filter((r) => r.type === 'table');
}

export async function createTable(input: {
  branchId: string;
  name: string;
  seats: number;
  x?: number;
  y?: number;
  shape?: 'round' | 'square' | 'rect';
}): Promise<AdminTable> {
  const { data } = await fetchApi<{ data: AdminTable }>(`/admin/resources`, {
    method: 'POST',
    body: JSON.stringify({
      branchId: input.branchId,
      name: input.name,
      type: 'table',
      metadata: { seats: input.seats, x: input.x, y: input.y, shape: input.shape },
    }),
  });
  return data;
}

export async function updateTable(
  id: string,
  patch: { name?: string; isActive?: boolean; metadata?: AdminTable['metadata'] },
): Promise<AdminTable> {
  const { data } = await fetchApi<{ data: AdminTable }>(`/admin/resources/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return data;
}

/** Uloží pozici stolu na půdorysu (merge do metadata). */
export async function updateTablePosition(id: string, x: number, y: number): Promise<AdminTable> {
  return updateTable(id, { metadata: { x, y } });
}

export async function deleteTable(id: string): Promise<void> {
  await fetchApi(`/admin/resources/${id}`, { method: 'DELETE' });
}

export interface TableReservation {
  id: string;
  branchId: string | null;
  resourceId: string | null;
  servicePeriodId: string | null;
  customerName: string;
  customerPhone: string | null;
  startsAt: string;
  endsAt: string;
  partySize: number;
  seatingPref: string | null;
  occasion: string | null;
  depositHellers: number;
  currency: string;
  status: string;
  note: string | null;
}

/** Půdorysný přehled stolů k danému okamžiku (default teď). */
export async function getTableOverview(opts?: {
  at?: string;
  branchId?: string;
}): Promise<TableOverviewItem[]> {
  const params = new URLSearchParams();
  if (opts?.at) params.append('at', opts.at);
  if (opts?.branchId) params.append('branchId', opts.branchId);
  const { data } = await fetchApi<{ data: TableOverviewItem[] }>(
    `/admin/table-reservations/overview?${params.toString()}`,
  );
  return data;
}

export async function listTableReservations(status?: string): Promise<TableReservation[]> {
  const params = new URLSearchParams();
  if (status) params.append('status', status);
  const { data } = await fetchApi<{ data: TableReservation[] }>(
    `/admin/table-reservations?${params.toString()}`,
  );
  return data;
}

export async function createTableReservation(input: {
  resourceId?: string;
  branchId?: string;
  servicePeriodId?: string;
  customerName: string;
  customerPhone?: string;
  startsAt: string;
  partySize: number;
  turnMinutes?: number;
  seatingPref?: string;
  occasion?: string;
  note?: string;
}): Promise<TableReservation & { tables: string[] }> {
  const { data } = await fetchApi<{ data: TableReservation & { tables: string[] } }>(
    `/admin/table-reservations`,
    { method: 'POST', body: JSON.stringify(input) },
  );
  return data;
}

export async function walkInTableReservation(input: {
  partySize: number;
  resourceId?: string;
  branchId?: string;
  servicePeriodId?: string;
  customerName?: string;
  seatingPref?: string;
}): Promise<TableReservation & { tables: string[] }> {
  const { data } = await fetchApi<{ data: TableReservation & { tables: string[] } }>(
    `/admin/table-reservations/walk-in`,
    { method: 'POST', body: JSON.stringify(input) },
  );
  return data;
}

/** Změna stavu rezervace: seat | complete | no-show | cancel. */
export async function setTableReservationStatus(
  id: string,
  action: 'seat' | 'complete' | 'no-show' | 'cancel',
): Promise<TableReservation> {
  const { data } = await fetchApi<{ data: TableReservation }>(
    `/admin/table-reservations/${id}/${action}`,
    { method: 'POST' },
  );
  return data;
}

// ─── Skupinové lekce (UI 1) ───────────────────────────────────────────

export type ClassSessionListStatus = 'open' | 'full' | 'cancelled' | 'completed' | 'all';

export interface AdminClassSession {
  id: string;
  branchId: string;
  serviceId: string;
  employeeId: string | null;
  resourceId: string | null;
  startsAt: string;
  endsAt: string;
  capacity: number;
  bookedCount: number;
  status: string;
  recurrenceId: string | null;
  courseId: string | null;
  spotCount: number;
  minAge: number | null;
  maxAge: number | null;
  prerequisiteServiceId: string | null;
  cancelledAt: string | null;
  createdAt: string;
}

/**
 * Účastník, který má v novém čase lekce jinou nezrušenou rezervaci.
 * Posun lekce to neblokuje — provozovatel to má jen vidět.
 */
export interface ParticipantConflict {
  bookingId: string;
  customerName: string;
  conflictingBookingId: string;
  conflictStartsAt: string;
}

export interface AdminClassParticipant {
  bookingId: string;
  customerName: string;
  customerEmail: string;
  status: string;
}

export interface AdminClassAttendance {
  total: number;
  present: number;
  noShow: number;
  pending: number;
}

export interface AdminWaitlistEntry {
  id: string;
  sessionId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  position: number;
  status: string;
  createdAt: string;
}

export interface AdminClassSpots {
  spotCount: number;
  taken: string[];
  free: string[];
}

export interface AdminClassRecurrence {
  id: string;
  serviceId: string;
  employeeId: string | null;
  resourceId: string | null;
  branchId: string | null;
  capacity: number | null;
  daysOfWeek: number[];
  time: string;
  startDate: string;
  endDate: string;
  status: string;
  createdAt: string;
  sessionCount: number;
  openCount: number;
  cancelledCount: number;
  firstSessionAt: string | null;
  lastSessionAt: string | null;
}

export interface ClassSessionInput {
  serviceId: string;
  employeeId?: string | null;
  resourceId?: string | null;
  branchId?: string;
  startsAt: string;
  capacity?: number;
  spotCount?: number;
  minAge?: number | null;
  maxAge?: number | null;
  prerequisiteServiceId?: string | null;
}

/** Editace lekce — posílá se jen to, co se mění (PATCH). */
export type ClassSessionPatch = Partial<{
  startsAt: string;
  employeeId: string | null;
  resourceId: string | null;
  capacity: number;
  minAge: number | null;
  maxAge: number | null;
  prerequisiteServiceId: string | null;
}>;

export interface ClassJoinInput {
  customerName: string;
  customerEmail: string;
  customerPhone?: string | null;
  customerNote?: string | null;
  spotLabel?: string | null;
  useMakeupCredit?: boolean;
}

export async function listClassSessions(opts?: {
  serviceId?: string;
  from?: string;
  to?: string;
  status?: ClassSessionListStatus;
  recurrenceId?: string;
}): Promise<AdminClassSession[]> {
  const params = new URLSearchParams();
  if (opts?.serviceId) params.append('serviceId', opts.serviceId);
  if (opts?.from) params.append('from', opts.from);
  if (opts?.to) params.append('to', opts.to);
  if (opts?.status) params.append('status', opts.status);
  if (opts?.recurrenceId) params.append('recurrenceId', opts.recurrenceId);
  const qs = params.toString();
  const { data } = await fetchApi<{ data: AdminClassSession[] }>(
    `/admin/class-sessions${qs ? `?${qs}` : ''}`,
  );
  return data;
}

export async function getClassSession(id: string): Promise<AdminClassSession> {
  const { data } = await fetchApi<{ data: AdminClassSession }>(`/admin/class-sessions/${id}`);
  return data;
}

export async function createClassSession(input: ClassSessionInput): Promise<AdminClassSession> {
  const { data } = await fetchApi<{ data: AdminClassSession }>(`/admin/class-sessions`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data;
}

export async function updateClassSession(
  id: string,
  patch: ClassSessionPatch,
): Promise<AdminClassSession & { participantConflicts: ParticipantConflict[] }> {
  const { data } = await fetchApi<{
    data: AdminClassSession & { participantConflicts?: ParticipantConflict[] };
  }>(`/admin/class-sessions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return { ...data, participantConflicts: data.participantConflicts ?? [] };
}

export async function cancelClassSession(id: string): Promise<AdminClassSession> {
  const { data } = await fetchApi<{ data: AdminClassSession }>(
    `/admin/class-sessions/${id}/cancel`,
    { method: 'POST' },
  );
  return data;
}

export async function listClassParticipants(id: string): Promise<AdminClassParticipant[]> {
  const { data } = await fetchApi<{ data: AdminClassParticipant[] }>(
    `/admin/class-sessions/${id}/participants`,
  );
  return data;
}

export async function getClassAttendance(id: string): Promise<AdminClassAttendance> {
  const { data } = await fetchApi<{ data: AdminClassAttendance }>(
    `/admin/class-sessions/${id}/attendance`,
  );
  return data;
}

export async function markClassAttendance(
  sessionId: string,
  bookingId: string,
  attended: boolean,
): Promise<void> {
  await fetchApi(`/admin/class-sessions/${sessionId}/participants/${bookingId}/attendance`, {
    method: 'POST',
    body: JSON.stringify({ attended }),
  });
}

export async function joinClassSession(
  sessionId: string,
  input: ClassJoinInput,
): Promise<{ id: string; referenceCode: string }> {
  const { data } = await fetchApi<{ data: { id: string; referenceCode: string } }>(
    `/admin/class-sessions/${sessionId}/join`,
    { method: 'POST', body: JSON.stringify(input) },
  );
  return data;
}

export async function leaveClassSession(sessionId: string, bookingId: string): Promise<void> {
  await fetchApi(`/admin/class-sessions/${sessionId}/participants/${bookingId}/leave`, {
    method: 'POST',
  });
}

export async function getClassSpots(id: string): Promise<AdminClassSpots> {
  const { data } = await fetchApi<{ data: AdminClassSpots }>(`/admin/class-sessions/${id}/spots`);
  return data;
}

export async function listClassWaitlist(id: string): Promise<AdminWaitlistEntry[]> {
  const { data } = await fetchApi<{ data: AdminWaitlistEntry[] }>(
    `/admin/class-sessions/${id}/waitlist`,
  );
  return data;
}

export async function addToClassWaitlist(
  id: string,
  input: ClassJoinInput,
): Promise<AdminWaitlistEntry> {
  const { data } = await fetchApi<{ data: AdminWaitlistEntry }>(
    `/admin/class-sessions/${id}/waitlist`,
    { method: 'POST', body: JSON.stringify(input) },
  );
  return data;
}

export async function removeFromClassWaitlist(
  sessionId: string,
  waitlistId: string,
): Promise<void> {
  await fetchApi(`/admin/class-sessions/${sessionId}/waitlist/${waitlistId}/leave`, {
    method: 'POST',
  });
}

export async function listClassRecurrences(
  status?: 'active' | 'cancelled' | 'all',
): Promise<AdminClassRecurrence[]> {
  const qs = status ? `?status=${status}` : '';
  const { data } = await fetchApi<{ data: AdminClassRecurrence[] }>(
    `/admin/class-sessions/recurrences${qs}`,
  );
  return data;
}

export async function createClassRecurrence(input: {
  serviceId: string;
  employeeId?: string | null;
  resourceId?: string | null;
  branchId?: string | null;
  capacity?: number;
  daysOfWeek: number[];
  time: string;
  startDate: string;
  endDate: string;
}): Promise<{
  recurrenceId: string;
  requested: number;
  created: number;
  skipped: Array<{ startsAt: string; reason: string }>;
}> {
  const { data } = await fetchApi<{
    data: {
      recurrenceId: string;
      requested: number;
      created: number;
      skipped: Array<{ startsAt: string; reason: string }>;
    };
  }>(`/admin/class-sessions/recurrences`, { method: 'POST', body: JSON.stringify(input) });
  return data;
}

export async function cancelClassRecurrence(id: string): Promise<{ cancelledSessions: number }> {
  const { data } = await fetchApi<{ data: { cancelledSessions: number } }>(
    `/admin/class-sessions/recurrences/${id}/cancel`,
    { method: 'POST' },
  );
  return data;
}

// ─── Zdroje / přístroje (EMS) ─────────────────────────────────────────

export interface AdminResource {
  id: string;
  name: string;
  branchId: string;
  type: string;
  isActive: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export async function listResources(): Promise<AdminResource[]> {
  const { data } = await fetchApi<{ data: AdminResource[] }>(`/admin/resources`);
  return data;
}

export async function createResource(input: {
  branchId: string;
  name: string;
  type: string;
}): Promise<AdminResource> {
  const { data } = await fetchApi<{ data: AdminResource }>(`/admin/resources`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data;
}

export async function updateResource(
  id: string,
  patch: { branchId?: string; name?: string; type?: string; isActive?: boolean },
): Promise<AdminResource> {
  const { data } = await fetchApi<{ data: AdminResource }>(`/admin/resources/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return data;
}

export async function deleteResource(id: string): Promise<void> {
  await fetchApi(`/admin/resources/${id}`, { method: 'DELETE' });
}

// ─── Náhrady (make-up credits) ────────────────────────────────────────

export interface AdminMakeupCredit {
  id: string;
  customerId: string | null;
  customerName: string;
  customerEmail: string;
  reason: string;
  originBookingId: string | null;
  status: string;
  validUntil: string | null;
  usedBookingId: string | null;
  usedAt: string | null;
  createdAt: string;
}

export async function listMakeupCredits(): Promise<AdminMakeupCredit[]> {
  const { data } = await fetchApi<{ data: AdminMakeupCredit[] }>(`/admin/makeup-credits`);
  return data;
}

export async function issueMakeupCredit(input: {
  customerEmail: string;
  customerName: string;
  reason?: 'studio_cancelled' | 'client_cancelled' | 'admin_granted';
  validDays?: number;
}): Promise<AdminMakeupCredit> {
  const { data } = await fetchApi<{ data: AdminMakeupCredit }>(`/admin/makeup-credits`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data;
}

// ─── Vydané permanentky napříč typy (UI 2) ────────────────────────────

export type PassType = 'credit' | 'bundle' | 'time';

export type PassEffectiveStatus =
  | 'active'
  | 'expired'
  | 'used_up'
  | 'suspended'
  | 'cancelled'
  | 'refunded'
  | 'rolled_over';

export interface AdminPass {
  id: string;
  type: PassType;
  customerId: string | null;
  customerFirstName: string | null;
  customerLastName: string | null;
  customerEmail: string | null;
  corporateAccountId: string | null;
  packId: string | null;
  packName: string | null;
  balanceRemaining: number | null;
  balanceTotal: number | null;
  balanceLabel: string;
  validFrom: string;
  validUntil: string | null;
  /** Stav uložený ve sloupci — může lhát (propadlá permanentka bývá 'active'). */
  storedStatus: string;
  /** Stav spočítaný z dat — tohle se ukazuje provozovateli. */
  effectiveStatus: PassEffectiveStatus;
  pricePaidHellers: number;
  purchasedAt: string;
  soldBy: string | null;
  soldByName: string | null;
  note: string | null;
}

export interface AdminPassDetail extends AdminPass {
  snapshot: Record<string, unknown> | null;
}

export interface AdminPassList {
  items: AdminPass[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export async function listPasses(opts?: {
  type?: PassType;
  status?: PassEffectiveStatus;
  customerId?: string;
  packId?: string;
  search?: string;
  expiringWithinDays?: number;
  limit?: number;
  offset?: number;
}): Promise<AdminPassList> {
  const params = new URLSearchParams();
  if (opts?.type) params.append('type', opts.type);
  if (opts?.status) params.append('status', opts.status);
  if (opts?.customerId) params.append('customerId', opts.customerId);
  if (opts?.packId) params.append('packId', opts.packId);
  if (opts?.search) params.append('search', opts.search);
  if (opts?.expiringWithinDays)
    params.append('expiringWithinDays', String(opts.expiringWithinDays));
  if (opts?.limit) params.append('limit', String(opts.limit));
  if (opts?.offset) params.append('offset', String(opts.offset));
  const qs = params.toString();
  const { data } = await fetchApi<{ data: AdminPassList }>(`/admin/passes${qs ? `?${qs}` : ''}`);
  return data;
}

export async function getPass(type: PassType, id: string): Promise<AdminPassDetail> {
  const { data } = await fetchApi<{ data: AdminPassDetail }>(`/admin/passes/${type}/${id}`);
  return data;
}

export async function suspendPass(type: PassType, id: string, note: string): Promise<void> {
  await fetchApi(`/admin/passes/${type}/${id}/suspend`, {
    method: 'POST',
    body: JSON.stringify({ note }),
  });
}

export async function resumePass(type: PassType, id: string, note: string): Promise<void> {
  await fetchApi(`/admin/passes/${type}/${id}/resume`, {
    method: 'POST',
    body: JSON.stringify({ note }),
  });
}

// ─── Dobití / prodloužení a historie pro všechny tři typy ─────────────

/** Kreditová permanentka: ±kredity a/nebo prodloužení platnosti. */
export async function adjustCreditPass(
  allocationId: string,
  patch: { creditsDelta?: number; extendDays?: number; note: string },
): Promise<void> {
  await fetchApi(`/admin/credit-packs/allocation/${allocationId}/adjust`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

/** Bundle: ±kusy konkrétní služby a/nebo prodloužení platnosti. */
export async function adjustBundlePass(
  allocationId: string,
  patch: { serviceId?: string; quantityDelta?: number; extendDays?: number; note: string },
): Promise<void> {
  await fetchApi(`/admin/bundle-packs/allocation/${allocationId}/adjust`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

/** Časový balíček: ±použití a/nebo prodloužení platnosti. */
export async function adjustTimePass(
  allocationId: string,
  patch: { bookingsUsedDelta?: number; extendDays?: number; note: string },
): Promise<void> {
  await fetchApi(`/admin/time-packs/allocation/${allocationId}/adjust`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export interface AdminBundleItemUse {
  id: string;
  bookingId: string | null;
  serviceId: string | null;
  quantityDeducted: number;
  action: 'consumed' | 'refunded' | 'admin_adjustment' | 'cancelled';
  note: string | null;
  createdAt: string;
}

export interface AdminTimePackUse {
  id: string;
  bookingId: string | null;
  serviceId: string | null;
  usageDate: string;
  action: 'consumed' | 'refunded' | 'admin_adjustment';
  note: string | null;
  createdAt: string;
}

export async function listBundleItemUses(allocationId: string): Promise<AdminBundleItemUse[]> {
  const { data } = await fetchApi<{ data: AdminBundleItemUse[] }>(
    `/admin/bundle-packs/allocation/${allocationId}/uses`,
  );
  return data;
}

export async function listTimePackUses(allocationId: string): Promise<AdminTimePackUse[]> {
  const { data } = await fetchApi<{ data: AdminTimePackUse[] }>(
    `/admin/time-packs/allocation/${allocationId}/uses`,
  );
  return data;
}

/** Sjednocený řádek historie čerpání — tři tabulky, jeden tvar pro UI. */
export interface PassUseRow {
  id: string;
  bookingId: string | null;
  action: string;
  /** Kolik se strhlo (kladné) nebo vrátilo (záporné). U časových vždy ±1. */
  amount: number;
  note: string | null;
  createdAt: string;
}

export async function listPassUses(type: PassType, allocationId: string): Promise<PassUseRow[]> {
  if (type === 'credit') {
    const rows = await listCreditUses(allocationId);
    return rows.map((r) => ({
      id: r.id,
      bookingId: r.bookingId,
      action: r.action,
      amount: r.creditsDeducted,
      note: r.note,
      createdAt: r.createdAt,
    }));
  }
  if (type === 'bundle') {
    const rows = await listBundleItemUses(allocationId);
    return rows.map((r) => ({
      id: r.id,
      bookingId: r.bookingId,
      action: r.action,
      amount: r.quantityDeducted,
      note: r.note,
      createdAt: r.createdAt,
    }));
  }
  const rows = await listTimePackUses(allocationId);
  return rows.map((r) => ({
    id: r.id,
    bookingId: r.bookingId,
    action: r.action,
    amount: r.action === 'refunded' ? -1 : r.action === 'consumed' ? 1 : 0,
    note: r.note,
    createdAt: r.createdAt,
  }));
}

// ─── Ověření e-mailu administrátora ──────────────────────────────────────

export interface EmailVerificationStatus {
  verified: boolean;
  email: string;
  /** ISO datum, kdy nejdřív půjde poslat znovu. null = hned. */
  canResendAt: string | null;
}

export async function getEmailVerificationStatus(): Promise<EmailVerificationStatus> {
  const { data } = await fetchApi<{ data: EmailVerificationStatus }>(`/auth/verify-email/status`);
  return data;
}

export async function resendVerificationEmail(): Promise<{ sent: boolean; email: string }> {
  const { data } = await fetchApi<{ data: { sent: boolean; email: string } }>(
    `/auth/verify-email/resend`,
    { method: 'POST' },
  );
  return data;
}

/**
 * Potvrzení adresy z odkazu v e-mailu. Volá se BEZ přihlášení — uživatel klikne
 * z pošty a token je jediná autorizace (proto `withAuth = false`).
 */
export async function confirmEmailVerification(
  token: string,
): Promise<{ email: string; alreadyVerified: boolean }> {
  const { data } = await fetchApi<{ data: { email: string; alreadyVerified: boolean } }>(
    `/auth/verify-email?token=${encodeURIComponent(token)}`,
    undefined,
    false,
  );
  return data;
}
