/** Admin access: e-mails listed in ADMIN_EMAILS (comma-separated). */
export const DEFAULT_ADMIN_EMAILS = 'contact@studio-juno.fr,johan.amselem@gmail.com'

export function adminEmails(raw: string | undefined = process.env.ADMIN_EMAILS): string[] {
  return (raw?.trim() ? raw : DEFAULT_ADMIN_EMAILS)
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

export function isAdminEmail(email: string | null | undefined, raw?: string): boolean {
  if (!email) return false
  return adminEmails(raw).includes(email.trim().toLowerCase())
}

/** « ••••1234 »: the token is never displayed back. */
export function maskToken(token: string): string {
  return `••••${token.slice(-4)}`
}
