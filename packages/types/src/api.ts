// Standardní response envelope dle reserved-docs/03_architektura_systemu.md.

export interface ApiMeta {
  page?: number;
  perPage?: number;
  total?: number;
  totalPages?: number;
  cursor?: string;
}

export interface ApiResponse<T> {
  data: T;
  meta?: ApiMeta;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
  ruleId?: string;
}

export interface ApiErrorResponse {
  error: ApiErrorBody;
}
