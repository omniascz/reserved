import { describe, expect, it } from 'vitest';
import {
  SERVICE_ARCHETYPES,
  listServiceArchetypes,
  resolveCapacity,
  serviceArchetypes,
} from '../archetypes.js';

describe('service archetypes', () => {
  it('katalog má 5 archetypů, každý s labelem a kapacitou', () => {
    const list = listServiceArchetypes();
    expect(list).toHaveLength(5);
    for (const a of list) {
      expect(a.label.length).toBeGreaterThan(0);
      expect(a.defaultCapacity).toBeGreaterThanOrEqual(1);
    }
  });

  it('skupinové archetypy mají kapacitu > 1, individuální = 1', () => {
    expect(SERVICE_ARCHETYPES.osobni_1_1.defaultCapacity).toBe(1);
    expect(SERVICE_ARCHETYPES.osobni_1_1.group).toBe(false);
    expect(SERVICE_ARCHETYPES.ems_pristrojovy.defaultCapacity).toBe(1);
    expect(SERVICE_ARCHETYPES.ems_pristrojovy.group).toBe(false);
    expect(SERVICE_ARCHETYPES.skupinova_lekce.defaultCapacity).toBeGreaterThan(1);
    expect(SERVICE_ARCHETYPES.skupinova_lekce.group).toBe(true);
  });

  it('group flag odpovídá kapacitě > 1 u všech archetypů', () => {
    for (const id of serviceArchetypes) {
      const a = SERVICE_ARCHETYPES[id];
      expect(a.group).toBe(a.defaultCapacity > 1);
    }
  });

  describe('resolveCapacity', () => {
    it('explicitní kapacita má přednost před archetypem', () => {
      expect(resolveCapacity('skupinova_lekce', 8)).toBe(8);
      expect(resolveCapacity('osobni_1_1', 5)).toBe(5);
    });

    it('bez explicitní kapacity použije default archetypu', () => {
      expect(resolveCapacity('skupinova_lekce', null)).toBe(
        SERVICE_ARCHETYPES.skupinova_lekce.defaultCapacity,
      );
      expect(resolveCapacity('volny_trener', undefined)).toBe(
        SERVICE_ARCHETYPES.volny_trener.defaultCapacity,
      );
    });

    it('bez archetypu a bez kapacity = 1 (klasická služba)', () => {
      expect(resolveCapacity(null, null)).toBe(1);
      expect(resolveCapacity(undefined, undefined)).toBe(1);
    });

    it('kapacita 1 je validní explicitní override i pro skupinový archetyp', () => {
      expect(resolveCapacity('skupinova_lekce', 1)).toBe(1);
    });
  });
});
