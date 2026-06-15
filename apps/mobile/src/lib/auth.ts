// Session storage — token + slug studia + e-mail klienta v secure store.

import * as SecureStore from 'expo-secure-store';

const KEY = 'reserved_session';

export interface Session {
  tenantSlug: string;
  token: string;
  email: string;
  name: string;
}

let cache: Session | null | undefined;

export async function getSession(): Promise<Session | null> {
  if (cache !== undefined) return cache;
  const raw = await SecureStore.getItemAsync(KEY);
  cache = raw ? (JSON.parse(raw) as Session) : null;
  return cache;
}

export async function setSession(session: Session): Promise<void> {
  cache = session;
  await SecureStore.setItemAsync(KEY, JSON.stringify(session));
}

export async function clearSession(): Promise<void> {
  cache = null;
  await SecureStore.deleteItemAsync(KEY);
}
