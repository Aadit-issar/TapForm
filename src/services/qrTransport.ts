import { JoinPayload, parseJoinPayload, RequestTransport } from './requestTransport';
import { savePendingReview } from './pendingReview';
import { parseTapFormLink } from './tapLinks';

export class QrTransport implements RequestTransport {
  private activePayload: JoinPayload | null = null;

  constructor(private readonly scannedText?: string) {}

  async beginSession(templateId: string): Promise<JoinPayload> {
    const { createSession } = await import('./requests');
    this.activePayload = (await createSession(templateId)).payload;
    return this.activePayload;
  }

  async advertiseSession(payload: JoinPayload): Promise<void> { this.activePayload = payload; }
  get qrValue(): string | null { return this.activePayload ? JSON.stringify(this.activePayload) : null; }

  async discoverSession(input?: string): Promise<JoinPayload> {
    const scannedText = input ?? this.scannedText;
    if (!scannedText) throw new Error('Scan the organization’s request QR code first.');
    const link = parseTapFormLink(scannedText);
    if (link?.kind === 'request') {
      const { resolveRequestLink } = await import('./requests');
      return resolveRequestLink(link.token);
    }
    if (link?.kind === 'share') throw new Error('This is a personal Tap Card. Open it in the TapForm share flow.');
    let payload: unknown;
    try { payload = JSON.parse(scannedText); } catch { throw new Error('This QR code does not contain a TapForm request.'); }
    return parseJoinPayload(payload);
  }

  async joinSession(payload: JoinPayload) {
    const { joinSession } = await import('./requests');
    const request = await joinSession(payload);
    await savePendingReview(request);
    return request;
  }

  async cancelSession(): Promise<void> { this.activePayload = null; }
  static encode(payload: JoinPayload): string { return JSON.stringify(payload); }
}
