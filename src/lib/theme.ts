import { useEffect, useState } from 'react'
import { recordTheme } from '#/lib/vinyl-color'
import type { VinylLook } from '#/lib/vinyl-color'

// ---------- record-driven accent ----------

/**
 * While mounted with a coloured record, retints the app (accent, page glow)
 * to that pressing. Black vinyl leaves the current palette alone; unmount
 * restores it. The
 * @property registrations in styles.css make the change fade rather than snap.
 */
export function useRecordTheme(look: VinylLook | null | undefined) {
  const key = look ? `${look.pattern}:${look.colors.join(',')}` : ''
  useEffect(() => {
    const root = document.documentElement
    const theme = recordTheme(look)
    if (!theme) return
    const vars = {
      '--record-1': theme.primary,
      '--record-2': theme.secondary,
      '--record-ink': theme.ink,
    }
    // Restore whatever was there before (not just remove), so a record opened
    // on a page that is itself tinted hands the page its colour back on close.
    const previous = Object.keys(vars).map(
      (k) => [k, root.style.getPropertyValue(k)] as const,
    )
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v)
    return () => {
      for (const [k, v] of previous) {
        if (v) root.style.setProperty(k, v)
        else root.style.removeProperty(k)
      }
    }
    // `key` captures everything about `look` that affects the theme.
  }, [key])
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
