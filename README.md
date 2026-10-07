# Spinsight

Stats on your Discogs record collection, plus help picking what to play next.
Friends sign in with their own Discogs account. The app takes on the colour of
the pressing you're looking at: a red translucent LP turns the whole page red.

**Live:** <https://spinsight-app.vercel.app>

**Stack:** TanStack Start (React 19, server functions) · Tailwind v4 · shadcn/ui ·
TanStack Query · Supabase (Postgres) · Vercel.

## Local setup

1. **Node 22+.** With Homebrew: `brew install node@22`, then add it to your PATH
   (`echo 'export PATH="/opt/homebrew/opt/node@22/bin:$PATH"' >> ~/.zshrc`).
2. `npm install`
3. **Supabase:** create a project, open _SQL Editor_, paste
   [`supabase/schema.sql`](supabase/schema.sql) and run it.
   Then run each file in [`supabase/migrations/`](supabase/migrations/) in
   order (existing projects only need the migrations they haven't run yet).
4. **Discogs app:** at <https://www.discogs.com/settings/developers>, click
   _Create an application_. Set the callback URL to
   `http://localhost:3000/api/auth/discogs/callback`. This gives a consumer
   key and secret (your personal access token isn't needed).
5. Copy `.env.example` to `.env` and fill it in.
6. `npm run dev` → <http://localhost:3000>, then _Sign in with Discogs_.

## How data flows

- **Sign in:** Discogs OAuth 1.0a (`src/routes/api/auth/discogs/*`). The
  access token is stored server-side; the browser only gets an encrypted
  session cookie.
- **Sync** (`src/lib/sync.server.ts`): the collection list costs one Discogs
  request per 100 records. **Enrichment** then fetches each release's
  have/want, lowest price (in USD) and tracklist, the original release year
  from its Discogs master, and clean artwork, in short batches, because
  Discogs allows about 60 requests a minute.
- **Daily cron** (`vercel.json` → `/api/cron/sync`) re-syncs everyone.
- **Artwork** (`src/lib/artwork.server.ts`): clean covers come from Spotify
  album search, then Apple (iTunes Search), with the Discogs image as the
  last resort, since Discogs' primary image is sometimes a photo of the disc.
  Special editions (anniversary, deluxe…, see `src/lib/editions.ts`) only take
  a streaming cover of the same edition, else their own Discogs image. The
  owner can override any cover from the record panel.
- **Installable app:** `public/manifest.webmanifest` + `public/sw.js`
  (caches build assets and covers, offline page; never caches data or auth).
  Icons are rendered from `public/logo.svg` with `npm run icons`.
- **Picker** (`src/lib/moods.ts`): Discogs styles are mapped to energy,
  darkness and atmosphere values, then scored against mood, weather
  (Open-Meteo), time of day, length and how recently each record was played.
- **Now playing** (`src/components/now-playing.tsx`): logging a spin docks the
  record on every page and tints the app until "Done" or its runtime ends.
  Runtimes come from Discogs track times, else the streaming album's.
- **Listening room** (`src/lib/liner-notes.server.ts`): credits, notes and the
  artist bio come from Discogs. The Discogs master (or the release, when it
  has no master) is matched to a MusicBrainz release group and on to its
  Wikidata item (`src/lib/musicbrainz.server.ts`,
  `src/lib/wikidata.server.ts`), which names the album's exact Wikipedia
  article: in the album's own language first (Wikidata's "language of work"),
  then English, then French. A title search is the fallback. Praise for stand
  mode (`src/lib/praise.server.ts`) is read from the English article's
  wikitext when there is one, since the parser knows its templates: awards,
  critics' lists, certifications, chart peaks, review quotes and scores.
  Wikidata adds awards the article only mentions in prose, and sales
  certifications for countries the article doesn't list. The Discogs and
  MusicBrainz community ratings count when they're high and well voted. Only
  high marks are kept. MusicBrainz allows one request a second, so its and
  Wikidata's answers are cached per master (or release) for 14 days in
  `record_facts_cache`. Every source fails soft.
- **Friends** (`src/lib/friends*.ts`, `src/routes/friends.*`): one-way
  follows by Discogs username. Usernames not on Spinsight yet stay pending
  until that person signs in (invite links make them follow you back). The
  Friends tab polls what friends are spinning, with emoji reactions, "Spin it
  too", a weekly leaderboard, recent additions and wantlist matches (the
  wantlist is mirrored on every sync). The compare pages (taste match, crate
  overlap, a joint year) run in the browser on both cached profiles. Anyone
  can keep their spins private while their collection stays public.
- **Your data** (`src/lib/account.functions.ts`, on `/privacy`): signed-in
  users can download everything stored about them as JSON or delete their
  account (every table cascades from `users`). Privacy, Terms, Trust and How
  it works live in `src/routes/{privacy,terms,trust,about}.tsx`; update
  `POLICIES_UPDATED` in `src/lib/site.ts` when their content changes.
- **Link preview and install screenshots:** `public/og.jpg` and
  `public/screenshots/` are real app screenshots of a made-up collection.
  Run `SPINSIGHT_DEMO=1 npm run dev` and `/u/samspins` serves it, signed in
  as its owner (dev only, nothing touches the database; see
  `src/lib/demo-profile.server.ts`). Capture at device pixel ratio 2: the
  landing page uses `collection-wide@2x.webp` (2560×1600) on retina screens.
  `scripts/preview/demo-collection.mjs` rebuilds the records and
  `scripts/preview/og-card.html` is the card's source, with instructions to
  regenerate it.
- **Disc photos** (`src/components/disc-photo-editor.tsx`): owners can crop a
  Discogs photo of the vinyl to use as the disc; colours are sampled server-side
  with sharp (`src/lib/disc-photo.server.ts`).
- **Colour variants** (`src/lib/vinyl-color.ts`) parse Discogs format text such
  as "Clear w/ Blue Splatter" into colours and a pattern.
  `src/components/vinyl-disc.tsx` draws the disc, and `useRecordTheme`
  retints the app.

All database access runs in server functions using the Supabase secret key.
RLS is enabled with no policies, so the public key can't read anything.

## Deploying (Vercel)

Import the GitHub repo in Vercel and add the same environment variables. Then
add `https://<your-app>.vercel.app/api/auth/discogs/callback` to the Discogs
app's callback URL.

## License

[MIT](LICENSE)
