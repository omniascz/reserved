import { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Alert, RefreshControl } from 'react-native';
import { getTimetable, joinClass, type ClassSession, ApiError } from '@/lib/api';
import { getSession } from '@/lib/auth';

function fmt(iso: string): string {
  return new Date(iso).toLocaleString('cs-CZ', {
    weekday: 'short',
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function Timetable() {
  const [sessions, setSessions] = useState<ClassSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [slug, setSlug] = useState<string | null>(null);
  const [me, setMe] = useState<{ name: string; email: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const s = await getSession();
    if (!s) {
      setLoading(false);
      return;
    }
    setSlug(s.tenantSlug);
    setMe({ name: s.name, email: s.email });
    const from = new Date().toISOString();
    const to = new Date(Date.now() + 14 * 86400_000).toISOString();
    try {
      setSessions(await getTimetable(s.tenantSlug, from, to));
    } catch {
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function book(session: ClassSession) {
    if (!slug || !me) return;
    try {
      const r = await joinClass(slug, session.id, {
        customerName: me.name,
        customerEmail: me.email,
      });
      Alert.alert('Přihlášeno ✓', `Rezervace ${r.referenceCode}`);
      void load();
    } catch (e) {
      Alert.alert('Nepovedlo se', e instanceof ApiError ? e.message : 'Zkus to znovu.');
    }
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={sessions}
        keyExtractor={(s) => s.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListEmptyComponent={!loading ? <Text style={styles.empty}>Žádné lekce.</Text> : null}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => {
          const free = item.capacity - item.bookedCount;
          return (
            <View style={styles.card}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{item.serviceName ?? 'Lekce'}</Text>
                <Text style={styles.cardTime}>{fmt(item.startsAt)}</Text>
                <Text style={styles.free}>{free > 0 ? `Volných míst: ${free}` : 'Plno'}</Text>
              </View>
              <Pressable
                style={[styles.btn, free <= 0 && styles.btnDisabled]}
                disabled={free <= 0}
                onPress={() => book(item)}
              >
                <Text style={styles.btnText}>Rezervovat</Text>
              </Pressable>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  cardTime: { fontSize: 14, color: '#475569', marginTop: 4 },
  free: { fontSize: 12, color: '#64748b', marginTop: 4 },
  btn: { backgroundColor: '#10b981', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  btnDisabled: { backgroundColor: '#cbd5e1' },
  btnText: { color: '#fff', fontWeight: '700' },
  empty: { textAlign: 'center', color: '#94a3b8', marginTop: 40 },
});
