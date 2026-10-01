import React, { useEffect, useRef } from 'react';
import { router, Stack, useGlobalSearchParams, usePathname, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppStateProvider, useAppState } from '@/state/AppState';
import { colors } from '@/constants/theme';
import { isDemoMode } from '@/services/supabase';
import { requiresSignIn, resolveAuthenticatedEntryDestination, resolvePostAuthReturnTo } from '@/domain/authRoutes';
import { shouldHideSplash } from '@/domain/splashGate';
import { clearPostAuthReturnTo, readPostAuthReturnTo, rememberPostAuthReturnTo } from '@/services/postAuthReturn';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return <SafeAreaProvider><AppStateProvider><AppNavigation /></AppStateProvider></SafeAreaProvider>;
}

function AppNavigation() {
  const { userId } = useAppState();
  return <>
    <AuthNavigationCoordinator />
    <React.Fragment key={userId ?? 'signed-out'}><RootNavigator /></React.Fragment>
  </>;
}

/** Keep link restoration outside the identity-keyed navigator so auth resets cannot discard it. */
function AuthNavigationCoordinator() {
  const { authReady, hasSession } = useAppState();
  const pathname = usePathname();
  const { returnTo } = useGlobalSearchParams<{ returnTo?: string }>();
  const redirecting = useRef<string | null>(null);

  useEffect(() => {
    const safeReturnTo = resolvePostAuthReturnTo(returnTo);
    if (safeReturnTo) void rememberPostAuthReturnTo(safeReturnTo);

    const entryKey = `${pathname}:${safeReturnTo ?? ''}`;
    if (!authReady || !hasSession) { redirecting.current = null; return; }
    const isEntry = pathname === '/' || pathname === '/sign-in';
    if (!isEntry) { redirecting.current = null; return; }
    if (redirecting.current === entryKey) return;
    redirecting.current = entryKey;

    let active = true;
    void (async () => {
      const storedReturnTo = await readPostAuthReturnTo();
      const destination = resolveAuthenticatedEntryDestination(pathname, hasSession, safeReturnTo ?? undefined, storedReturnTo);
      if (!active || !destination) return;
      router.replace(destination as never);
      void clearPostAuthReturnTo();
    })();
    return () => { active = false; };
  }, [authReady, hasSession, pathname, returnTo]);

  return null;
}

function RootNavigator() {
  const { authReady, hasSession } = useAppState();
  const pathname = usePathname();
  const segments = useSegments();
  const mustSignIn = authReady && requiresSignIn(pathname, hasSession, isDemoMode);
  const isEntryRoute = (segments as readonly string[]).length === 0;
  const hideSplash = shouldHideSplash({ authReady, hasSession, isEntryRoute, mustSignIn });

  useEffect(() => {
    if (hideSplash) SplashScreen.hide();
  }, [hideSplash]);

  useEffect(() => {
    if (mustSignIn) router.replace('/sign-in' as never);
  }, [mustSignIn]);

  if (!authReady || mustSignIn) return null;
  return <>
    <StatusBar style="light" />
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas }, animation: 'fade_from_bottom' }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="nfc" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="nfc-test" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="review" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="scan" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="incoming" options={{ presentation: 'fullScreenModal', animation: 'fade_from_bottom' }} />
      <Stack.Screen name="edit-field" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="vault-category" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="privacy" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="dev-access" options={{ animation: 'slide_from_right' }} />
    </Stack>
  </>;
}
