import { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { getProfile, getMyCreditPacks, type Profile, type MyPack } from '@/lib/api';
import { clearSession } from '@/lib/auth';

export default function ProfileScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [packs, setPacks] = useState<MyPack[]>([]);

  const load = useCallback(() => {
    getProfile()
      .then(setProfile)
      .catch(() => undefined);
    getMyCreditPacks()
      .then(setPacks)
      .catch(() => setPacks([]));
  }, []);

  useFocusEffect(useCallback(() => load(), [load]));

  async function logout() {
    await clearSession();
    router.replace('/login');
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      {profile && (
        <View style={styles.card}>
          <Text style={styles.name}>
            {profile.firstName} {profile.lastName}
          </Text>
          <Text style={styles.muted}>{profile.email}</Text>
          {profile.phone ? <Text style={styles.muted}>{profile.phone}</Text> : null}
        </View>
      )}

      <Text style={styles.section}>Permanentky</Text>
      {packs.length === 0 ? (
        <Text style={styles.muted}>Žádné aktivní permanentky.</Text>
      ) : (
        packs.map((p) => (
          <View key={p.id} style={styles.card}>
            <Text style={styles.packName}>{p.name ?? 'Permanentka'}</Text>
            {p.creditsRemaining != null && (
              <Text style={styles.muted}>Zbývá kreditů: {p.creditsRemaining}</Text>
            )}
          </View>
        ))
      )}

      <Pressable style={styles.logout} onPress={logout}>
        <Text style={styles.logoutText}>Odhlásit se</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 10 },
  name: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  muted: { fontSize: 14, color: '#64748b', marginTop: 2 },
  section: { fontSize: 16, fontWeight: '700', color: '#0f172a', marginTop: 16, marginBottom: 8 },
  packName: { fontSize: 16, fontWeight: '600', color: '#0f172a' },
  logout: { marginTop: 24, padding: 14, alignItems: 'center' },
  logoutText: { color: '#dc2626', fontWeight: '700', fontSize: 16 },
});
