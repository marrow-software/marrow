/**
 * Fractional index helpers for sibling node ordering.
 *
 * Thin wrappers around the fractional-indexing npm package so drag handlers
 * and tree mutations import from one place instead of calling the raw package.
 */

import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";

export { generateKeyBetween, generateNKeysBetween };

/** Return a key after `prev` (i.e. append to end of a sibling list). */
export function keyAfter(prev: string | null): string {
  return generateKeyBetween(prev, null);
}

/** Return a key before `next` (i.e. prepend to front of a sibling list). */
export function keyBefore(next: string | null): string {
  return generateKeyBetween(null, next);
}

/**
 * Return a key between `prev` and `next` (i.e. insert between two siblings).
 * Pass null for either bound when there is no lower/upper neighbour.
 */
export function keyBetween(prev: string | null, next: string | null): string {
  return generateKeyBetween(prev, next);
}
