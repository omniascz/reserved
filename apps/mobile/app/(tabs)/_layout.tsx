import { Tabs } from 'expo-router';
import { Text } from 'react-native';

// Jednoduché textové ikony (bez extra závislosti na icon balíčku).
function icon(label: string, color: string) {
  return <Text style={{ fontSize: 20, color }}>{label}</Text>;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#10b981',
        headerStyle: { backgroundColor: '#0f172a' },
        headerTintColor: '#fff',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Rezervace', tabBarIcon: ({ color }) => icon('🗓', color) }}
      />
      <Tabs.Screen
        name="timetable"
        options={{ title: 'Rozvrh', tabBarIcon: ({ color }) => icon('📋', color) }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profil', tabBarIcon: ({ color }) => icon('👤', color) }}
      />
    </Tabs>
  );
}
