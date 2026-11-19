// Whether special editions are played and timed as their original album
// alone, without the bonus tracks. One choice for the picker and the record
// details, kept in this browser: someone who skips bonus tracks usually
// always does.
import { useSyncExternalStore } from 'react'
import type { Extras } from '#/lib/moods'

const KEY = 'spinsight:picker-extras'
const listeners = new Set<() => void>()

function read(): Extras {
  try {
    return localStorage.getItem(KEY) === 'skip' ? 'skip' : undefined
  } catch {
    return undefined
  }
}

// Storage blocked: the choice lasts until the page is left.
let fallback: Extras

function write(extras: Extras) {
  fallback = extras
  try {
    if (extras) localStorage.setItem(KEY, extras)
    else localStorage.removeItem(KEY)
  } catch {
    // Kept in `fallback` instead.
  }
  for (const l of listeners) l()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const snapshot = () => read() ?? fallback

/** The remembered choice, and a setter that every user of it follows. */
export function useExtras(): [Extras, (extras: Extras) => void] {
  // No storage while rendering on the server: the whole record until hydrated.
  const extras = useSyncExternalStore(subscribe, snapshot, () => undefined)
  return [extras, write]
}
