type AuthFailure = {
  code?: unknown;
  message?: unknown;
  name?: unknown;
};

function readFailure(value: unknown): { code: string; message: string; name: string } {
  if (!value || typeof value !== 'object') return { code: '', message: '', name: '' };
  const failure = value as AuthFailure;
  return {
    code: typeof failure.code === 'string' ? failure.code.toLowerCase() : '',
    message: typeof failure.message === 'string' ? failure.message.toLowerCase() : '',
    name: typeof failure.name === 'string' ? failure.name.toLowerCase() : '',
  };
}

/** Maps known auth failures to useful copy without exposing backend details. */
export function accountCreationErrorMessage(value: unknown): string {
  const { code, message, name } = readFailure(value);
  const detail = `${code} ${message} ${name}`;

  if (/signup_disabled|signups? (are )?disabled|email_provider_disabled/.test(detail)) {
    return 'New account creation is temporarily unavailable. Please try again later.';
  }
  if (/over_email_send_rate_limit|over_request_rate_limit|too_many_requests|rate.?limit/.test(detail)) {
    return 'Too many sign-up attempts were made. Wait a little and try again.';
  }
  if (/user_already_exists|email_exists|already registered|already exists/.test(detail)) {
    return 'An account already uses this email. Sign in or reset your password instead.';
  }
  if (/email_address_invalid|invalid email|email address is invalid/.test(detail)) {
    return 'Enter a valid email address and try again.';
  }
  if (/weak_password|password_too_short|password.*(weak|short|characters)/.test(detail)) {
    return 'Choose a stronger password and try again.';
  }
  if (/authretryablefetcherror|failed to fetch|network|timed? ?out|connection/.test(detail)) {
    return 'TapForm could not reach the account service. Check your connection and try again.';
  }
  if (/database error saving new user|error saving new user/.test(detail)) {
    return 'TapForm could not finish setting up your account right now. Please try again later.';
  }
  return 'This account could not be created. Check the email and password, then try again.';
}
