/**
 * Email addresses and phone numbers, the way people type them.
 *
 * Adding someone to a trusted circle looks them up by the email or phone they
 * gave the bank. Both sides are normalized first, so "Grace.Chen@Example.com"
 * matches "grace.chen@example.com" and "+1 (607) 555-0102" matches "6075550102".
 */
export type Contact = { kind: 'email'; value: string } | { kind: 'phone'; value: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_CHARS = /^\+?[\d\s().-]+$/;
/** A US (North American) number: area code and exchange can't start with 0 or 1. */
const US_PHONE = /^[2-9]\d{2}[2-9]\d{6}$/;

/** The email, lowercased, or undefined if it doesn't look like one. */
export function normalizeEmail(raw: string): string | undefined {
  const v = raw.trim().toLowerCase();
  return EMAIL.test(v) ? v : undefined;
}

/**
 * A US phone number as its 10 digits, or undefined. Spaces, brackets, dots,
 * dashes and a leading +1 or 1 are ignored. FamilyShield is offered by US banks,
 * so other countries' numbers aren't accepted yet.
 */
export function normalizePhone(raw: string): string | undefined {
  const v = raw.trim();
  if (!PHONE_CHARS.test(v)) return undefined;
  let digits = v.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  return US_PHONE.test(digits) ? digits : undefined;
}

/** Read what someone typed in "Email or phone". */
export function parseContact(raw: string): Contact | undefined {
  if (raw.includes('@')) {
    const email = normalizeEmail(raw);
    return email ? { kind: 'email', value: email } : undefined;
  }
  const phone = normalizePhone(raw);
  return phone ? { kind: 'phone', value: phone } : undefined;
}

/** A 10-digit US phone number for display: (607) 555-0102. */
export function formatPhone(digits: string): string {
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}
