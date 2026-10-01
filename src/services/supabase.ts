import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const secureStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = url && anonKey
  ? createClient(url, anonKey, { auth: { storage: secureStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } })
  : null;

// Fixtures must never be reachable from a production build, even if a local
// development environment variable is accidentally carried into the build.
export const isDemoMode = __DEV__ && process.env.EXPO_PUBLIC_DEMO_MODE === 'true';
