import he from "he";

/** Remove HTML tags and decode entities. */
export function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  const noTags = html.replace(/<[^>]*>/g, " ");
  return he.decode(noTags).replace(/\s+/g, " ").trim();
}

/** Convert price like 15.99 to micros: 15.99 * 1_000_000 = 15_990_000 */
export function toMicros(amount: string | number): string {
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  return Math.round(n * 1_000_000).toString();
}

/** Pick the best image: variant image > first product image. */
export function pickImage(variantImage?: string | null, productImage?: string | null): string | undefined {
  return variantImage || productImage || undefined;
}

/** Digits-only check + GTIN length + Luhn mod-10 validation (for 8/12/13/14). */
export function isValidGtin(value?: string | null): boolean {
  if (!value) return false;
  const digits = value.replace(/\D/g, "");
  if (![8, 12, 13, 14].includes(digits.length)) return false;

  // Luhn mod-10
  let sum = 0;
  const reversed = digits.split("").reverse().map((d) => parseInt(d, 10));
  for (let i = 0; i < reversed.length; i++) {
    let d = reversed[i];
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}
