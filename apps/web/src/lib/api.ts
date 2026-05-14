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

export type PaymentMethodType = 'cash' | 'card_terminal' | 'qr_bank' | 'stripe' | 'gopay';
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
