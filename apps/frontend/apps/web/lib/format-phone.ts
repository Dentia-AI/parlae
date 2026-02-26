/**
 * Format a phone number for display while keeping the original value unchanged.
 *
 * Handles North American numbers (+1XXXXXXXXXX) → +1 (XXX) XXX-XXXX
 * and falls back to grouping digits for other formats.
 */
export function formatPhoneDisplay(phone: string | null | undefined): string {
  if (!phone) return '';

  const digits = phone.replace(/\D/g, '');

  // North American: 1 + 10 digits
  if (digits.length === 11 && digits.startsWith('1')) {
    const area = digits.slice(1, 4);
    const prefix = digits.slice(4, 7);
    const line = digits.slice(7);
    return `+1 (${area}) ${prefix}-${line}`;
  }

  // 10-digit without country code (assume +1)
  if (digits.length === 10) {
    const area = digits.slice(0, 3);
    const prefix = digits.slice(3, 6);
    const line = digits.slice(6);
    return `(${area}) ${prefix}-${line}`;
  }

  // Other international: keep + prefix and group remaining digits
  if (phone.startsWith('+') && digits.length > 6) {
    const cc = digits.slice(0, digits.length - 10) || digits.slice(0, 2);
    const rest = digits.slice(cc.length);
    if (rest.length === 10) {
      return `+${cc} (${rest.slice(0, 3)}) ${rest.slice(3, 6)}-${rest.slice(6)}`;
    }
  }

  return phone;
}
