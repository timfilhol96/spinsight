import type { ClassValue } from 'clsx'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const collator = new Intl.Collator(undefined, { numeric: true })
const shelfKey = (s: string) =>
  s.replace(/^[^\p{L}\p{N}]+/u, '').replace(/^the\b[^\p{L}\p{N}]*/iu, '')

/**
 * Shelf order, like in a record shop: "The Beatles" and "(The) Melvins" sort
 * under B and M, "...And The Machines" under A.
 */
export const shelfOrder = (a: string, b: string) =>
  collator.compare(shelfKey(a), shelfKey(b))
