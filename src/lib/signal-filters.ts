/**
 * Returns true if the text looks like a non-risk system notification (e.g. delivery
 * status, bounce, mailer-daemon) that should not be treated as operational/compliance/security risk.
 */
export function isNonRiskNotification(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  const t = text.trim().toLowerCase();
  if (!t) return false;
  // Delivery Status Notification (Failure), NDR, bounce reports, mailer-daemon
  if (/delivery\s+status\s+notification\s*\(?\s*failure\s*\)?/i.test(t)) return true;
  if (/delivery\s+status\s+notification/i.test(t) && /(failure|failed|undeliverable)/i.test(t)) return true;
  if (/\bndr\b|non[- ]?delivery|undeliverable\s+message/i.test(t)) return true;
  if (/mailer[- ]?daemon|postmaster@/i.test(t)) return true;
  if (/returned\s+mail|delivery\s+has\s+failed|message\s+not\s+delivered/i.test(t)) return true;
  if (/bounce|bounced\s+email/i.test(t) && t.length < 300) return true;
  return false;
}
