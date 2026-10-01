/** Resolve the locally persisted identity for scoping account-private device state. */
export async function getAuthenticatedUserId(): Promise<string | null> {
  try {
    const { supabase } = await import('./supabase');
    if (!supabase) return null;
    const { data, error } = await supabase.auth.getSession();
    return error ? null : data.session?.user.id ?? null;
  } catch {
    return null;
  }
}
