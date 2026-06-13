// Sprint 10.1 — archetypy služeb.
// Reference: Ticketarium fitness-slots/src/lib/archetypes.ts.
//
// Archetyp = produktově pojmenovaný typ služby, který nastaví rozumné defaulty
// (hlavně kapacitu) místo toho, aby provozovatel ručně klikal čísla. Volba archetypu
// rozhoduje, jestli služba poteče 1:1 flow (employee + slot) nebo skupinovým flow
// (class_sessions, sprint 10.0).

export const serviceArchetypes = [
  'osobni_1_1',
  'skupinova_lekce',
  'volny_trener',
  'ems_pristrojovy',
  'hybridni_blok',
] as const;
export type ServiceArchetype = (typeof serviceArchetypes)[number];

export interface ArchetypeSpec {
  id: ServiceArchetype;
  label: string;
  description: string;
  /** Výchozí kapacita, kterou archetyp nastaví (lze ručně přepsat). */
  defaultCapacity: number;
  /** true = skupinová služba (capacity > 1, jde přes class_sessions flow). */
  group: boolean;
}

export const SERVICE_ARCHETYPES: Record<ServiceArchetype, ArchetypeSpec> = {
  osobni_1_1: {
    id: 'osobni_1_1',
    label: 'Osobní trénink 1:1',
    description: 'Exkluzivní termín jeden trenér / jeden klient.',
    defaultCapacity: 1,
    group: false,
  },
  skupinova_lekce: {
    id: 'skupinova_lekce',
    label: 'Skupinová lekce',
    description: 'Provoz vypíše termín s kapacitou; klienti se přihlašují.',
    defaultCapacity: 12,
    group: true,
  },
  volny_trener: {
    id: 'volny_trener',
    label: 'Přijď & trénuj (volný trenér)',
    description: 'Menší skupina u jednoho trenéra na place.',
    defaultCapacity: 3,
    group: true,
  },
  ems_pristrojovy: {
    id: 'ems_pristrojovy',
    label: 'EMS / přístrojový trénink',
    description: 'Jeden klient na přístroj, řízeno permanentkou.',
    defaultCapacity: 1,
    group: false,
  },
  hybridni_blok: {
    id: 'hybridni_blok',
    label: 'Hybridní blok',
    description: 'Sdílený blok s menší kapacitou.',
    defaultCapacity: 4,
    group: true,
  },
};

export function listServiceArchetypes(): ArchetypeSpec[] {
  return serviceArchetypes.map((id) => SERVICE_ARCHETYPES[id]);
}

/**
 * Výsledná kapacita služby: explicitní hodnota má přednost, jinak default archetypu,
 * jinak 1 (klasická individuální služba).
 */
export function resolveCapacity(
  archetype: ServiceArchetype | null | undefined,
  explicitCapacity: number | null | undefined,
): number {
  if (explicitCapacity != null) return explicitCapacity;
  if (archetype) return SERVICE_ARCHETYPES[archetype].defaultCapacity;
  return 1;
}
