import { useId, useMemo } from 'react'
import { cn } from '#/lib/utils'
import { mixHex } from '#/lib/vinyl-color'
import type { VinylLook } from '#/lib/vinyl-color'

type Props = {
  look: VinylLook | null | undefined
  /** Cover art, used for the centre label (and the whole disc for picture discs). */
  labelImage?: string | null
  /** Stable seed so random details (splatter, marble veins) don't move between renders. */
  seed?: number
  spinning?: boolean
  className?: string
}

const BLACK = '#141414'
const C = 100 // centre of the 200×200 viewBox
const R = 99 // disc radius

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

/** SVG path for a pie slice of the disc. */
function sector(from: number, to: number): string {
  const p = (a: number) => `${C + R * Math.cos(a)} ${C + R * Math.sin(a)}`
  const large = to - from > Math.PI ? 1 : 0
  return `M${C} ${C} L${p(from)} A${R} ${R} 0 ${large} 1 ${p(to)} Z`
}

type NoiseOpts = {
  type?: 'fractalNoise' | 'turbulence'
  freq: string
  octaves: number
  seed: number
  /** Alpha row of the colour matrix: how hard the noise is thresholded. */
  matrix: string
  /** Bend the noise with a second, slow noise field: flowing marble veins. */
  warp?: number
}

/**
 * A vinyl record drawn from its Discogs colour variant: solid, translucent,
 * marbled, swirl/smash, smoke, galaxy, splatter, split, pinwheel, stripes,
 * colour-in-colour, picture disc, or a real photo cropped by the owner.
 */
export function VinylDisc({
  look,
  labelImage,
  seed = 1,
  spinning,
  className,
}: Props) {
  // React's ids contain characters (":" or "«»") that break url(#...) refs.
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const id = (name: string) => `${name}-${uid}`
  const url = (name: string) => `url(#${id(name)})`

  const pattern = look?.pattern ?? 'black'
  const colors = useMemo(() => look?.colors ?? [], [look?.colors])
  const [c1 = BLACK, c2 = BLACK, c3] = colors
  const translucent = !!look?.translucent
  const detail = look?.detail ?? {}
  const photo = look?.photo
  const s = seed % 997

  const dots = useMemo(() => {
    if (pattern !== 'splatter' && pattern !== 'galaxy') return []
    const r = rng(seed)
    const palette =
      pattern === 'galaxy'
        ? ['#ffffff', '#f3f0ea', ...colors.slice(2)]
        : colors.slice(1).length
          ? colors.slice(1)
          : ['#f3f0ea']
    const spec = {
      galaxy: { n: 90, min: 0.3, max: 1.3 },
      fine: { n: 160, min: 0.35, max: 1.4 },
      normal: { n: 55, min: 0.8, max: 5 },
      heavy: { n: 95, min: 1.2, max: 7.5 },
    }[pattern === 'galaxy' ? 'galaxy' : (detail.density ?? 'normal')]
    return Array.from({ length: spec.n }, () => {
      const angle = r() * Math.PI * 2
      // Keep splatter off the label, biased outward like real pressings.
      const dist = 36 + Math.sqrt(r()) * 60
      const size = spec.min + r() * r() * (spec.max - spec.min)
      return {
        cx: C + Math.cos(angle) * dist,
        cy: C + Math.sin(angle) * dist,
        ry: size,
        // Splats are squashed and irregular, not perfect circles.
        rx: size * (0.8 + r() * 0.6),
        rot: r() * 180,
        fill: palette[Math.floor(r() * palette.length)],
        o: pattern === 'galaxy' ? 0.5 + r() * 0.5 : 0.85 + r() * 0.15,
      }
    })
  }, [pattern, seed, colors, detail.density])

  const baseOpacity = translucent ? 0.72 : 1

  /** A layer of `color` shown through the noise mask `mask`. */
  const masked = (color: string, mask: string, opacity = 1) => (
    <rect
      width="200"
      height="200"
      fill={color}
      mask={url(`${mask}-mask`)}
      opacity={opacity}
    />
  )

  const noiseMask = (name: string, o: NoiseOpts) => (
    <>
      <filter id={id(name)} x="0" y="0" width="100%" height="100%">
        <feTurbulence
          type={o.type ?? 'fractalNoise'}
          baseFrequency={o.freq}
          numOctaves={o.octaves}
          seed={o.seed}
          result="noise"
        />
        {o.warp && (
          <>
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.006"
              numOctaves="2"
              seed={o.seed + 101}
              result="flow"
            />
            <feDisplacementMap
              in="noise"
              in2="flow"
              scale={o.warp}
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </>
        )}
        <feColorMatrix
          type="matrix"
          values={`0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  ${o.matrix}`}
        />
      </filter>
      <mask id={id(`${name}-mask`)}>
        <rect width="200" height="200" fill="white" filter={url(name)} />
      </mask>
    </>
  )

  function body() {
    if (photo) {
      // Map the owner's crop circle onto the drawn disc.
      const scale = R / (photo.r * photo.w)
      return (
        <image
          href={photo.url}
          x={C - photo.cx * photo.w * scale}
          y={C - photo.cy * photo.h * scale}
          width={photo.w * scale}
          height={photo.h * scale}
          preserveAspectRatio="none"
        />
      )
    }
    switch (pattern) {
      case 'picture':
        return labelImage ? (
          <image
            href={labelImage}
            width="200"
            height="200"
            preserveAspectRatio="xMidYMid slice"
          />
        ) : (
          <rect width="200" height="200" fill={BLACK} />
        )
      case 'split':
        // A/B halves meet in a straight line through the centre.
        return (
          <g
            transform={`rotate(${-30 + (s % 20)} ${C} ${C})`}
            opacity={baseOpacity}
          >
            <rect width="100" height="200" fill={c1} />
            <rect x="100" width="100" height="200" fill={c2} />
          </g>
        )
      case 'pinwheel': {
        const n = colors.length >= 3 ? colors.length : 4
        const start = (s / 997) * Math.PI
        return (
          <g opacity={baseOpacity}>
            {Array.from({ length: n }, (_, i) => (
              <path
                key={i}
                d={sector(
                  start + (i * 2 * Math.PI) / n,
                  start + ((i + 1) * 2 * Math.PI) / n,
                )}
                fill={colors[i % colors.length] ?? BLACK}
              />
            ))}
          </g>
        )
      }
      case 'stripe':
        // A band of the second colour straight across the disc.
        return (
          <g opacity={baseOpacity}>
            <rect width="200" height="200" fill={c1} />
            <rect
              x="0"
              y="78"
              width="200"
              height="44"
              fill={c2}
              transform={`rotate(${-35 + (s % 30)} ${C} ${C})`}
            />
          </g>
        )
      case 'color-in-color':
        return (
          <>
            <rect
              width="200"
              height="200"
              fill={c2}
              opacity={translucent ? 0.62 : 1}
            />
            {/* Soft organic edge, like dye pushed out from the centre. */}
            <circle
              cx={C}
              cy={C}
              r={(detail.blob ?? 0.52) * R}
              fill={c1}
              filter={url('edge')}
            />
          </>
        )
      case 'marbled':
        return (
          <>
            <rect width="200" height="200" fill={c1} opacity={baseOpacity} />
            {/* Rotated per record so marbles don't all flow the same way. */}
            <g transform={`rotate(${(s * 37) % 180} ${C} ${C})`}>
              {masked(c2, 'veins', 0.95)}
            </g>
            {c3 && (
              <g transform={`rotate(${(s * 37 + 60) % 180} ${C} ${C})`}>
                {masked(c3, 'veins2', 0.85)}
              </g>
            )}
          </>
        )
      case 'swirl':
        return (
          <>
            <rect width="200" height="200" fill={c1} opacity={baseOpacity} />
            {detail.blotchy ? (
              <>
                {masked(c2, 'blotch')}
                {c3 && masked(c3, 'blotch2', 0.9)}
              </>
            ) : (
              <>
                <g transform={`rotate(${s % 180} ${C} ${C})`}>
                  {masked(c2, 'streaks')}
                </g>
                {c3 && (
                  <g transform={`rotate(${(s % 180) + 70} ${C} ${C})`}>
                    {masked(c3, 'streaks2', 0.85)}
                  </g>
                )}
              </>
            )}
          </>
        )
      case 'smoke':
        return (
          <>
            <rect width="200" height="200" fill={c1} opacity={baseOpacity} />
            <g transform={`rotate(${s % 180} ${C} ${C})`}>
              {masked(c2, 'wisp', 0.85)}
            </g>
          </>
        )
      case 'galaxy':
        return (
          <>
            <rect width="200" height="200" fill={mixHex(c1, '#05030a', 0.55)} />
            {masked(c1, 'nebula', 0.9)}
            {masked(c2, 'nebula2', 0.7)}
          </>
        )
      case 'glow':
        return (
          <>
            <rect width="200" height="200" fill={c1} />
            <circle cx={C} cy={C} r={R} fill={url('inner-glow')} />
          </>
        )
      case 'black':
        return <rect width="200" height="200" fill={BLACK} />
      default:
        // solid, translucent, splatter base
        return <rect width="200" height="200" fill={c1} opacity={baseOpacity} />
    }
  }

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
          <clipPath id={id('disc')}>
            <circle cx={C} cy={C} r={R} />
          </clipPath>
          <clipPath id={id('label')}>
            <circle cx={C} cy={C} r="33" />
          </clipPath>

          {/* Only the masks this pattern needs. */}
          {pattern === 'marbled' && !photo && (
            <>
              {/* "turbulence" noise has sharp ridges, which read as marble veins. */}
              {noiseMask('veins', {
                type: 'turbulence',
                freq: '0.022 0.006',
                octaves: 3,
                seed: s,
                matrix: '-3.6 0 0 0 1.9',
                warp: 70,
              })}
              {noiseMask('veins2', {
                type: 'turbulence',
                freq: '0.03 0.008',
                octaves: 2,
                seed: s + 31,
                matrix: '-5 0 0 0 1.6',
                warp: 55,
              })}
            </>
          )}
          {pattern === 'swirl' && !photo && (
            <>
              {noiseMask('streaks', {
                freq: '0.035 0.005',
                octaves: 2,
                seed: s,
                matrix: '6 0 0 0 -2.6',
              })}
              {noiseMask('streaks2', {
                freq: '0.03 0.006',
                octaves: 2,
                seed: s + 17,
                matrix: '6 0 0 0 -2.9',
              })}
              {noiseMask('blotch', {
                freq: '0.016',
                octaves: 2,
                seed: s,
                matrix: '9 0 0 0 -4.2',
              })}
              {noiseMask('blotch2', {
                freq: '0.02',
                octaves: 2,
                seed: s + 9,
                matrix: '9 0 0 0 -4.6',
              })}
            </>
          )}
          {pattern === 'smoke' &&
            !photo &&
            noiseMask('wisp', {
              freq: '0.004 0.018',
              octaves: 4,
              seed: s,
              matrix: '2.4 0 0 0 -0.9',
            })}
          {pattern === 'galaxy' && !photo && (
            <>
              {noiseMask('nebula', {
                freq: '0.008',
                octaves: 5,
                seed: s,
                matrix: '2.6 0 0 0 -1.1',
              })}
              {noiseMask('nebula2', {
                freq: '0.012',
                octaves: 4,
                seed: s + 5,
                matrix: '3 0 0 0 -1.6',
              })}
            </>
          )}
          {pattern === 'color-in-color' && !photo && (
            <filter
              id={id('edge')}
              x="-20%"
              y="-20%"
              width="140%"
              height="140%"
            >
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.04"
                numOctaves="2"
                seed={s}
                result="n"
              />
              <feDisplacementMap in="SourceGraphic" in2="n" scale="16" />
              <feGaussianBlur stdDeviation="0.6" />
            </filter>
          )}

          <radialGradient id={id('inner-glow')} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0.3" stopColor="#ffffff" stopOpacity="0.45" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
          {/* Translucent vinyl is brighter towards the middle, where light passes through. */}
          <radialGradient id={id('see-through')} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0.35" stopColor="#ffffff" stopOpacity="0.28" />
            <stop offset="0.8" stopColor="#ffffff" stopOpacity="0.05" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0.15" />
          </radialGradient>
          {/* Grooves: fine concentric rings. */}
          <radialGradient
            id={id('grooves')}
            cx={C}
            cy={C}
            r={R}
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
          <linearGradient id={id('sheen')} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0.25" stopColor="#fff" stopOpacity="0" />
            <stop offset="0.42" stopColor="#fff" stopOpacity="0.22" />
            <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
            <stop offset="0.75" stopColor="#fff" stopOpacity="0" />
            <stop offset="0.85" stopColor="#fff" stopOpacity="0.12" />
            <stop offset="0.95" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        </defs>

        <g clipPath={url('disc')}>
          {body()}

          {!photo &&
            dots.map((d, i) => (
              <ellipse
                key={i}
                cx={d.cx}
                cy={d.cy}
                rx={d.rx}
                ry={d.ry}
                transform={`rotate(${d.rot} ${d.cx} ${d.cy})`}
                fill={d.fill}
                opacity={d.o}
              />
            ))}

          {translucent && !photo && (
            <circle cx={C} cy={C} r={R} fill={url('see-through')} />
          )}
          {/* Photos already have real grooves and light, so the overlay stays faint. */}
          <rect
            width="200"
            height="200"
            fill={url('grooves')}
            opacity={photo ? 0.35 : 1}
          />
          <rect
            width="200"
            height="200"
            fill={url('sheen')}
            opacity={photo ? 0.4 : 1}
          />
          <circle
            cx={C}
            cy={C}
            r="97.5"
            fill="none"
            stroke="#000"
            strokeOpacity="0.25"
            strokeWidth="2"
          />
          {!photo && (
            <circle
              cx={C}
              cy={C}
              r="37"
              fill="none"
              stroke="#000"
              strokeOpacity="0.18"
              strokeWidth="1"
            />
          )}
        </g>

        {/* A photo shows the real label, so ours is only drawn on illustrated discs. */}
        {pattern !== 'picture' && !photo && (
          <g>
            <circle cx={C} cy={C} r="33" fill="#e9dcc6" />
            {labelImage && (
              <image
                href={labelImage}
                x="67"
                y="67"
                width="66"
                height="66"
                clipPath={url('label')}
                preserveAspectRatio="xMidYMid slice"
              />
            )}
            <circle
              cx={C}
              cy={C}
              r="33"
              fill="none"
              stroke="#000"
              strokeOpacity="0.2"
            />
          </g>
        )}
        {/* Spindle hole. */}
        <circle cx={C} cy={C} r="3.2" className="fill-background" />
      </svg>
    </div>
  )
}
