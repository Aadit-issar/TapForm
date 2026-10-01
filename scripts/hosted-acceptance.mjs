import { randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const EXPECTED_PROJECT_REF = 'yngyfamebdvqilhiuart';
const url = process.env.TAPFORM_QA_URL;
const publishableKey = process.env.TAPFORM_QA_PUBLISHABLE_KEY;
const serviceKey = process.env.TAPFORM_QA_SERVICE_KEY;
const checks = [];

function verify(condition, label) {
  if (!condition) throw new Error(`FAILED: ${label}`);
  checks.push(label);
  process.stdout.write(`PASS ${checks.length}: ${label}\n`);
}

function createUserClient() {
  return createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function signIn(label, email, password) {
  if (!password) throw new Error(`Missing protected QA credential for ${label}.`);
  const client = createUserClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error(`QA sign-in failed for ${label}.`);
  return { client, user: data.user };
}

async function rpc(client, name, args) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(`${name} failed (${error.code || 'unknown'}).`);
  return data;
}

async function expectRpcError(client, name, args, codes, label) {
  const { error } = await client.rpc(name, args);
  verify(Boolean(error && codes.includes(error.code)), label);
}

async function deniedRows(client, table, columns, column, value, label) {
  const { data, error } = await client.from(table).select(columns).eq(column, value);
  verify(Boolean(error || (data || []).length === 0), label);
}

async function firstOrganization(client, userId) {
  const { data, error } = await client.from('organization_members').select('organization_id').eq('user_id', userId).limit(1);
  if (error) throw new Error('Could not inspect the QA organization membership.');
  return data?.[0]?.organization_id || null;
}

async function ensureOrganization(identity, label) {
  const existing = await firstOrganization(identity.client, identity.user.id);
  if (existing) return existing;
  return rpc(identity.client, 'create_organization', {
    p_name: label,
    p_type: 'QA test organization',
    p_contact_email: identity.user.email,
  });
}

async function setField(client, userId, fieldKey, value) {
  if (value === null) {
    const { error } = await client.from('personal_fields').delete().eq('user_id', userId).eq('field_key', fieldKey);
    if (error) throw new Error(`Could not restore the QA ${fieldKey} field.`);
    return;
  }
  const { error } = await client.from('personal_fields').upsert(
    { user_id: userId, field_key: fieldKey, value },
    { onConflict: 'user_id,field_key' },
  );
  if (error) throw new Error(`Could not prepare the QA ${fieldKey} field.`);
}

async function saveTemplate(client, templateId, name, purpose, fields, questions) {
  return rpc(client, 'save_request_template', {
    p_template_id: templateId,
    p_name: name,
    p_purpose: purpose,
    p_retention_days: 7,
    p_fields: fields,
    p_questions: questions,
    p_description: 'Disposable hosted acceptance data.',
  });
}

async function createJoinedSession(organizationClient, personalClient, templateId) {
  const session = await rpc(organizationClient, 'create_request_session', { p_template_id: templateId });
  const joined = await rpc(personalClient, 'join_request_session', {
    p_session_id: session.requestSessionId,
    p_nonce: session.nonce,
  });
  return { session, joined };
}

async function within(promise, label, milliseconds = 15_000) {
  let timeout;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error(`Realtime timeout: ${label}.`)), milliseconds); }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

async function verifyHostedRealtime(organization, personal, organizationId, templateId) {
  const { session } = await createJoinedSession(organization.client, personal.client, templateId);
  const watchResponses = (client) => {
    let resolveStatus;
    let rejectStatus;
    let resolveReconnect;
    let subscribedCount = 0;
    const responseEvents = [];
    const responseWaiters = [];
    const sessionEvents = [];
    const sessionWaiters = [];
    const statuses = [];
    const readinessWaiters = [];
    let replicationReadyCount = 0;
    const status = new Promise((resolve, reject) => { resolveStatus = resolve; rejectStatus = reject; });
    const reconnected = new Promise((resolve) => { resolveReconnect = resolve; });
    const nextEvent = (events, waiters) => events.length
      ? Promise.resolve(events.shift())
      : new Promise((resolve) => waiters.push(resolve));
    const channel = client.channel(`qa-submissions-${randomUUID()}`, { config: { broadcast: { replication_ready: true } } })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'request_sessions', filter: `organization_id=eq.${organizationId}` }, (event) => {
        const resolve = sessionWaiters.shift();
        if (resolve) resolve(event.new);
        else sessionEvents.push(event.new);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'request_responses' }, (event) => {
        const resolve = responseWaiters.shift();
        if (resolve) resolve(event.new);
        else responseEvents.push(event.new);
      })
      .on('system', {}, (event) => {
        if (event.extension !== 'system') return;
        if (event.status === 'ok') {
          replicationReadyCount += 1;
          const waiter = readinessWaiters.find(({ afterCount }) => replicationReadyCount > afterCount);
          if (waiter) {
            readinessWaiters.splice(readinessWaiters.indexOf(waiter), 1);
            waiter.resolve(event);
          }
        } else if (event.status === 'error') {
          for (const waiter of readinessWaiters.splice(0)) waiter.reject(new Error(event.message || 'Realtime replication was not ready.'));
        }
      })
      .subscribe((state) => {
        statuses.push(state);
        if (state === 'SUBSCRIBED') {
          subscribedCount += 1;
          resolveStatus(state);
          if (subscribedCount > 1) resolveReconnect(state);
        } else if (subscribedCount === 0 && ['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(state)) {
          rejectStatus(new Error(`Realtime subscription status: ${state}.`));
        }
      });
    return {
      channel,
      status,
      reconnected,
      nextResponse: () => nextEvent(responseEvents, responseWaiters),
      nextSession: () => nextEvent(sessionEvents, sessionWaiters),
      replicationReadyCount: () => replicationReadyCount,
      waitForReplicationReady: (afterCount = 0) => replicationReadyCount > afterCount
        ? Promise.resolve(true)
        : new Promise((resolve, reject) => readinessWaiters.push({ afterCount, resolve, reject })),
      diagnostics: () => ({ statuses, responseEventCount: responseEvents.length, sessionEventCount: sessionEvents.length, subscribedCount }),
    };
  };
  const ownerWatch = watchResponses(organization.client);

  try {
    verify((await within(ownerWatch.status, 'organization submissions subscription')) === 'SUBSCRIBED', 'hosted Realtime subscription becomes active for an organization');
    await within(ownerWatch.waitForReplicationReady(), 'organization Postgres Changes replication readiness');
    verify(true, 'hosted Realtime confirms its Postgres Changes replication connection is ready');
    const result = await rpc(personal.client, 'respond_to_request', {
      p_session_id: session.requestSessionId,
      p_approved: true,
      p_approved_keys: ['full_name'],
      p_answers: {},
      p_missing_values: {},
      p_save_missing_keys: [],
    });
    const [{ data: visibleSession, error: visibleSessionError }, { data: visibleResponse, error: visibleResponseError }] = await Promise.all([
      organization.client.from('request_sessions').select('id,status').eq('id', session.requestSessionId).maybeSingle(),
      organization.client.from('request_responses').select('id,status').eq('id', result.responseId).maybeSingle(),
    ]);
    verify(!visibleSessionError && visibleSession?.id === session.requestSessionId && visibleSession.status === 'approved',
      'the organization can read the updated request session through authenticated RLS');
    verify(!visibleResponseError && visibleResponse?.id === result.responseId && visibleResponse.status === 'approved',
      'the organization can read the new response through authenticated RLS');
    const [ownerSession, ownerResponse] = await Promise.allSettled([
      within(ownerWatch.nextSession(), 'organization-scoped session update'),
      within(ownerWatch.nextResponse(), 'organization response visibility'),
    ]);
    const eventSummary = {
      organizationSession: ownerSession.status === 'fulfilled' && ownerSession.value.id === session.requestSessionId,
      organizationResponse: ownerResponse.status === 'fulfilled' && ownerResponse.value.id === result.responseId && ownerResponse.value.personal_user_id === personal.user.id,
      sessionFailure: ownerSession.status === 'rejected' ? ownerSession.reason?.message || 'unknown' : null,
      responseFailure: ownerResponse.status === 'rejected' ? ownerResponse.reason?.message || 'unknown' : null,
    };
    process.stdout.write(`REALTIME EVENT DELIVERY ${JSON.stringify({ ...eventSummary, subscription: ownerWatch.diagnostics() })}\n`);
    verify(result.status === 'approved' && ownerResponse.status === 'fulfilled' && ownerResponse.value.id === result.responseId && ownerResponse.value.personal_user_id === personal.user.id,
      'hosted Realtime delivers the approved submission to its organization owner');
    verify(ownerSession.status === 'fulfilled' && ownerSession.value.id === session.requestSessionId,
      'hosted Realtime delivers the filtered request session update to its organization owner');

    const readyCountBeforeReconnect = ownerWatch.replicationReadyCount();
    await organization.client.realtime.disconnect();
    organization.client.realtime.connect();
    verify((await within(ownerWatch.reconnected, 'organization subscription reconnect', 30_000)) === 'SUBSCRIBED',
      'hosted organization Realtime subscription rejoins after a socket reconnect');
    await within(ownerWatch.waitForReplicationReady(readyCountBeforeReconnect), 'organization replication readiness after reconnect');

    const afterReconnect = await createJoinedSession(organization.client, personal.client, templateId);
    const sessionAfterReconnect = ownerWatch.nextSession();
    const responseAfterReconnect = ownerWatch.nextResponse();
    const reconnectResult = await rpc(personal.client, 'respond_to_request', {
      p_session_id: afterReconnect.session.requestSessionId,
      p_approved: true,
      p_approved_keys: ['full_name'],
      p_answers: {},
      p_missing_values: {},
      p_save_missing_keys: [],
    });
    const [reconnectedSessionEvent, reconnectedResponseEvent] = await Promise.allSettled([
      within(sessionAfterReconnect, 'post-reconnect organization session update'),
      within(responseAfterReconnect, 'post-reconnect organization response event'),
    ]);
    verify(reconnectResult.status === 'approved'
      && reconnectedSessionEvent.status === 'fulfilled'
      && reconnectedSessionEvent.value.id === afterReconnect.session.requestSessionId
      && reconnectedResponseEvent.status === 'fulfilled'
      && reconnectedResponseEvent.value.id === reconnectResult.responseId,
    'organization submissions continue updating after a Realtime reconnect');
  } finally {
    await organization.client.removeChannel(ownerWatch.channel);
    await organization.client.realtime.disconnect();
  }
}

async function run() {
  if (!url || !publishableKey || !serviceKey) throw new Error('QA environment is incomplete.');
  const parsedUrl = new URL(url);
  if (parsedUrl.hostname !== `${EXPECTED_PROJECT_REF}.supabase.co` || parsedUrl.protocol !== 'https:') {
    throw new Error('Refusing to run outside the authorized disposable staging project.');
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const [personalA, personalB, organizationA, organizationB] = await Promise.all([
    signIn('Personal A', 'qa.personal.a@tapform.test', process.env.TAPFORM_QA_PASSWORD_PERSONAL_A),
    signIn('Personal B', 'qa.personal.b@tapform.test', process.env.TAPFORM_QA_PASSWORD_PERSONAL_B),
    signIn('Organization Owner A', 'qa.organization.owner.a@tapform.test', process.env.TAPFORM_QA_PASSWORD_ORGANIZATION_A),
    signIn('Organization Owner B', 'qa.organization.owner.b@tapform.test', process.env.TAPFORM_QA_PASSWORD_ORGANIZATION_B),
  ]);

  verify(Boolean(personalA.user.id && personalB.user.id && organizationA.user.id && organizationB.user.id), 'all four disposable QA identities authenticate');

  const originalFields = {};
  const originalDisplayNames = {};
  const originalDefaults = {};
  const temporaryCards = [];
  const temporaryTemplates = [];
  const temporaryPeerLinks = [];
  const temporaryRequestLinks = [];
  let disposableOrganizationId = null;
  let originalOrganizationDefault = null;
  let deletionUserId = null;
  let deletionCompleted = false;
  try {
    const orgAId = await ensureOrganization(organizationA, 'QA Boundary Organization A');
    const orgBId = await ensureOrganization(organizationB, 'QA Boundary Organization B');
    disposableOrganizationId = orgBId;
    verify(Boolean(orgAId && orgBId && orgAId !== orgBId), 'two independent organization owners resolve separate organizations');
    const { data: previousOrganizationPreferences, error: previousPreferencesError } = await organizationB.client
      .from('organization_preferences').select('default_template_id').eq('organization_id', orgBId).maybeSingle();
    if (previousPreferencesError) throw new Error('Could not inspect the QA organization default template.');
    originalOrganizationDefault = previousOrganizationPreferences?.default_template_id ?? null;

    for (const [key, identity] of [['personalA', personalA], ['personalB', personalB]]) {
      const { data, error } = await identity.client.from('personal_fields').select('field_key,value').eq('user_id', identity.user.id);
      if (error) throw new Error('Could not prepare the disposable Vault fixtures.');
      originalFields[key] = Object.fromEntries((data || []).map((row) => [row.field_key, row.value]));
      const { data: profile, error: profileError } = await identity.client.from('profiles').select('display_name').eq('id', identity.user.id).maybeSingle();
      if (profileError || !profile) throw new Error('Could not inspect a disposable QA profile.');
      originalDisplayNames[key] = profile.display_name || '';
    }
    const nameA = originalFields.personalA.full_name || 'QA Personal A Hosted Test';
    const nameB = originalFields.personalB.full_name || 'QA Personal B Hosted Test';
    originalFields.personalA.full_name ??= null;
    originalFields.personalA.grade ??= null;
    originalFields.personalB.full_name ??= null;
    await setField(personalA.client, personalA.user.id, 'full_name', nameA);
    await setField(personalB.client, personalB.user.id, 'full_name', nameB);
    await setField(personalA.client, personalA.user.id, 'grade', null);

    const profileNameA = 'QA Personal A';
    const profileNameB = 'QA Personal B';
    const updatedProfileA = await rpc(personalA.client, 'update_my_display_name', { p_display_name: profileNameA });
    const updatedProfileB = await rpc(personalB.client, 'update_my_display_name', { p_display_name: profileNameB });
    verify(updatedProfileA === profileNameA && updatedProfileB === profileNameB,
    'each personal user can update their own sharing name');
    await deniedRows(personalA.client, 'profiles', 'id', 'id', personalB.user.id, 'Personal A cannot read Personal B profile');
    const { data: crossProfileUpdate, error: crossProfileUpdateError } = await personalA.client.from('profiles')
      .update({ display_name: 'Unauthorized QA edit' }).eq('id', personalB.user.id).select('id');
    verify(Boolean(crossProfileUpdateError && crossProfileUpdateError.code === '42501') && (crossProfileUpdate || []).length === 0,
      'profile table writes remain blocked outside the scoped RPC');

    const { data: cardsA, error: cardsAError } = await personalA.client.from('tap_cards').select('id').eq('user_id', personalA.user.id).limit(1);
    const { data: cardsB, error: cardsBError } = await personalB.client.from('tap_cards').select('id').eq('user_id', personalB.user.id).limit(1);
    if (cardsAError || cardsBError) throw new Error('Could not read the disposable Tap Card fixtures.');
    await deniedRows(personalA.client, 'personal_fields', 'user_id,field_key', 'user_id', personalB.user.id, 'Personal A cannot read Personal B Vault rows');
    await deniedRows(personalB.client, 'personal_fields', 'user_id,field_key', 'user_id', personalA.user.id, 'Personal B cannot read Personal A Vault rows');
    await deniedRows(personalA.client, 'tap_cards', 'id', 'user_id', personalB.user.id, 'Personal A cannot read Personal B Tap Cards');
    await deniedRows(personalB.client, 'tap_cards', 'id', 'user_id', personalA.user.id, 'Personal B cannot read Personal A Tap Cards');
    if (cardsB?.[0]) {
      await expectRpcError(personalA.client, 'save_tap_card', {
        p_card_id: cardsB[0].id, p_name: 'Unauthorized edit', p_category: 'custom', p_field_keys: ['full_name'], p_expires_at: null,
      }, ['P0002'], 'Personal A cannot modify Personal B Tap Cards');
    } else {
      throw new Error('Personal B has no Tap Card fixture for a cross-account write test.');
    }

    const originalDefault = async (identity) => {
      const { data, error } = await identity.client.from('profiles').select('default_tap_card_id').eq('id', identity.user.id).maybeSingle();
      if (error) throw new Error('Could not inspect the current QA Tap Card default.');
      return data?.default_tap_card_id || null;
    };
    originalDefaults.personalA = await originalDefault(personalA);
    originalDefaults.personalB = await originalDefault(personalB);

    const createPeerCard = async (identity, label) => {
      const id = await rpc(identity.client, 'save_tap_card', {
        p_card_id: null, p_name: label, p_category: 'custom', p_field_keys: ['full_name'],
        p_expires_at: new Date(Date.now() + 45 * 60 * 1000).toISOString(),
      });
      temporaryCards.push({ identity, id });
      return id;
    };
    const cardB = await createPeerCard(personalB, 'QA Hosted Personal B');
    const cardA = await createPeerCard(personalA, 'QA Hosted Personal A');
    await rpc(personalB.client, 'set_default_tap_card', { p_card_id: cardB });
    const { data: selectedDefault } = await personalB.client.from('profiles').select('default_tap_card_id').eq('id', personalB.user.id).maybeSingle();
    verify(selectedDefault?.default_tap_card_id === cardB, 'default Tap Card is persisted for the owning account');

    const createAndAcceptPeer = async (owner, receiver, cardId, directionLabel, expectedSenderName, expectedReceiverName) => {
      const share = await rpc(owner.client, 'create_card_share_link', {
        p_card_id: cardId, p_one_time: true, p_expires_at: null, p_share_back_transfer_id: null,
      });
      temporaryPeerLinks.push(share.linkId);
      const metadata = await owner.client.from('peer_share_links').select('one_time,expires_at').eq('id', share.linkId).single();
      if (metadata.error) throw new Error('Could not inspect the hosted one-time Tap Card link.');
      verify(metadata.data.one_time && Date.parse(metadata.data.expires_at) <= Date.now() + 20 * 60 * 1000, `${directionLabel}: share is one-time and time-bounded`);
      const idempotencyKey = randomUUID();
      const exchange = await rpc(receiver.client, 'join_card_share', { p_token: share.token, p_idempotency_key: idempotencyKey });
      verify(Array.isArray(exchange.fields) && exchange.fields.length === 1 && !Object.hasOwn(exchange, 'values'), `${directionLabel}: review receives only selected field descriptors`);
      verify(exchange.senderName === expectedSenderName, `${directionLabel}: review identifies the sharer by their selected profile name`);
      await rpc(owner.client, 'update_my_display_name', { p_display_name: `${expectedSenderName} changed after review` });
      const resumedExchange = await rpc(receiver.client, 'join_card_share', { p_token: share.token, p_idempotency_key: idempotencyKey });
      verify(resumedExchange.senderName === expectedSenderName, `${directionLabel}: resumed review retains its original sharer identity`);
      const completion = await rpc(receiver.client, 'respond_to_peer_exchange', {
        p_exchange_id: exchange.exchangeId, p_nonce: exchange.nonce, p_accept: true,
      });
      verify(completion.status === 'completed' && completion.fieldCount === 1, `${directionLabel}: explicit consent completes the share`);
      const { data: receipt, error: receiptError } = await owner.client.from('peer_transfers')
        .select('sender_name_snapshot,receiver_name_snapshot').eq('id', completion.transferId).maybeSingle();
      verify(!receiptError && receipt?.sender_name_snapshot === expectedSenderName && receipt?.receiver_name_snapshot === expectedReceiverName,
        `${directionLabel}: completed receipt snapshots both participant names`);
      await rpc(owner.client, 'update_my_display_name', { p_display_name: expectedSenderName });
      await expectRpcError(receiver.client, 'join_card_share', { p_token: share.token, p_idempotency_key: randomUUID() }, ['P0001'], `${directionLabel}: completed one-time link rejects replay`);
      return completion.transferId;
    };
    const transferBtoA = await createAndAcceptPeer(personalB, personalA, cardB, 'Personal B to Personal A', profileNameB, profileNameA);
    const transferAtoB = await createAndAcceptPeer(personalA, personalB, cardA, 'Personal A to Personal B', profileNameA, profileNameB);
    await expectRpcError(personalB.client, 'join_card_share', { p_token: 'malformed', p_idempotency_key: randomUUID() }, ['22023'], 'malformed Tap Card token is rejected by the hosted RPC');

    const reusablePeerLink = await rpc(personalA.client, 'create_card_share_link', {
      p_card_id: cardA, p_one_time: false, p_expires_at: null, p_share_back_transfer_id: null,
    });
    temporaryPeerLinks.push(reusablePeerLink.linkId);
    const { data: reusablePeerMetadata, error: reusablePeerMetadataError } = await personalA.client.from('peer_share_links')
      .select('one_time,expires_at,used_at,revoked_at').eq('id', reusablePeerLink.linkId).single();
    verify(!reusablePeerMetadataError && reusablePeerMetadata?.one_time === false && !reusablePeerMetadata.used_at
      && !reusablePeerMetadata.revoked_at && (!reusablePeerMetadata.expires_at || Date.parse(reusablePeerMetadata.expires_at) > Date.now()),
    'reusable Tap Card QR remains active without one-time replay state');
    const reusableJoin = async () => rpc(personalB.client, 'join_card_share', {
      p_token: reusablePeerLink.token, p_idempotency_key: randomUUID(),
    });
    const reusableExchangeOne = await reusableJoin();
    verify(Array.isArray(reusableExchangeOne.fields) && reusableExchangeOne.fields.length === 1 && !Object.hasOwn(reusableExchangeOne, 'values'),
      'reusable QR review contains selected field descriptors only');
    const reusableCompletionOne = await rpc(personalB.client, 'respond_to_peer_exchange', {
      p_exchange_id: reusableExchangeOne.exchangeId, p_nonce: reusableExchangeOne.nonce, p_accept: true,
    });
    verify(reusableCompletionOne.status === 'completed' && reusableCompletionOne.fieldCount === 1,
      'first recipient approval completes from reusable Tap Card QR');
    const reusableJoinMetadata = await personalA.client.from('peer_share_links')
      .select('used_at,revoked_at').eq('id', reusablePeerLink.linkId).single();
    verify(!reusableJoinMetadata.error && !reusableJoinMetadata.data.used_at && !reusableJoinMetadata.data.revoked_at,
      'reusable Tap Card QR remains available after an approved transfer');
    const reusableExchangeTwo = await reusableJoin();
    verify(reusableExchangeTwo.exchangeId !== reusableExchangeOne.exchangeId,
      'a later scan of reusable QR starts an independent exchange');
    const reusableCompletionTwo = await rpc(personalB.client, 'respond_to_peer_exchange', {
      p_exchange_id: reusableExchangeTwo.exchangeId, p_nonce: reusableExchangeTwo.nonce, p_accept: true,
    });
    verify(reusableCompletionTwo.status === 'completed' && reusableCompletionTwo.fieldCount === 1
      && reusableCompletionTwo.transferId !== reusableCompletionOne.transferId,
    'second approval creates a separate receipt from the same reusable Tap Card QR');

    const revokedPeerLink = await rpc(personalA.client, 'create_card_share_link', {
      p_card_id: cardA, p_one_time: false, p_expires_at: null, p_share_back_transfer_id: null,
    });
    temporaryPeerLinks.push(revokedPeerLink.linkId);
    verify(await rpc(personalA.client, 'revoke_card_share_link', { p_link_id: revokedPeerLink.linkId }), 'Tap Card owner revokes a reusable share link');
    await expectRpcError(personalB.client, 'join_card_share', { p_token: revokedPeerLink.token, p_idempotency_key: randomUUID() }, ['P0001'], 'revoked Tap Card share is rejected by the hosted RPC');
    const expiredPeerLink = await rpc(personalA.client, 'create_card_share_link', {
      p_card_id: cardA, p_one_time: false, p_expires_at: new Date(Date.now() + 2500).toISOString(), p_share_back_transfer_id: null,
    });
    temporaryPeerLinks.push(expiredPeerLink.linkId);
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await expectRpcError(personalB.client, 'join_card_share', { p_token: expiredPeerLink.token, p_idempotency_key: randomUUID() }, ['P0001'], 'expired Tap Card share is rejected by the hosted RPC');
    const { data: receivedByA, error: receivedByAError } = await personalA.client.from('received_cards').select('id').eq('transfer_id', transferBtoA).maybeSingle();
    const { data: receivedByB, error: receivedByBError } = await personalB.client.from('received_cards').select('id').eq('transfer_id', transferAtoB).maybeSingle();
    if (receivedByAError || receivedByBError) throw new Error('Could not verify the hosted received-card records.');
    verify(Boolean(receivedByA?.id && receivedByB?.id), 'each independent recipient receives a separate contact-style card');
    await deniedRows(personalB.client, 'received_cards', 'id', 'id', receivedByA.id, 'Personal B cannot read Personal A received cards');
    await deniedRows(personalA.client, 'received_cards', 'id', 'id', receivedByB.id, 'Personal A cannot read Personal B received cards');

    const templateName = `QA Hosted Complete Flow ${Date.now()}`;
    const firstFields = [{ key: 'full_name', required: true }, { key: 'grade', required: true }];
    const questions = [
      { prompt: 'Short response', type: 'short_text', required: true, minLength: 2, maxLength: 40 },
      { prompt: 'Long response', type: 'long_text', required: false, minLength: 4, maxLength: 200 },
      { prompt: 'Attendance', type: 'single_choice', required: true, options: ['On site', 'Remote'] },
      { prompt: 'Sessions', type: 'multiple_choice', required: false, options: ['Workshop', 'Talk'] },
      { prompt: 'Will you attend?', type: 'yes_no', required: false },
      { prompt: 'How many?', type: 'number', required: false, minValue: 1, maxValue: 10 },
      { prompt: 'Event date', type: 'date', required: false },
    ];
    const templateId = await saveTemplate(organizationB.client, null, templateName, 'Hosted acceptance of private request flows.', firstFields, questions);
    temporaryTemplates.push(templateId);
    await rpc(organizationB.client, 'set_default_request_template', { p_template_id: templateId });
    const { data: preference } = await organizationB.client.from('organization_preferences').select('default_template_id').eq('organization_id', orgBId).maybeSingle();
    verify(preference?.default_template_id === templateId, 'default organization template is persisted');
    const { data: orgVisible } = await organizationB.client.from('request_templates').select('id').eq('id', templateId);
    verify(Boolean(orgVisible?.some((row) => row.id === templateId)), 'template owner can read its own template');
    await deniedRows(organizationA.client, 'request_templates', 'id', 'id', templateId, 'Organization A cannot read Organization B templates');
    await deniedRows(organizationB.client, 'personal_fields', 'user_id,field_key', 'user_id', personalA.user.id, 'Organization B cannot directly read Personal A Vault rows');
    await expectRpcError(organizationA.client, 'set_default_request_template', { p_template_id: templateId }, ['P0002'], 'Organization A cannot set Organization B template as its default');
    await expectRpcError(organizationA.client, 'create_request_link', { p_template_id: templateId, p_one_time: false, p_expires_at: null }, ['P0002'], 'Organization A cannot create links for Organization B templates');

    const { session, joined } = await createJoinedSession(organizationB.client, personalA.client, templateId);
    const v1 = await organizationB.client.from('request_sessions').select('template_version_id,request_session_fields(field_key,required)').eq('id', session.requestSessionId).single();
    if (v1.error) throw new Error('Could not inspect the pinned request version.');
    await saveTemplate(organizationB.client, templateId, `${templateName} revised`, 'A later request revision.', [
      { key: 'full_name', required: true }, { key: 'phone', required: false },
    ], [{ prompt: 'New revision question', type: 'short_text', required: false, minLength: 0, maxLength: 80 }]);
    const pinned = await organizationB.client.from('request_sessions').select('template_version_id,request_session_fields(field_key,required)').eq('id', session.requestSessionId).single();
    if (pinned.error) throw new Error('Could not re-read the pinned request version.');
    const pinnedFields = pinned.data.request_session_fields.map((field) => field.field_key).sort();
    verify(pinned.data.template_version_id === v1.data.template_version_id && pinnedFields.join(',') === 'full_name,grade', 'active request keeps its original immutable template version after edits');
    verify(joined.questions.length === 7 && joined.questions.map((question) => question.type).sort().join(',') === 'date,long_text,multiple_choice,number,short_text,single_choice,yes_no', 'joined request preserves all seven versioned question types');

    const questionAnswers = Object.fromEntries(joined.questions.map((question) => {
      const values = {
        short_text: 'Ready', long_text: 'A complete hosted answer', single_choice: 'Remote',
        multiple_choice: ['Workshop'], yes_no: true, number: 5, date: '2026-09-30',
      };
      return [question.id, values[question.type]];
    }));
    const invalidSubmission = await personalA.client.rpc('respond_to_request', {
      p_session_id: session.requestSessionId, p_approved: true, p_approved_keys: ['full_name', 'grade'],
      p_answers: { ...questionAnswers, [joined.questions.find((question) => question.type === 'number').id]: 11 },
      p_missing_values: { grade: 'QA Grade 8' }, p_save_missing_keys: [],
    });
    verify(Boolean(invalidSubmission.error && invalidSubmission.error.code === '23514'), 'hosted RPC rejects an out-of-range number answer');

    const accepted = await rpc(personalA.client, 'respond_to_request', {
      p_session_id: session.requestSessionId, p_approved: true, p_approved_keys: ['full_name', 'grade'],
      p_answers: questionAnswers, p_missing_values: { grade: 'QA Grade 8' }, p_save_missing_keys: [],
    });
    verify(accepted.status === 'approved' && accepted.answerCount === 7 && accepted.shared.grade === 'QA Grade 8', 'hosted submission accepts all question types and request-only missing data');
    const { data: gradeAfterRequestOnly } = await personalA.client.from('personal_fields').select('value').eq('user_id', personalA.user.id).eq('field_key', 'grade').maybeSingle();
    verify(!gradeAfterRequestOnly, 'request-only missing information does not enter the Vault');
    await expectRpcError(personalA.client, 'respond_to_request', {
      p_session_id: session.requestSessionId, p_approved: true, p_approved_keys: ['full_name', 'grade'],
      p_answers: questionAnswers, p_missing_values: { grade: 'QA Grade 8' }, p_save_missing_keys: [],
    }, ['23505'], 'duplicate approval is safely rejected');

    await deniedRows(organizationA.client, 'request_responses', 'id', 'id', accepted.responseId, 'Organization A cannot read Organization B submissions');
    await deniedRows(personalB.client, 'request_responses', 'id,answers', 'id', accepted.responseId, 'unrelated Personal B cannot read Personal A answers');
    await deniedRows(personalB.client, 'shared_values', 'response_id,field_key', 'response_id', accepted.responseId, 'unrelated Personal B cannot read Personal A snapshots');
    const { data: ownResponse } = await personalA.client.from('request_responses').select('id,answers,answer_count').eq('id', accepted.responseId).maybeSingle();
    verify(ownResponse?.answer_count === 7 && Object.keys(ownResponse.answers).length === 7, 'question answers remain separate in the owner-scoped request receipt');
    const { data: snapshotBefore } = await personalA.client.from('shared_values').select('value_snapshot').eq('response_id', accepted.responseId).eq('field_key', 'full_name').maybeSingle();
    await setField(personalA.client, personalA.user.id, 'full_name', 'QA changed after approval');
    const { data: snapshotAfter } = await organizationB.client.from('shared_values').select('value_snapshot').eq('response_id', accepted.responseId).eq('field_key', 'full_name').maybeSingle();
    verify(snapshotBefore?.value_snapshot === nameA && snapshotAfter?.value_snapshot === nameA, 'approved receipt remains immutable after the Vault changes');
    await setField(personalA.client, personalA.user.id, 'full_name', nameA);

    const exported = await rpc(personalA.client, 'export_my_data', {});
    const exportedRequest = exported.organizationRequests?.find((entry) => entry.shared?.grade === 'QA Grade 8');
    verify(exported.vault?.full_name === nameA && !Object.hasOwn(exported.vault || {}, 'grade'), 'account export contains only Personal A Vault data and honors request-only privacy');
    verify(exportedRequest?.answers && Object.keys(exportedRequest.answers).length === 7 && exportedRequest.shared?.full_name === nameA, 'account export includes its receipt and separate question answers');
    verify(exported.sentPeerTransfers?.some((transfer) => transfer.card === 'QA Hosted Personal A' && transfer.recipient === profileNameB),
      'account export preserves the recipient name from the completed Tap Card receipt');

    const saveTemplateId = await saveTemplate(organizationB.client, null, `${templateName} Save Choice`, 'Explicit Vault save test.', [
      { key: 'full_name', required: true }, { key: 'grade', required: true },
    ], []);
    temporaryTemplates.push(saveTemplateId);
    const saveFlow = await createJoinedSession(organizationB.client, personalA.client, saveTemplateId);
    const savedMissing = await rpc(personalA.client, 'respond_to_request', {
      p_session_id: saveFlow.session.requestSessionId, p_approved: true, p_approved_keys: ['full_name', 'grade'],
      p_answers: {}, p_missing_values: { grade: 'QA Grade 9' }, p_save_missing_keys: ['grade'],
    });
    const { data: persistedGrade } = await personalA.client.from('personal_fields').select('value').eq('user_id', personalA.user.id).eq('field_key', 'grade').maybeSingle();
    verify(savedMissing.shared.grade === 'QA Grade 9' && persistedGrade?.value === 'QA Grade 9', 'explicit save-to-Vault choice persists only the newly entered required value');

    const persistentLink = await rpc(organizationB.client, 'create_request_link', { p_template_id: templateId, p_one_time: false, p_expires_at: null });
    temporaryRequestLinks.push(persistentLink.linkId);
    const resolvedOnce = await rpc(personalA.client, 'resolve_request_link', { p_token: persistentLink.token });
    const resolvedTwice = await rpc(personalB.client, 'resolve_request_link', { p_token: persistentLink.token });
    verify(resolvedOnce.requestSessionId !== resolvedTwice.requestSessionId, 'persistent organization QR creates independent participant sessions');
    const oneTimeLink = await rpc(organizationB.client, 'create_request_link', { p_template_id: templateId, p_one_time: true, p_expires_at: null });
    temporaryRequestLinks.push(oneTimeLink.linkId);
    await rpc(personalA.client, 'resolve_request_link', { p_token: oneTimeLink.token });
    await expectRpcError(personalB.client, 'resolve_request_link', { p_token: oneTimeLink.token }, ['23505'], 'one-time organization QR prevents a second active review');
    const revokedLink = await rpc(organizationB.client, 'create_request_link', { p_template_id: templateId, p_one_time: false, p_expires_at: null });
    temporaryRequestLinks.push(revokedLink.linkId);
    verify(await rpc(organizationB.client, 'revoke_request_link', { p_link_id: revokedLink.linkId }), 'organization owner can revoke its own request link');
    await expectRpcError(personalA.client, 'resolve_request_link', { p_token: revokedLink.token }, ['P0001'], 'revoked organization QR is rejected by the hosted RPC');
    await expectRpcError(personalA.client, 'resolve_request_link', { p_token: 'malformed' }, ['22023'], 'malformed organization request token is rejected by the hosted RPC');
    const expiredRequestLink = await rpc(organizationB.client, 'create_request_link', {
      p_template_id: templateId, p_one_time: false, p_expires_at: new Date(Date.now() + 2500).toISOString(),
    });
    temporaryRequestLinks.push(expiredRequestLink.linkId);
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await expectRpcError(personalA.client, 'resolve_request_link', { p_token: expiredRequestLink.token }, ['P0001'], 'expired organization request link is rejected by the hosted RPC');

    await verifyHostedRealtime(organizationB, personalA, orgBId, templateId);

    await setField(personalA.client, personalA.user.id, 'grade', 'QA Grade 9');
    for (const { identity, id } of temporaryCards) await rpc(identity.client, 'delete_tap_card', { p_card_id: id });
    temporaryCards.length = 0;
    const deletionPassword = randomBytes(36).toString('base64url');
    const deletionEmail = `qa.deletion.${Date.now()}@tapform.test`;
    const { data: newUser, error: createError } = await admin.auth.admin.createUser({
      email: deletionEmail,
      password: deletionPassword,
      email_confirm: true,
      user_metadata: { display_name: 'Disposable deletion test' },
    });
    if (createError || !newUser.user) throw new Error('Could not create the disposable account-deletion test identity.');
    deletionUserId = newUser.user.id;
    const deletionIdentity = await signIn('disposable deletion test', deletionEmail, deletionPassword);
    await rpc(deletionIdentity.client, 'delete_my_account', {});
    deletionCompleted = true;
    const { data: deletedUser, error: deletedUserError } = await admin.auth.admin.getUserById(deletionUserId);
    verify(Boolean(deletedUserError || !deletedUser.user), 'account deletion removes the disposable Supabase Auth identity');
    const { data: deletedProfile, error: profileError } = await admin.from('profiles').select('id').eq('id', deletionUserId);
    verify(!profileError && (deletedProfile || []).length === 0, 'account deletion removes the disposable profile and scoped data');
    const aliveUsers = await Promise.all([personalA.client.auth.getUser(), personalB.client.auth.getUser(), organizationA.client.auth.getUser(), organizationB.client.auth.getUser()]);
    verify(aliveUsers.every(({ data, error }) => !error && Boolean(data.user)), 'deleting one disposable account leaves the other QA identities intact');
  } finally {
    for (const { identity, id } of temporaryCards) {
      await identity.client.rpc('delete_tap_card', { p_card_id: id });
    }
    if (!deletionCompleted && deletionUserId) await admin.auth.admin.deleteUser(deletionUserId);

    if (disposableOrganizationId) {
      if (temporaryRequestLinks.length) {
        const { error } = await admin.from('organization_request_links').delete().in('id', temporaryRequestLinks);
        if (error) throw new Error('Could not remove disposable hosted organization request links.');
      }
      const { data: priorTemplates, error: templateLookupError } = await admin.from('request_templates')
        .select('id').eq('organization_id', disposableOrganizationId).like('name', 'QA Hosted Complete Flow %');
      if (templateLookupError) throw new Error('Could not locate disposable hosted acceptance templates for cleanup.');
      const templateIds = [...new Set([...temporaryTemplates, ...(priorTemplates || []).map((template) => template.id)])];

      if (originalOrganizationDefault !== undefined) {
        const { error: restoreDefaultError } = await organizationB.client.rpc('set_default_request_template', { p_template_id: originalOrganizationDefault });
        if (restoreDefaultError) throw new Error('Could not restore the QA organization default template.');
      }

      const { data: priorPeerLinks, error: peerLinkLookupError } = await admin.from('peer_share_links')
        .select('id').in('owner_user_id', [personalA.user.id, personalB.user.id])
        .in('card_name_snapshot', ['QA Hosted Personal A', 'QA Hosted Personal B']);
      if (peerLinkLookupError) throw new Error('Could not locate disposable hosted peer-share links for cleanup.');
      const peerLinkIds = [...new Set([...temporaryPeerLinks, ...(priorPeerLinks || []).map((link) => link.id)])];

      if (peerLinkIds.length) {
        const { error } = await admin.from('peer_share_links').delete().in('id', peerLinkIds);
        if (error) throw new Error('Could not remove disposable hosted peer-share data.');
      }
      if (templateIds.length) {
        const { error } = await admin.from('request_templates').delete().in('id', templateIds);
        if (error) throw new Error('Could not remove disposable hosted request data.');
      }
    }

    for (const [key, identity] of [['personalA', personalA], ['personalB', personalB]]) {
      if (Object.hasOwn(originalDisplayNames, key)) {
        const { error } = await identity.client.rpc('update_my_display_name', { p_display_name: originalDisplayNames[key] });
        if (error) throw new Error('Could not restore a QA sharing name.');
      }
      if (originalFields[key]) {
        await setField(identity.client, identity.user.id, 'full_name', originalFields[key].full_name ?? null);
        if (key === 'personalA') await setField(identity.client, identity.user.id, 'grade', originalFields.personalA.grade ?? null);
      }
      if (Object.hasOwn(originalDefaults, key)) {
        const { error } = await identity.client.rpc('set_default_tap_card', { p_card_id: originalDefaults[key] });
        if (error) throw new Error('Could not restore a QA personal default Tap Card.');
      }
    }
  }
}

run().then(() => {
  process.stdout.write(`HOSTED QA COMPLETE: ${checks.length} assertions passed.\n`);
}).catch((error) => {
  process.stderr.write(`HOSTED QA STOPPED after ${checks.length} passing assertions: ${error instanceof Error ? error.message : 'unknown failure'}\n`);
  process.exitCode = 1;
});
