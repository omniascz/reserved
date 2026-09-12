import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

// Typed wrappers nad Next.js navigation. Použít místo `next/link` a `useRouter`
// v marketing appce, aby Link automaticky držel locale prefix.
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
