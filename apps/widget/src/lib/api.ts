// API klient pro Reserved public endpointy.
// Žádný auth — tenant identifikován slug-em v URL.

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export class ReservedApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, error: ApiError) {
    super(error.message);
    this.status = status;
    this.code = error.code;
    this.details = error.details;
  }
}

async function fetchApi<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = (body?.error as ApiError) ?? {
      code: 'UNKNOWN',
      message: `HTTP ${res.status}`,
    };
    throw new ReservedApiError(res.status, err);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

// ─── Tenant info ──────────────────────────────────────────────────────

export interface TenantTheme {
  primaryColor?: string;
  borderRadius?: 'none' | 'sm' | 'md' | 'lg' | 'xl';
  logoUrl?: string;
  fontFamily?: 'system' | 'serif' | 'sans';
}

export interface TenantInfo {
  slug: string;
  name: string;
  theme?: TenantTheme;
}

export async function getTenantInfo(slug: string): Promise<TenantInfo> {
  const { data } = await fetchApi<{ data: TenantInfo }>(`/public/${slug}`);
  return data;
}

// ─── Pobočky (sprint 2.4) ────────────────────────────────────────────

export interface PublicBranch {
  id: string;
  slug: string;
  name: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  timezone: string | null;
  isDefault: string | null;
}

export async function listBranches(slug: string): Promise<PublicBranch[]> {
  const { data } = await fetchApi<{ data: PublicBranch[] }>(`/public/${slug}/branches`);
  return data;
}

// ─── Služby ────────────────────────────────────────────────────────────

export interface PublicService {
  id: string;
  categoryId: string | null;
  name: string;
  description: string | null;
  durationMinutes: number;
  priceHellers: number;
  currency: string;
  color: string | null;
  imageUrl: string | null;
  capacity: number;
}

export async function listServices(slug: string): Promise<PublicService[]> {
  const { data } = await fetchApi<{ data: PublicService[] }>(`/public/${slug}/services`);
  return data;
}

// ─── Zaměstnanci ──────────────────────────────────────────────────────

export interface PublicEmployee {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string | null;
  title: string | null;
  bio: string | null;
  avatarUrl: string | null;
  color: string | null;
}

export async function listEmployees(slug: string, branchId?: string): Promise<PublicEmployee[]> {
  const qs = branchId ? `?branchId=${branchId}` : '';
  const { data } = await fetchApi<{ data: PublicEmployee[] }>(`/public/${slug}/employees${qs}`);
  return data;
}

// ─── Volné termíny ────────────────────────────────────────────────────

export interface AvailableSlot {
  startsAt: string;
  endsAt: string;
}

export interface AvailabilityForEmployee {
  employeeId: string;
  employeeName: string;
  slots: AvailableSlot[];
}

export async function getAvailability(
  slug: string,
  serviceId: string,
  date: string,
  employeeId?: string,
): Promise<AvailabilityForEmployee[]> {
  const params = new URLSearchParams({ serviceId, date });
  if (employeeId) params.append('employeeId', employeeId);
  const { data } = await fetchApi<{ data: AvailabilityForEmployee[] }>(
    `/public/${slug}/availability?${params.toString()}`,
  );
  return data;
}

// ─── Slot hold (10 min lock) ─────────────────────────────────────────

export interface HoldResult {
  holdId: string;
  sessionToken: string;
  startsAt: string;
  endsAt: string;
  expiresAt: string;
}

export async function createHold(
  slug: string,
  input: { serviceId: string; employeeId: string; startsAt: string },
): Promise<HoldResult> {
  const { data } = await fetchApi<{ data: HoldResult }>(`/public/${slug}/holds`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data;
}

// ─── Potvrzení rezervace ─────────────────────────────────────────────

export interface BookingConfirmation {
  id: string;
  referenceCode: string;
  startsAt: string;
  endsAt: string;
  status: string;
}

export async function confirmBooking(
  slug: string,
  input: {
    sessionToken: string;
    customerName: string;
    customerEmail: string;
    customerPhone?: string | null;
    customerNote?: string | null;
  },
): Promise<BookingConfirmation> {
  const { data } = await fetchApi<{ data: BookingConfirmation }>(`/public/${slug}/bookings`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data;
}
