// Šablona "Elegant" — světlá, minimalistická, serif (beauty, ordinace).
// Tenký wrapper nad generickým SiteTemplate (variant 'elegant').

import type { SiteData } from '@/lib/api';
import { SiteTemplate } from './SiteTemplate';

export function ElegantTemplate({ site }: { site: SiteData }) {
  return <SiteTemplate site={site} variant="elegant" />;
}
