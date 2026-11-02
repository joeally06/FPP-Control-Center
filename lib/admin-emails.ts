/**
 * The one place that decides who is an admin: the ADMIN_EMAILS environment variable
 * (comma-separated). Read on every call so a changed list applies to the next request, never
 * from a role stored in the session cookie.
 */
export function parseAdminEmails(raw: string | undefined = process.env.ADMIN_EMAILS): string[] {
  return (raw || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0);
}

/** True when the address is in ADMIN_EMAILS (ignoring case and spaces). No list means no admins. */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return parseAdminEmails().includes(email.trim().toLowerCase());
}

/** Where a signed-in account that is not an admin is sent: the visitor page, with a note about why. */
export const NOT_ADMIN_REDIRECT = '/jukebox?signin=denied';

/**
 * What the sign-in callback returns. `true` lets an admin in. For anyone else it is a path, which next-auth
 * redirects to without creating a session (returning `false` would show next-auth's plain error page instead).
 */
export function adminSignInResult(email: string | null | undefined): true | string {
  return isAdminEmail(email) ? true : NOT_ADMIN_REDIRECT;
}
