const TOKEN_PATTERN = /^[0-9a-f]{64}$/i;

export function canRetryPeerShare(token: string, message: string): boolean {
  if (!TOKEN_PATTERN.test(token)) return false;
  return message === 'This one-time Tap Card is already being reviewed.'
    || message === 'This Tap Card could not be opened. Check your connection and try again.';
}

export function canRetryRequestLink(token: string, message: string): boolean {
  if (!TOKEN_PATTERN.test(token)) return false;
  return message === 'This one-time request is already being reviewed. Try again if its current session expires.'
    || message === 'This request could not be opened. Check your connection and try again.';
}
