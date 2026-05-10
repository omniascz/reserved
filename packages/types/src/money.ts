// Branded type pro haléře — kompiler nedovolí míchat s běžnými number.
//
// Použití:
//   const price = halire(15000);    // Kč 150,-
//   const total: Halire = halire(price + tax);
//
// Konverze do Kč pouze v UI vrstvě:
//   const kc = (h: Halire) => h / 100;

declare const halireBrand: unique symbol;
export type Halire = number & { readonly [halireBrand]: true };

export function halire(value: number): Halire {
  if (!Number.isInteger(value)) {
    throw new Error(`Halire must be integer, got ${value}`);
  }
  return value as Halire;
}

export function isHalire(value: number): value is Halire {
  return Number.isInteger(value);
}

export const ZERO_HELLERS = halire(0);
