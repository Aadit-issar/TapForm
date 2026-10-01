import { spawnSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const projectRef = 'yngyfamebdvqilhiuart';
const url = process.env.TAPFORM_QA_URL;
const key = process.env.TAPFORM_QA_PUBLISHABLE_KEY;
const serial = process.env.TAPFORM_QA_DEVICE_SERIAL;
const password = process.env.TAPFORM_QA_PASSWORD_PERSONAL_A;
const adb = `${process.env.LOCALAPPDATA}\\Android\\Sdk\\platform-tools\\adb.exe`;

function runAdb(args) {
  const result = spawnSync(adb, ['-s', serial, ...args], { encoding: 'utf8', windowsHide: true });
  if (result.error || result.status !== 0) throw new Error('The authorized QA phone command failed.');
  return result.stdout.trim();
}

async function main() {
  const parsed = new URL(url || '');
  if (parsed.protocol !== 'https:' || parsed.hostname !== `${projectRef}.supabase.co` || !key || !password) {
    throw new Error('Protected disposable staging credentials are unavailable.');
  }
  if (!['RZ8TA145CRV', 'RZCX925WV0N'].includes(serial)) throw new Error('The target is not an authorized TapForm QA phone.');

  const adbDevices = spawnSync(adb, ['devices'], { encoding: 'utf8', windowsHide: true });
  if (adbDevices.error || adbDevices.status !== 0 || !adbDevices.stdout.split(/\r?\n/).some((line) => line.startsWith(`${serial}\tdevice`))) {
    throw new Error('The selected QA phone is not authorized through ADB.');
  }

  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error: authError } = await client.auth.signInWithPassword({ email: 'qa.personal.a@tapform.test', password });
  if (authError || !auth.user) throw new Error('Disposable QA Personal A could not sign in.');

  const { data: fields, error: fieldsError } = await client.from('personal_fields')
    .select('field_key,value').eq('user_id', auth.user.id).in('field_key', ['full_name', 'phone']);
  if (fieldsError) throw new Error('The disposable QA Vault could not be prepared.');
  const values = new Map((fields || []).map((field) => [field.field_key, field.value]));
  const prepared = [
    { user_id: auth.user.id, field_key: 'full_name', value: values.get('full_name')?.trim() || 'QA Personal A' },
    { user_id: auth.user.id, field_key: 'phone', value: values.get('phone')?.trim() || '+12025550101' },
  ];
  const { error: vaultError } = await client.from('personal_fields').upsert(prepared, { onConflict: 'user_id,field_key' });
  if (vaultError) throw new Error('The disposable QA Vault could not be prepared.');

  const { data: cards, error: cardsError } = await client.from('tap_cards')
    .select('id,tap_card_fields(field_key)').eq('user_id', auth.user.id).is('archived_at', null).order('display_order').limit(10);
  if (cardsError) throw new Error('Disposable QA Tap Cards could not be inspected.');
  const matching = (cards || []).find((card) => {
    const keys = (card.tap_card_fields || []).map((field) => field.field_key);
    return keys.length === 2 && keys.includes('full_name') && keys.includes('phone');
  });
  let cardId = matching?.id;
  if (!cardId) {
    const { data, error } = await client.rpc('save_tap_card', {
      p_card_id: null,
      p_name: 'QA Device Share',
      p_category: 'personal',
      p_field_keys: ['full_name', 'phone'],
      p_expires_at: null,
    });
    if (error || typeof data !== 'string') throw new Error('A disposable QA Tap Card could not be prepared.');
    cardId = data;
  }

  const { data: link, error: linkError } = await client.rpc('create_card_share_link', {
    p_card_id: cardId,
    p_one_time: true,
    p_expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    p_share_back_transfer_id: null,
  });
  if (linkError || typeof link?.token !== 'string' || !/^[0-9a-f]{64}$/i.test(link.token)) {
    throw new Error('A short-lived disposable Tap Card link could not be created.');
  }

  runAdb(['shell', 'pm', 'clear', 'com.tapform.app']);
  runAdb(['shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', `tapform:///share?token=${link.token}`]);
  await client.auth.signOut({ scope: 'local' });
  process.stdout.write('Signed-out Tap Card deep link opened on the selected QA phone.\n');
}

main().catch(() => {
  process.stderr.write('QA device link setup failed. No link token or credential was printed.\n');
  process.exitCode = 1;
});
