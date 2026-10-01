import { router, Tabs } from 'expo-router';
import { useEffect } from 'react';
import { Activity, House, IdCard, LayoutTemplate, UserRound, UsersRound } from 'lucide-react-native';
import { colors } from '@/constants/theme';
import { useAppState } from '@/state/AppState';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { role, authReady, hasSession, demo } = useAppState();
  // Tab routes contain account data and must not be reachable by a direct link
  // while signed out. Public request/share routes live outside this group.
  const signedOut = authReady && !hasSession && !demo;
  useEffect(() => {
    if (signedOut) router.replace('/sign-in' as never);
  }, [signedOut]);
  if (!authReady || signedOut) return null;
  const visibleRoutes = role === 'personal'
    ? new Set(['index', 'vault', 'activity', 'profile'])
    : new Set(['index', 'templates', 'submissions', 'profile']);
  const routes = [
    { name: 'index', title: 'Home', icon: House },
    { name: 'vault', title: 'Vault', icon: IdCard },
    { name: 'activity', title: 'Activity', icon: Activity },
    { name: 'templates', title: 'Templates', icon: LayoutTemplate },
    { name: 'submissions', title: 'Submissions', icon: UsersRound },
    { name: 'profile', title: 'Profile', icon: UserRound },
  ] as const;
  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.ink, tabBarInactiveTintColor: colors.subtle, tabBarStyle: { height: 66 + insets.bottom, paddingTop: 7, paddingBottom: 8 + insets.bottom, backgroundColor: colors.surface, borderTopColor: colors.line }, tabBarLabelStyle: { fontSize: 10, fontWeight: '600' } }}>
    {routes.map(({ name, title, icon: Icon }) => <Tabs.Screen key={name} name={name} options={{ title, href: visibleRoutes.has(name) ? undefined : null, tabBarIcon: ({ color, size }) => <Icon size={size} color={color} strokeWidth={2} /> }} />)}
  </Tabs>;
}
