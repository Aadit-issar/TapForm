import { requireNativeModule } from 'expo-modules-core';
import type { EventSubscription } from 'expo-modules-core';
import { Platform } from 'react-native';
import type { JoinPayload } from '@/services/requestTransport';
import type { PendingNotificationSummary } from './notificationActions';

export type NfcCapabilities = {
  nativeModuleAvailable: boolean;
  adapterPresent: boolean | null;
  available: boolean;
  enabled: boolean;
  hceSupported: boolean;
  hceServiceRegistered: boolean;
};

export type PendingNfcRequest = { pendingId: string; payload: JoinPayload };
export type NfcEvent = { state: 'ready' | 'detecting' | 'delivered' | 'peer_share_found' | 'error'; reason?: string; token?: string; expiresAtEpochSeconds?: number };
export type NativePermissionStatus = { status: string; granted: boolean; canAskAgain: boolean };
type NativeNfcModule = {
  getCapabilities(): Omit<NfcCapabilities, 'nativeModuleAvailable' | 'available'>;
  startReader(payload: Omit<JoinPayload, 'version'> & { version: number; expiresAtEpochSeconds: number }): Promise<void>;
  startPeerReader(): Promise<void>;
  setPeerShareContext(token: string | null, expiresAtEpochSeconds: number | null): Promise<boolean>;
  stopReader(): Promise<void>;
  getPendingRequest(pendingId: string): Promise<PendingNfcRequest | null>;
  getLatestPendingRequest(): Promise<PendingNfcRequest | null>;
  clearPendingRequest(pendingId: string): Promise<boolean>;
  updatePendingNotification(pendingId: string, summary: PendingNotificationSummary): Promise<boolean>;
  getNotificationSelection(pendingId: string): Promise<{ selectedKeys: string[]; excludedRequiredKeys: string[] } | null>;
  markPendingNotification(pendingId: string, state: 'decline' | 'share' | 'review'): Promise<boolean>;
  finishPendingNotification(pendingId: string, state: 'approved' | 'declined' | 'expired' | 'unavailable' | 'processed', sharedCount: number): Promise<boolean>;
  failPendingNotification(pendingId: string, retryAction: 'review' | 'decline' | 'share_required' | 'share_selection' | 'retry_decline'): Promise<boolean>;
  showDevelopmentRequestNotification(): Promise<boolean>;
  getNotificationPermission(): Promise<NativePermissionStatus>;
  requestNotificationPermission(): Promise<NativePermissionStatus>;
  openNotificationSettings(): boolean;
  openSettings(): boolean;
  addListener(eventName: 'onNfcState', listener: (event: NfcEvent) => void): EventSubscription;
};

let native: NativeNfcModule | null = null;
if (Platform.OS === 'android') {
  try { native = requireNativeModule<NativeNfcModule>('NfcPeer'); } catch { native = null; }
}

const unavailable: NfcCapabilities = {
  nativeModuleAvailable: false,
  adapterPresent: null,
  available: false,
  enabled: false,
  hceSupported: false,
  hceServiceRegistered: false,
};

export function nfcCapabilities(role: 'personal' | 'organization' | 'unknown' = 'unknown'): NfcCapabilities {
  let capabilities = unavailable;
  if (native) {
    try {
      const actual = native.getCapabilities();
      capabilities = {
        ...actual,
        nativeModuleAvailable: true,
        // Organization Reader Mode needs NFC hardware. HCE is checked on the receiving device.
        available: actual.adapterPresent === true,
      };
    } catch {
      capabilities = { ...unavailable, nativeModuleAvailable: true };
    }
  }
  if (__DEV__) console.info('[TapForm NFC]', {
    nativeModuleResolved: capabilities.nativeModuleAvailable,
    nfcAdapterPresent: capabilities.adapterPresent,
    nfcEnabled: capabilities.enabled,
    hceSupported: capabilities.hceSupported,
    hceServiceRegistered: capabilities.hceServiceRegistered,
    role,
  });
  return capabilities;
}

export const nfcSupported = Boolean(native);

function requireNfcModule(): NativeNfcModule {
  if (!native) throw new Error('NFC_NATIVE_MODULE_UNAVAILABLE');
  return native;
}

export async function startReader(payload: JoinPayload) {
  const expiry = Math.floor(Date.parse(payload.expiresAt) / 1000);
  if (!Number.isFinite(expiry)) throw new Error('NFC_SESSION_EXPIRY_INVALID');
  return requireNfcModule().startReader({ ...payload, version: 2, expiresAtEpochSeconds: expiry });
}
export async function startPeerReader() { return requireNfcModule().startPeerReader(); }
export async function setPeerShareContext(token: string | null, expiresAt: string | null) {
  const expiry = expiresAt === null ? null : Math.floor(Date.parse(expiresAt) / 1000);
  if (expiry !== null && !Number.isFinite(expiry)) throw new Error('NFC_SESSION_EXPIRY_INVALID');
  return native?.setPeerShareContext(token, expiry) ?? false;
}
export async function stopReader() { return native?.stopReader(); }
export async function getPendingRequest(pendingId: string) { return native?.getPendingRequest(pendingId) ?? null; }
export async function getLatestPendingRequest() { return native?.getLatestPendingRequest() ?? null; }
export async function clearPendingRequest(pendingId: string) { return native?.clearPendingRequest(pendingId) ?? false; }
export async function updatePendingNotification(pendingId: string, summary: PendingNotificationSummary) { return native?.updatePendingNotification(pendingId, summary) ?? false; }
export async function getNotificationSelection(pendingId: string) { return native?.getNotificationSelection(pendingId) ?? null; }
export async function markPendingNotification(pendingId: string, state: 'decline' | 'share' | 'review') { return native?.markPendingNotification(pendingId, state) ?? false; }
export async function finishPendingNotification(pendingId: string, state: 'approved' | 'declined' | 'expired' | 'unavailable' | 'processed', sharedCount = 0) { return native?.finishPendingNotification(pendingId, state, sharedCount) ?? false; }
export async function failPendingNotification(pendingId: string, retryAction: 'review' | 'decline' | 'share_required' | 'share_selection' | 'retry_decline' = 'review') { return native?.failPendingNotification(pendingId, retryAction) ?? false; }
export async function showDevelopmentRequestNotification() {
  if (!__DEV__) return false;
  return native?.showDevelopmentRequestNotification() ?? false;
}
export async function getNotificationPermission() { return native?.getNotificationPermission() ?? { status: 'unavailable', granted: false, canAskAgain: false }; }
export async function requestNotificationPermission() { return native?.requestNotificationPermission() ?? { status: 'unavailable', granted: false, canAskAgain: false }; }
export function openNotificationSettings() { return native?.openNotificationSettings() ?? false; }
export function openNfcSettings() { return requireNfcModule().openSettings(); }
export function onNfcState(listener: (event: NfcEvent) => void) {
  const sub = native?.addListener('onNfcState', listener);
  return () => sub?.remove();
}
