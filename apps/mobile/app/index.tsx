import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Redirect } from 'expo-router';
import { getSession } from '@/lib/auth';

// Vstupní bod — podle session přesměruje na přihlášení nebo do appky.
export default function Index() {
  const [state, setState] = useState<'loading' | 'in' | 'out'>('loading');

  useEffect(() => {
    getSession().then((s) => setState(s ? 'in' : 'out'));
  }, []);

  if (state === 'loading') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }
  return state === 'in' ? <Redirect href="/(tabs)" /> : <Redirect href="/login" />;
}
