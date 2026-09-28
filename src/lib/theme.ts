import { useEffect, useState } from 'react'
import { recordTheme } from '#/lib/vinyl-color'
import type { VinylLook } from '#/lib/vinyl-color'

// ---------- record-driven accent ----------

/**
 * How strongly a tint claims the app. Several can be active at once (a page
 * tint, the record now playing, an open record panel); the highest priority
 * wins, and among equals the most recent.
 */
export const THEME_PRIORITY = {
  /** Ambient page colour: Year in Vinyl, the landing page demo. */
  page: 1,
  /** The record currently spinning. */
  playing: 2,
  /** A record you're looking at right now: record panel, picker result. */
  focus: 3,
} as const

type ThemeClaim = { look: VinylLook; priority: number; order: number }
const claims = new Map<number, ThemeClaim>()
let nextId = 1
let nextOrder = 1

function applyTopClaim() {
  const root = document.documentElement
  let top: ThemeClaim | null = null
  for (const c of claims.values()) {
    if (
      !top ||
      c.priority > top.priority ||
      (c.priority === top.priority && c.order > top.order)
    )
      top = c
  }
  const theme = top ? recordTheme(top.look) : null
  if (!theme) {
    root.style.removeProperty('--record-1')
    root.style.removeProperty('--record-2')
    root.style.removeProperty('--record-ink')
    return
  }
  root.style.setProperty('--record-1', theme.primary)
  root.style.setProperty('--record-2', theme.secondary)
  root.style.setProperty('--record-ink', theme.ink)
}

/**
 * While mounted with a coloured record, retints the app (accent, page glow)
 * to that pressing. Black vinyl makes no claim. The @property registrations
 * in styles.css make changes fade rather than snap.
 */
export function useRecordTheme(
  look: VinylLook | null | undefined,
  priority: number = THEME_PRIORITY.page,
) {
  const key = look ? `${look.pattern}:${look.colors.join(',')}` : ''
  useEffect(() => {
    if (!look || !recordTheme(look)) return
    const id = nextId++
    claims.set(id, { look, priority, order: nextOrder++ })
    applyTopClaim()
    return () => {
      claims.delete(id)
      applyTopClaim()
    }
    // `key` captures everything about `look` that affects the theme.
  }, [key, priority])
}

// ---------- light / dark ----------

export type ColorScheme = 'light' | 'dark' | 'system'
const STORAGE_KEY = 'spinsight-color-scheme'

/** Inlined in <head> so the right scheme is applied before first paint. */
export const colorSchemeScript = `(function(){try{var s=localStorage.getItem('${STORAGE_KEY}')||'system';var d=s==='dark'||(s==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d)}catch(e){}})()`

function readStored(): ColorScheme {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

function apply(scheme: ColorScheme) {
  const dark =
    scheme === 'dark' ||
    (scheme === 'system' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
  // Browser/OS chrome (address bar, installed-app title bar) follows along.
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', dark ? '#17110d' : '#f3ebdd')
  return dark
}

export function useColorScheme() {
  const [scheme, setScheme] = useState<ColorScheme>('system')
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    const s = readStored()
    setScheme(s)
    setIsDark(apply(s))
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      if (readStored() === 'system') setIsDark(apply('system'))
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  function update(next: ColorScheme) {
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Private mode: the choice just won't persist.
    }
    setScheme(next)
    setIsDark(apply(next))
  }

  return { scheme, isDark, setScheme: update }
}
