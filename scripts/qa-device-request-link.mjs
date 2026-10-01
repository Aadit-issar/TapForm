import { spawnSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const projectRef = 'yngyfamebdvqilhiuart';
const expectedOrgName = 'TapForm-QA-Org-A';
const expectedTemplateName = 'Event Registration';
const url = process.env.TAPFORM_QA_URL;
const key = process.env.TAPFORM_QA_PUBLISHABLE_KEY;
const password = process.env.TAPFORM_QA_PASSWORD_ORGANIZATION_A;
const createdAfter = Date.parse(process.env.TAPFORM_QA_REQUEST_LINK_CREATED_AFTER || '');
const serial = process.env.TAPFORM_QA_DEVICE_SERIAL;
const adb = `${process.env.LOCALAPPDATA}\\Android\\Sdk\\platform-tools\\adb.exe`;

function runAdb(args) {
  const result = spawnSync(adb, ['-s', serial, ...args], { encoding: 'utf8', windowsHide: true });
  if (result.error || result.status !== 0) throw new Error('The authorized QA phone command failed.');
  return result.stdout.trim();
}

async function main() {
  const parsed = new URL(url || '');
  if (parsed.protocol !== 'https:' || parsed.hostname !== `${projectRef}.supabase.co`
      || !key || !password || !Number.isFinite(createdAfter)) {
    throw new Error('Protected disposable staging credentials are unavailable.');
  }
  if (serial !== 'RZ8TA145CRV') throw new Error('Organization request QA must target the authorized M13.');

  const adbDevices = spawnSync(adb, ['devices'], { encoding: 'utf8', windowsHide: true });
  if (adbDevices.error || adbDevices.status !== 0
      || !adbDevices.stdout.split(/\r?\n/).some((line) => line.startsWith(`${serial}\tdevice`))) {
    throw new Error('The M13 is not authorized through ADB.');
  }

  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error: authError } = await client.auth.signInWithPassword({
    email: 'qa.organization.owner.a@tapform.test',
    password,
  });
  if (authError || !auth.user) throw new Error('Disposable QA organization owner could not sign in.');

  try {
    const { data: memberships, error: membershipError } = await client
      .from('organization_members').select('organization_id,organizations(name)').eq('user_id', auth.user.id);
    if (membershipError) throw new Error('The QA organization membership could not be verified.');
    const org = (memberships || []).find((item) => item.organizations?.name === expectedOrgName);
    if (!org) throw new Error('The expected disposable QA organization was not found.');

    const { data: links, error: linksError } = await client.from('organization_request_links')
      .select('id,token,template_id,one_time,expires_at,revoked_at,created_at,submission_count')
      .eq('organization_id', org.organization_id).order('created_at', { ascending: false }).limit(10);
    if (linksError) throw new Error('The QA request links could not be inspected.');

    let selected = null;
    for (const link of links || []) {
      if (Date.parse(link.created_at) < createdAfter || link.one_time !== false || link.expires_at
          || link.revoked_at || !/^[0-9a-f]{64}$/i.test(link.token)) continue;
      const { data: template, error: templateError } = await client.from('request_templates')
        .select('name,organization_id,is_archived').eq('id', link.template_id).maybeSingle();
      if (templateError) throw new Error('The request template could not be verified.');
      if (template?.name === expectedTemplateName && template.organization_id === org.organization_id
          && template.is_archived === false) {
        selected = link;
        break;
      }
    }
    if (!selected) throw new Error('A fresh, active reusable Event Registration QR was not found.');

    runAdb(['shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d',
      `tapform:///request?token=${selected.token}`]);
    process.stdout.write('The fresh QA organization request link opened on M13; no link token or account data was printed.\n');
  } finally {
    await client.auth.signOut({ scope: 'local' });
  }
}

main().catch(() => {
  process.stderr.write('QA organization request routing failed. No link token or credential was printed.\n');
  process.exitCode = 1;
});
