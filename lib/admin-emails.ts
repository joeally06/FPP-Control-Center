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
