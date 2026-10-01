type SplashGateState = {
  authReady: boolean;
  hasSession: boolean;
  isEntryRoute: boolean;
  mustSignIn: boolean;
};

export function shouldHideSplash({ authReady, hasSession, isEntryRoute, mustSignIn }: SplashGateState): boolean {
  if (!authReady || mustSignIn) return false;
  // Expo Router normalizes route groups out of usePathname(), so the signed-in
  // /(tabs) screen can also report '/'. Use the file segment to finish redirect.
  return !hasSession || !isEntryRoute;
}
