// Šablona "Fresh" — světlá, zaoblené prvky, barevné akcenty (jóga, pilates, studia).
// Tenký wrapper nad generickým SiteTemplate (variant 'fresh').

import type { SiteData } from '@/lib/api';
import { SiteTemplate } from './SiteTemplate';

export function FreshTemplate({ site }: { site: SiteData }) {
  return <SiteTemplate site={site} variant="fresh" />;
}
