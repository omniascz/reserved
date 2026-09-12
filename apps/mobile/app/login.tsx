import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { portalLogin, ApiError } from '@/lib/api';
import { setSession } from '@/lib/auth';

export default function Login() {
  const router = useRouter();
  const [slug, setSlug] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!slug || !email || !password) {
      Alert.alert('Vyplň studio, e-mail a heslo.');
      return;
    }
    setBusy(true);
    try {
      const { accessToken } = await portalLogin(slug.trim(), email.trim(), password);
      await setSession({
        tenantSlug: slug.trim(),
        token: accessToken,
        email: email.trim(),
        name: email.trim(),
      });
      router.replace('/(tabs)');
    } catch (e) {
      Alert.alert('Přihlášení selhalo', e instanceof ApiError ? e.message : 'Zkus to znovu.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>
        <Text style={styles.title}>Moje rezervace</Text>
        <Text style={styles.sub}>Přihlas se do svého studia</Text>

        <TextInput
          style={styles.input}
          placeholder="Studio (např. demo)"
          autoCapitalize="none"
          value={slug}
          onChangeText={setSlug}
        />
        <TextInput
          style={styles.input}
          placeholder="E-mail"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Heslo"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        <Pressable
          style={[styles.btn, busy && styles.btnDisabled]}
          disabled={busy}
          onPress={submit}
        >
          <Text style={styles.btnText}>{busy ? 'Přihlašuji…' : 'Přihlásit'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  inner: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  title: { color: '#fff', fontSize: 32, fontWeight: '800' },
  sub: { color: '#94a3b8', fontSize: 16, marginBottom: 16 },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  btn: {
    backgroundColor: '#10b981',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
