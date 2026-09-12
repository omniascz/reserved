import { useCallback, useState } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { getMyBookings, type MyBooking } from '@/lib/api';

function fmt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('cs-CZ', {
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const STATUS_LABEL: Record<string, string> = {
  confirmed: 'Potvrzeno',
  completed: 'Absolvováno',
  cancelled: 'Zrušeno',
  no_show: 'Nedostavení',
};

export default function MyBookings() {
  const [bookings, setBookings] = useState<MyBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    getMyBookings()
      .then((b) => {
        setBookings(b);
        setError(null);
      })
      .catch(() => setError('Nepodařilo se načíst rezervace.'))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(useCallback(() => load(), [load]));

  return (
    <View style={styles.container}>
      {error && <Text style={styles.error}>{error}</Text>}
      <FlatList
        data={bookings}
        keyExtractor={(b) => b.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListEmptyComponent={
          !loading ? <Text style={styles.empty}>Zatím žádné rezervace.</Text> : null
        }
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{item.serviceName ?? 'Rezervace'}</Text>
            <Text style={styles.cardTime}>{fmt(item.startsAt)}</Text>
            <Text style={styles.badge}>{STATUS_LABEL[item.status] ?? item.status}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 10 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  cardTime: { fontSize: 14, color: '#475569', marginTop: 4 },
  badge: { fontSize: 12, color: '#10b981', marginTop: 6, fontWeight: '600' },
  empty: { textAlign: 'center', color: '#94a3b8', marginTop: 40 },
  error: { color: '#dc2626', padding: 16 },
});
