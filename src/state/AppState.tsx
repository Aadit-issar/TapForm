import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Vault } from '@/domain/fields';
import { isDemoMode, supabase } from '@/services/supabase';

export type Role = 'personal' | 'organization';
type AppStateValue = {
  role: Role; setRole: (role: Role) => void;
  vault: Vault; updateField: (key: keyof Vault, value: string) => void; replaceVault: (vault: Vault) => void;
  displayName: string; setDisplayName: (name: string) => void;
  developerToolsUnlocked: boolean;
  setDeveloperToolsUnlocked: (unlocked: boolean) => void;
  demo: boolean;
  authReady: boolean;
  hasSession: boolean;
  userId: string | null;
};
const AppStateContext = createContext<AppStateValue | null>(null);

export function AppStateProvider({ children }: React.PropsWithChildren) {
  const [role, setRole] = useState<Role>('personal');
  const [vault, setVault] = useState<Vault>({});
  const [displayName, setDisplayName] = useState('');
  const [developerToolsUnlocked, setDeveloperToolsUnlocked] = useState(false);
  const [authReady, setAuthReady] = useState(!supabase);
  const [hasSession, setHasSession] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEpoch, setUserEpoch] = useState(0);
  const currentUserId = useRef<string | null>(null);
  const userEpochRef = useRef(0);
  const updateField = useCallback((key: keyof Vault, value: string) => {
    // Ignore late Vault responses from a screen mounted under a prior account.
    if (userEpochRef.current !== userEpoch) return;
    setVault((old) => userEpochRef.current === userEpoch ? { ...old, [key]: value } : old);
  }, [userEpoch]);
  const replaceVault = useCallback((nextVault: Vault) => {
    if (userEpochRef.current !== userEpoch) return;
    setVault(userEpochRef.current === userEpoch ? { ...nextVault } : {});
  }, [userEpoch]);
  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let active = true;
    const applyIdentity = (nextUserId: string | null) => {
      if (currentUserId.current === nextUserId) return false;
      currentUserId.current = nextUserId;
      userEpochRef.current += 1;
      setUserEpoch(userEpochRef.current);
      setUserId(nextUserId);
      setDeveloperToolsUnlocked(false);
      setRole('personal');
      setDisplayName('');
      setVault({});
      return true;
    };
    const loadProfile = async (nextUserId: string, epoch: number) => {
      const { data } = await client.from('profiles').select('role,display_name').eq('id', nextUserId).maybeSingle();
      if (active && currentUserId.current === nextUserId && userEpochRef.current === epoch && data) {
        setRole(data.role);
        setDisplayName(data.display_name || '');
      }
    };
    const initialize = async () => {
      const startingEpoch = userEpochRef.current;
      try {
        const { data: auth } = await client.auth.getSession();
        if (!active || userEpochRef.current !== startingEpoch) return;
        const nextUserId = auth.session?.user.id ?? null;
        applyIdentity(nextUserId);
        setHasSession(Boolean(auth.session));
        // Restore locally persisted auth immediately. A network-bound profile read
        // must not keep the native splash visible on a slow or offline connection.
        if (auth.session?.user) void loadProfile(auth.session.user.id, userEpochRef.current);
      } catch {
        // A storage recovery error falls through to sign-in; it must not block launch.
      } finally {
        if (active) setAuthReady(true);
      }
    };
    void initialize();
    const { data: listener } = client.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      const nextUserId = session?.user.id ?? null;
      applyIdentity(nextUserId);
      setHasSession(Boolean(session));
      if (session) {
        const epoch = userEpochRef.current;
        setTimeout(() => { void loadProfile(session.user.id, epoch); }, 0);
      }
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);
  const value = useMemo(() => ({ role, setRole, vault, updateField, replaceVault, displayName, setDisplayName, developerToolsUnlocked, setDeveloperToolsUnlocked, demo: isDemoMode, authReady, hasSession, userId }), [role, vault, updateField, replaceVault, displayName, developerToolsUnlocked, authReady, hasSession, userId]);
  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const value = useContext(AppStateContext);
  if (!value) throw new Error('AppStateProvider is missing.');
  return value;
}
