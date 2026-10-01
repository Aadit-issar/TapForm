import { spawnSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const projectRef = 'yngyfamebdvqilhiuart';
const url = process.env.TAPFORM_QA_URL;
const key = process.env.TAPFORM_QA_PUBLISHABLE_KEY;
const serial = process.env.TAPFORM_QA_DEVICE_SERIAL;
const adb = `${process.env.LOCALAPPDATA}\\Android\\Sdk\\platform-tools\\adb.exe`;

function client() {
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function runAdb(args) {
  const result = spawnSync(adb, ['-s', serial, ...args], { encoding: 'utf8', windowsHide: true });
  if (result.error || result.status !== 0) throw new Error('The authorized QA phone command failed.');
}

async function main() {
  const parsed = new URL(url || '');
  if (parsed.protocol !== 'https:' || parsed.hostname !== `${projectRef}.supabase.co` || !key) {
    throw new Error('Protected disposable staging credentials are unavailable.');
  }
  if (serial !== 'RZCX925WV0N') throw new Error('Share Back must be routed to the authorized M35.');
  const devices = spawnSync(adb, ['devices'], { encoding: 'utf8', windowsHide: true });
  if (devices.error || devices.status !== 0 || !devices.stdout.split(/\r?\n/).some((line) => line.startsWith(`${serial}\tdevice`))) {
    throw new Error('The M35 is not authorized through ADB.');
  }

  const owner = client();
  const receiver = client();
  const [ownerAuth, receiverAuth] = await Promise.all([
    owner.auth.signInWithPassword({ email: 'qa.personal.b@tapform.test', password: process.env.TAPFORM_QA_PASSWORD_PERSONAL_B }),
    receiver.auth.signInWithPassword({ email: 'qa.personal.a@tapform.test', password: process.env.TAPFORM_QA_PASSWORD_PERSONAL_A }),
  ]);
  if (ownerAuth.error || !ownerAuth.data.user || receiverAuth.error || !receiverAuth.data.user) {
    throw new Error('Disposable QA identities could not be verified.');
  }

  const { data: links, error } = await owner.from('peer_share_links')
    .select('token,one_time,target_user_id,expires_at,revoked_at,created_at')
    .eq('owner_user_id', ownerAuth.data.user.id)
    .order('created_at', { ascending: false }).limit(1);
  const link = links?.[0];
  if (error || !link || !/^[0-9a-f]{64}$/i.test(link.token)
      || link.target_user_id !== receiverAuth.data.user.id || link.one_time !== true
      || link.revoked_at || (link.expires_at && Date.parse(link.expires_at) <= Date.now())) {
    throw new Error('The latest M13 Share Back link is not active and correctly targeted.');
  }

  runAdb(['shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', `tapform:///share?token=${link.token}`]);
  await Promise.all([owner.auth.signOut({ scope: 'local' }), receiver.auth.signOut({ scope: 'local' })]);
  process.stdout.write('M13 Share Back opened on M35 and is scoped to the original sender.\n');
}

main().catch(() => {
  process.stderr.write('QA Share Back routing failed. No link token or credential was printed.\n');
  process.exitCode = 1;
});
