// Šablona "Bold" — tmavá, tučná sans, kontrastní (fitness, EMS, bojové sporty).
// Tenký wrapper nad generickým SiteTemplate (variant 'bold').

import type { SiteData } from '@/lib/api';
import { SiteTemplate } from './SiteTemplate';

export function BoldTemplate({ site }: { site: SiteData }) {
  return <SiteTemplate site={site} variant="bold" />;
}
