// Sprint 8.1: Aplikuje tenant theme přes CSS custom properties.
//
// Widget komponenty používají Tailwind utility tříd s var() referencí:
//   bg-[var(--rw-primary-600)] hover:bg-[var(--rw-primary-700)]
//
// CSS proměnné se nastaví dynamicky podle tenant.theme. Default je modrá #3b82f6.

import type { TenantTheme } from './api';

const DEFAULT_PRIMARY = '#3b82f6';

// Border radius hodnoty v px / rem podle Tailwind konvence.
const RADIUS_MAP: Record<string, string> = {
  none: '0',
  sm: '0.25rem',
  md: '0.5rem',
  lg: '0.75rem',
  xl: '1rem',
};

// Font family stack podle preference.
const FONT_MAP: Record<string, string> = {
  system: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  sans: '"Inter", system-ui, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
};

/** Posune hex barvu o N tone (kladne = svetlejsi, zaporne = tmavsi). */
function shadeColor(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, Math.min(255, (num >> 16) + amount));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + amount));
  const b = Math.max(0, Math.min(255, (num & 0xff) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** Vrátí CSS string pro <style> tag, který aplikuje theme. */
export function themeToCss(theme: TenantTheme | undefined): string {
  const primary = theme?.primaryColor ?? DEFAULT_PRIMARY;
  const radius = RADIUS_MAP[theme?.borderRadius ?? 'lg'] ?? RADIUS_MAP.lg;
  const font = FONT_MAP[theme?.fontFamily ?? 'system'] ?? FONT_MAP.system;

  // Derive světlé a tmavé tóny z primary
  const primary50 = shadeColor(primary, 80);
  const primary100 = shadeColor(primary, 60);
  const primary500 = primary;
  const primary600 = shadeColor(primary, -20);
  const primary700 = shadeColor(primary, -40);
  const primary800 = shadeColor(primary, -60);

  return `:root {
  --rw-primary-50: ${primary50};
  --rw-primary-100: ${primary100};
  --rw-primary-500: ${primary500};
  --rw-primary-600: ${primary600};
  --rw-primary-700: ${primary700};
  --rw-primary-800: ${primary800};
  --rw-radius: ${radius};
  --rw-font: ${font};
}
body { font-family: var(--rw-font); }
.bg-brand-50 { background-color: var(--rw-primary-50); }
.bg-brand-100 { background-color: var(--rw-primary-100); }
.bg-brand-500 { background-color: var(--rw-primary-500); }
.bg-brand-600 { background-color: var(--rw-primary-600); }
.hover\\:bg-brand-700:hover { background-color: var(--rw-primary-700); }
.text-brand-600 { color: var(--rw-primary-600); }
.text-brand-700 { color: var(--rw-primary-700); }
.hover\\:text-brand-700:hover { color: var(--rw-primary-700); }
.text-brand-800 { color: var(--rw-primary-800); }
.border-brand-100 { border-color: var(--rw-primary-100); }
.border-brand-200 { border-color: var(--rw-primary-100); }
.border-brand-500 { border-color: var(--rw-primary-500); }
.hover\\:border-brand-500:hover { border-color: var(--rw-primary-500); }
.focus\\:ring-brand-500:focus { --tw-ring-color: var(--rw-primary-500); }`;
}
