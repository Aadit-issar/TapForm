import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
  const expected = Deno.env.get('PURGE_CRON_SECRET');
  if (!expected || request.headers.get('authorization') !== `Bearer ${expected}`) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const url = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceRoleKey) return Response.json({ error: 'Server configuration is missing' }, { status: 500 });
  const client = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await client.rpc('purge_expired_shared_values');
  if (error) return Response.json({ error: 'Expired shared data could not be removed' }, { status: 500 });
  return Response.json({ removedValues: data });
});
