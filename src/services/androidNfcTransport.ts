import { clearPendingRequest, getLatestPendingRequest, getPendingRequest, startReader, stopReader } from './nfcPeer';
import { createSession, joinSession } from './requests';
import { JoinPayload, parseJoinPayload, RequestTransport } from './requestTransport';
import { savePendingReview } from './pendingReview';

/** Organization Reader / personal HCE adapter. Both sides join through the same backend RPC. */
export class AndroidNfcTransport implements RequestTransport {
  async beginSession(templateId: string): Promise<JoinPayload> {
    return (await createSession(templateId)).payload;
  }

  async advertiseSession(payload: JoinPayload): Promise<void> {
    await startReader(payload);
  }

  async discoverSession(pendingId?: string): Promise<JoinPayload> {
    const pending = pendingId ? await getPendingRequest(pendingId) : await getLatestPendingRequest();
    if (!pending) throw new Error('This TapForm request is no longer available. Ask the organization to start a new one.');
    return parseJoinPayload(pending.payload);
  }

  async joinSession(payload: JoinPayload, pendingId?: string) {
    const request = await joinSession({ ...payload, version: 1 });
    await savePendingReview(request, pendingId);
    return request;
  }
  async clearPending(pendingId: string) { return clearPendingRequest(pendingId); }
  async cancelSession() { await stopReader(); }
}
