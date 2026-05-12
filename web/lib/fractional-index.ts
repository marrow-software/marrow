import { generateKeyBetween } from "fractional-indexing";

/** Position lex-between `a` and `b`. Either may be null for open-ended. */
export function between(a: string | null, b: string | null): string {
  return generateKeyBetween(a, b);
}

/** Position lex-greater than `a`, or the initial position if `a` is null. */
export function after(a: string | null): string {
  return generateKeyBetween(a, null);
}

/** Position lex-less than `b`, or the initial position if `b` is null. */
export function before(b: string | null): string {
  return generateKeyBetween(null, b);
}
