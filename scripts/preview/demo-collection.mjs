// Builds src/lib/demo-collection.json: a made-up collection of well-known
// albums for the landing page screenshots (see src/lib/demo-profile.server.ts).
// Covers come from the iTunes Search API. Run: node scripts/preview/demo-collection.mjs
import { writeFile } from 'node:fs/promises'

// [artist, title, original year, pressing year, genres, styles, vinyl text, label, added]
const ALBUMS = [
  ['Khruangbin', 'Mordechai', 2020, 2020, ['Rock', 'Funk / Soul'], ['Psychedelic Rock', 'Funk'], 'Pink Translucent', 'Dead Oceans', '2026-09-28'],
  ['Tame Impala', 'Currents', 2015, 2023, ['Rock', 'Electronic'], ['Psychedelic Rock', 'Synth-pop'], 'Purple Marbled', 'Modular', '2026-09-14'],
  ['Tycho', 'Awake', 2014, 2014, ['Electronic'], ['Downtempo', 'Chillwave'], 'White With Multi-Colour Splatter', 'Ghostly International', '2026-09-02'],
  ['Talking Heads', 'Remain in Light', 1980, 2023, ['Rock', 'Electronic'], ['New Wave', 'Art Rock'], 'Red', 'Sire', '2026-08-03'],
  ['Fleetwood Mac', 'Rumours', 1977, 2024, ['Rock', 'Pop'], ['Soft Rock', 'Pop Rock'], 'Gold Translucent', 'Warner Bros. Records', '2026-07-21'],
  ['Kraftwerk', 'Computer World', 1981, 2020, ['Electronic'], ['Synth-pop', 'Electro'], 'Yellow Translucent', 'Parlophone', '2026-07-09'],
  ['Bonobo', 'Migration', 2017, 2017, ['Electronic'], ['Downtempo'], 'Blue', 'Ninja Tune', '2026-06-27'],
  ['Radiohead', 'In Rainbows', 2007, 2016, ['Rock', 'Electronic'], ['Alternative Rock', 'Art Rock'], 'Clear', 'XL Recordings', '2026-06-12'],
  ['Kendrick Lamar', 'To Pimp a Butterfly', 2015, 2015, ['Hip Hop', 'Jazz'], ['Conscious', 'Jazzy Hip-Hop'], null, 'Top Dawg Entertainment', '2026-05-30'],
  ['Miles Davis', 'Kind of Blue', 1959, 2015, ['Jazz'], ['Modal', 'Cool Jazz'], 'Blue Translucent', 'Columbia', '2026-05-24'],
  ['Caribou', 'Our Love', 2014, 2014, ['Electronic'], ['House', 'Downtempo'], 'Orange Translucent', 'City Slang', '2026-05-11'],
  ['Joni Mitchell', 'Blue', 1971, 2022, ['Folk, World, & Country', 'Pop'], ['Folk Rock', 'Acoustic'], 'Blue', 'Reprise Records', '2026-05-04'],
  ['Black Sabbath', 'Paranoid', 1970, 2021, ['Rock'], ['Heavy Metal', 'Hard Rock'], 'Purple Swirl', 'Vertigo', '2026-04-26'],
  ['Daft Punk', 'Random Access Memories', 2013, 2023, ['Electronic', 'Funk / Soul'], ['Disco', 'Nu-Disco'], null, 'Columbia', '2026-04-12'],
  ['Massive Attack', 'Mezzanine', 1998, 2018, ['Electronic'], ['Trip Hop'], null, 'Virgin', '2026-03-29'],
  ['Air', 'Moon Safari', 1998, 2018, ['Electronic'], ['Downtempo', 'Synth-pop'], 'Yellow', 'Virgin', '2026-03-01'],
  ['Amy Winehouse', 'Back to Black', 2006, 2016, ['Funk / Soul', 'Pop'], ['Soul'], null, 'Island Records', '2026-02-14'],
  ['Gorillaz', 'Demon Days', 2005, 2018, ['Electronic', 'Hip Hop', 'Rock'], ['Alternative Rock', 'Trip Hop'], 'Red With Black Splatter', 'Parlophone', '2026-01-10'],
  ['Beach House', 'Bloom', 2012, 2012, ['Rock', 'Pop'], ['Dream Pop'], 'White Marbled', 'Sub Pop', '2025-12-20'],
  ['LCD Soundsystem', 'Sound of Silver', 2007, 2017, ['Electronic'], ['Dance-punk', 'Electro'], 'Silver', 'DFA', '2025-11-29'],
  ['Stevie Wonder', 'Songs in the Key of Life', 1976, 2016, ['Funk / Soul'], ['Soul'], null, 'Motown', '2025-11-08'],
  ['Mac DeMarco', 'Salad Days', 2014, 2014, ['Rock'], ['Indie Rock', 'Psychedelic Rock'], 'Green Marbled', 'Captured Tracks', '2025-10-18'],
  ['Lauryn Hill', 'The Miseducation of Lauryn Hill', 1998, 2018, ['Hip Hop', 'Funk / Soul'], ['Neo Soul', 'Conscious'], null, 'Ruffhouse Records', '2025-09-27'],
  ['John Coltrane', 'A Love Supreme', 1965, 2020, ['Jazz'], ['Hard Bop', 'Free Jazz'], null, 'Impulse!', '2025-08-30'],
  ['Arctic Monkeys', 'AM', 2013, 2013, ['Rock'], ['Indie Rock'], null, 'Domino', '2025-07-19'],
  ['Bob Marley & The Wailers', 'Exodus', 1977, 2020, ['Reggae'], ['Roots Reggae'], null, 'Island Records', '2025-05-10'],
  ['The Cure', 'Disintegration', 1989, 2010, ['Rock'], ['Goth Rock', 'New Wave'], null, 'Fiction Records', '2025-04-05'],
  ['Portishead', 'Dummy', 1994, 2014, ['Electronic'], ['Trip Hop'], null, 'Go! Beat', '2025-03-01'],
  ['The Strokes', 'Is This It', 2001, 2016, ['Rock'], ['Indie Rock', 'Garage Rock'], null, 'RCA', '2025-01-25'],
  ['The Beatles', 'Abbey Road', 1969, 2019, ['Rock'], ['Pop Rock'], null, 'Apple Records', '2024-12-14'],
  ['Led Zeppelin', 'Led Zeppelin IV', 1971, 2014, ['Rock'], ['Hard Rock', 'Blues Rock'], null, 'Atlantic', '2024-11-02'],
  ['Aphex Twin', 'Selected Ambient Works 85-92', 1992, 2013, ['Electronic'], ['Ambient', 'IDM'], null, 'Apollo', '2024-09-21'],
  ['Sufjan Stevens', 'Carrie & Lowell', 2015, 2015, ['Folk, World, & Country', 'Rock'], ['Indie Rock', 'Folk'], 'Clear', 'Asthmatic Kitty Records', '2024-08-10'],
  ['Björk', 'Homogenic', 1997, 2015, ['Electronic', 'Pop'], ['Art Pop', 'Trip Hop'], null, 'One Little Indian', '2024-06-22'],
]

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

async function search(term) {
  await new Promise((r) => setTimeout(r, 400)) // stay under the rate limit
  const res = await fetch(
    `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=album&limit=25`,
  )
  return (await res.json()).results
}

async function cover(artist, title) {
  const matches = (r) =>
    norm(r.collectionName).startsWith(norm(title)) &&
    norm(r.artistName).includes(norm(artist).slice(0, 6))
  // Some names ("Jamie xx") return nothing when searched with the title.
  const hit =
    (await search(`${artist} ${title}`)).find(matches) ??
    (await search(title)).find(matches)
  if (!hit) return null
  const url = (size) => hit.artworkUrl100.replace('100x100bb', `${size}x${size}bb`)
  return { coverImage: url(600), thumb: url(150), durationSec: null }
}

const records = []
for (const [i, a] of ALBUMS.entries()) {
  const [artist, title, originalYear, year, genres, styles, text, label, added] = a
  const art = await cover(artist, title)
  if (!art) {
    console.warn(`Skipped (no artwork): ${artist} - ${title}`)
    continue
  }
  // Spread runtimes between ~38 and ~70 minutes, deterministically.
  const durationSec = (38 + ((i * 7) % 33)) * 60
  records.push({
    artist,
    title,
    originalYear,
    year,
    genres,
    styles,
    vinylText: text,
    label,
    dateAdded: `${added}T${String(10 + (i % 10)).padStart(2, '0')}:24:00Z`,
    coverImage: art.coverImage,
    thumb: art.thumb,
    durationSec,
  })
  console.log(`${artist} - ${title}`)
}

await writeFile(
  new URL('../../src/lib/demo-collection.json', import.meta.url),
  `${JSON.stringify(records, null, 2)}\n`,
)
