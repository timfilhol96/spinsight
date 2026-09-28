import { useId, useMemo } from 'react'
import { cn } from '#/lib/utils'
import { mixHex } from '#/lib/vinyl-color'
import type { VinylLook } from '#/lib/vinyl-color'

type Props = {
  look: VinylLook | null | undefined
  /** Cover art, used for the centre label (and the whole disc for picture discs). */
  labelImage?: string | null
  /** Stable seed so splatter dots don't move between renders. */
  seed?: number
  spinning?: boolean
  className?: string
}

const BLACK = '#141414'

// Small deterministic PRNG (mulberry32).
function rng(seed: number) {
  let a = seed >>> 0 || 1
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function VinylDisc({
  look,
  labelImage,
  seed = 1,
  spinning,
  className,
}: Props) {
  // React's ids contain characters (":" or "«»") that break url(#...) refs.
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const pattern = look?.pattern ?? 'black'
  const [c1 = BLACK, c2 = BLACK, c3] = look?.colors ?? []
  const translucent = !!look?.translucent

  const dots = useMemo(() => {
    if (pattern !== 'splatter' && pattern !== 'galaxy') return []
    const r = rng(seed)
    const palette = look?.colors.slice(1).length
      ? look.colors.slice(1)
      : ['#f3f0ea']
    return Array.from({ length: pattern === 'galaxy' ? 70 : 46 }, () => {
      const angle = r() * Math.PI * 2
      const dist = 24 + r() * 72
      return {
        cx: 100 + Math.cos(angle) * dist,
        cy: 100 + Math.sin(angle) * dist,
        r: pattern === 'galaxy' ? 0.4 + r() * 1.2 : 0.8 + r() * r() * 5,
        fill: palette[Math.floor(r() * palette.length)],
        o: 0.75 + r() * 0.25,
      }
    })
  }, [pattern, seed, look?.colors])

  const baseOpacity = translucent ? 0.78 : 1

  return (
    <div className={cn('relative aspect-square select-none', className)}>
      <svg
        viewBox="0 0 200 200"
        className={cn(
          'size-full drop-shadow-xl',
          spinning && 'animate-spin-record',
        )}
        role="img"
        aria-label={look?.label ? `${look.label} vinyl` : 'Black vinyl'}
      >
        <defs>
          <clipPath id={`disc-${uid}`}>
            <circle cx="100" cy="100" r="99" />
          </clipPath>
          <clipPath id={`label-${uid}`}>
            <circle cx="100" cy="100" r="33" />
          </clipPath>
          {/* Marble / smoke: fractal noise thresholded into a mask for colour 2. */}
          <filter id={`marble-${uid}`} x="0" y="0" width="100%" height="100%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency={pattern === 'smoke' ? '0.008' : '0.013'}
              numOctaves={pattern === 'smoke' ? 2 : 4}
              seed={seed % 997}
            />
            <feColorMatrix
              type="matrix"
              values={
                pattern === 'smoke'
                  ? '0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  2.2 0 0 0 -0.9'
                  : '0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  5 0 0 0 -2.3'
              }
            />
          </filter>
          <mask id={`mask-${uid}`}>
            <rect
              width="200"
              height="200"
              fill="white"
              filter={`url(#marble-${uid})`}
            />
          </mask>
          {/* Grooves: fine concentric rings. */}
          <radialGradient
            id={`grooves-${uid}`}
            cx="100"
            cy="100"
            r="99"
            gradientUnits="userSpaceOnUse"
          >
            {Array.from({ length: 34 }, (_, i) => {
              const o = 0.34 + (i / 34) * 0.66
              return [
                <stop
                  key={`a${i}`}
                  offset={o}
                  stopColor="#000"
                  stopOpacity={i % 2 ? 0.1 : 0}
                />,
                <stop
                  key={`b${i}`}
                  offset={o + 0.008}
                  stopColor="#000"
                  stopOpacity={0}
                />,
              ]
            })}
          </radialGradient>
          {/* Two opposing light sheens, like a lamp over the turntable. */}
          <linearGradient id={`sheen-${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0.25" stopColor="#fff" stopOpacity="0" />
            <stop offset="0.42" stopColor="#fff" stopOpacity="0.22" />
            <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
            <stop offset="0.75" stopColor="#fff" stopOpacity="0" />
            <stop offset="0.85" stopColor="#fff" stopOpacity="0.12" />
            <stop offset="0.95" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <radialGradient id={`blob-${uid}`} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0.55" stopColor={c1} />
            <stop offset="1" stopColor={c1} stopOpacity="0" />
          </radialGradient>
        </defs>

        <g clipPath={`url(#disc-${uid})`}>
          {pattern === 'picture' && labelImage ? (
            <image
              href={labelImage}
              x="0"
              y="0"
              width="200"
              height="200"
              preserveAspectRatio="xMidYMid slice"
            />
          ) : pattern === 'split' ? (
            <>
              <rect width="200" height="200" fill={c1} opacity={baseOpacity} />
              <path
                d="M200 0 L200 200 L0 200 Z"
                fill={c2}
                opacity={baseOpacity}
              />
            </>
          ) : pattern === 'color-in-color' ? (
            <>
              <rect
                width="200"
                height="200"
                fill={c2}
                opacity={translucent ? 0.7 : 1}
              />
              <circle cx="100" cy="100" r="62" fill={`url(#blob-${uid})`} />
            </>
          ) : (
            <rect
              width="200"
              height="200"
              fill={pattern === 'black' ? BLACK : c1}
              opacity={baseOpacity}
            />
          )}

          {(pattern === 'marbled' ||
            pattern === 'swirl' ||
            pattern === 'smoke') && (
            <rect
              width="200"
              height="200"
              fill={c2}
              mask={`url(#mask-${uid})`}
              opacity={0.95}
            />
          )}
          {pattern === 'swirl' && c3 && (
            <rect
              width="200"
              height="200"
              fill={c3}
              mask={`url(#mask-${uid})`}
              transform="rotate(120 100 100)"
              opacity={0.8}
            />
          )}
          {pattern === 'galaxy' && (
            <rect
              width="200"
              height="200"
              fill={mixHex(c1, c2, 0.5)}
              mask={`url(#mask-${uid})`}
              opacity={0.7}
            />
          )}
          {pattern === 'glow' && (
            <rect width="200" height="200" fill="#eaffd9" opacity={0.25} />
          )}

          {dots.map((d, i) => (
            <circle
              key={i}
              cx={d.cx}
              cy={d.cy}
              r={d.r}
              fill={d.fill}
              opacity={d.o}
            />
          ))}

          <rect width="200" height="200" fill={`url(#grooves-${uid})`} />
          <rect width="200" height="200" fill={`url(#sheen-${uid})`} />
          {/* Lead-in and run-out rims. */}
          <circle
            cx="100"
            cy="100"
            r="97.5"
            fill="none"
            stroke="#000"
            strokeOpacity="0.25"
            strokeWidth="2"
          />
          <circle
            cx="100"
            cy="100"
            r="37"
            fill="none"
            stroke="#000"
            strokeOpacity="0.18"
            strokeWidth="1"
          />
        </g>

        {pattern !== 'picture' && (
          <g>
            <circle cx="100" cy="100" r="33" fill="#e9dcc6" />
            {labelImage && (
              <image
                href={labelImage}
                x="67"
                y="67"
                width="66"
                height="66"
                clipPath={`url(#label-${uid})`}
                preserveAspectRatio="xMidYMid slice"
              />
            )}
            <circle
              cx="100"
              cy="100"
              r="33"
              fill="none"
              stroke="#000"
              strokeOpacity="0.2"
            />
          </g>
        )}
        {/* Spindle hole. */}
        <circle cx="100" cy="100" r="3.2" className="fill-background" />
      </svg>
    </div>
  )
}
