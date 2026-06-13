// Sprint 10.11 — vertikálové presety (one-click setup oboru). DIFERENCIÁTOR:
// jeden produkt napříč obory. Provozovatel vybere obor a dostane sadu služeb
// (se správnými archetypy), přístroje/zdroje, formuláře a rozumná pravidla.
// Single-vertical konkurence tohle nemá.

import type { ServiceArchetype } from '../services/archetypes.js';
import type { IntakeField } from '../intake/dto/intake.dto.js';

export const verticalPresetIds = [
  'barber',
  'fitness_studio',
  'ems_studio',
  'tennis_courts',
  'medical_clinic',
] as const;
export type VerticalPresetId = (typeof verticalPresetIds)[number];

interface PresetService {
  name: string;
  durationMinutes: number;
  priceHellers: number;
  archetype: ServiceArchetype;
}
interface PresetResource {
  name: string;
  type: 'ems_machine' | 'room' | 'equipment' | 'other';
}
interface PresetIntakeForm {
  name: string;
  fields: IntakeField[];
}
export interface VerticalPreset {
  id: VerticalPresetId;
  label: string;
  description: string;
  services: PresetService[];
  resources?: PresetResource[];
  intakeForms?: PresetIntakeForm[];
  /** Volitelné přepsání booking pravidel (merge do tenant.settings). */
  bookingRules?: { stornoLimitHours?: number; presunLimitHours?: number; maxReschedules?: number };
}

export const VERTICAL_PRESETS: Record<VerticalPresetId, VerticalPreset> = {
  barber: {
    id: 'barber',
    label: 'Holičství / Barber',
    description: 'Individuální termíny — střihy a úprava vousů.',
    services: [
      { name: 'Pánský střih', durationMinutes: 30, priceHellers: 30000, archetype: 'osobni_1_1' },
      { name: 'Střih + vousy', durationMinutes: 45, priceHellers: 45000, archetype: 'osobni_1_1' },
    ],
    bookingRules: { stornoLimitHours: 12, presunLimitHours: 2 },
  },
  fitness_studio: {
    id: 'fitness_studio',
    label: 'Fitness studio',
    description: 'Skupinové lekce s kapacitou + osobní tréninky.',
    services: [
      {
        name: 'Skupinová lekce',
        durationMinutes: 60,
        priceHellers: 25000,
        archetype: 'skupinova_lekce',
      },
      { name: 'Osobní trénink', durationMinutes: 60, priceHellers: 60000, archetype: 'osobni_1_1' },
    ],
    bookingRules: { stornoLimitHours: 24, presunLimitHours: 4, maxReschedules: 3 },
  },
  ems_studio: {
    id: 'ems_studio',
    label: 'EMS studio',
    description: 'EMS tréninky na přístroji (1 klient / přístroj).',
    services: [
      {
        name: 'EMS trénink',
        durationMinutes: 20,
        priceHellers: 50000,
        archetype: 'ems_pristrojovy',
      },
    ],
    resources: [
      { name: 'EMS přístroj 1', type: 'ems_machine' },
      { name: 'EMS přístroj 2', type: 'ems_machine' },
    ],
    bookingRules: { stornoLimitHours: 24, presunLimitHours: 12, maxReschedules: 2 },
  },
  tennis_courts: {
    id: 'tennis_courts',
    label: 'Tenisové kurty',
    description: 'Rezervace kurtu na čas (1 rezervace / kurt).',
    services: [
      {
        name: 'Rezervace kurtu',
        durationMinutes: 60,
        priceHellers: 30000,
        archetype: 'ems_pristrojovy',
      },
    ],
    resources: [
      { name: 'Kurt 1', type: 'room' },
      { name: 'Kurt 2', type: 'room' },
      { name: 'Kurt 3', type: 'room' },
    ],
    bookingRules: { stornoLimitHours: 24, presunLimitHours: 2 },
  },
  medical_clinic: {
    id: 'medical_clinic',
    label: 'Ordinace / klinika',
    description: 'Objednání na vyšetření + zdravotní dotazník a souhlas.',
    services: [
      { name: 'Vyšetření', durationMinutes: 30, priceHellers: 0, archetype: 'osobni_1_1' },
    ],
    intakeForms: [
      {
        name: 'Vstupní zdravotní dotazník',
        fields: [
          { key: 'symptoms', label: 'Důvod návštěvy / potíže', type: 'textarea', required: true },
          { key: 'medications', label: 'Užívané léky', type: 'textarea', required: false },
          {
            key: 'consent',
            label: 'Souhlas se zpracováním zdravotních údajů',
            type: 'checkbox',
            required: true,
          },
        ],
      },
    ],
    bookingRules: { stornoLimitHours: 24, presunLimitHours: 12 },
  },
};

export function listVerticalPresets(): Array<{
  id: VerticalPresetId;
  label: string;
  description: string;
  serviceCount: number;
  resourceCount: number;
  formCount: number;
}> {
  return verticalPresetIds.map((id) => {
    const p = VERTICAL_PRESETS[id];
    return {
      id,
      label: p.label,
      description: p.description,
      serviceCount: p.services.length,
      resourceCount: p.resources?.length ?? 0,
      formCount: p.intakeForms?.length ?? 0,
    };
  });
}
