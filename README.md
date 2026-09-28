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
3. **Supabase:** create a project, open *SQL Editor*, paste
   [`supabase/schema.sql`](supabase/schema.sql) and run it.
   Then run each file in [`supabase/migrations/`](supabase/migrations/) in
   order (existing projects only need the migrations they haven't run yet).
4. **Discogs app:** at <https://www.discogs.com/settings/developers>, click
   *Create an application*. Set the callback URL to
   `http://localhost:3000/api/auth/discogs/callback`. This gives a consumer
   key and secret (your personal access token isn't needed).
5. Copy `.env.example` to `.env` and fill it in.
6. `npm run dev` → <http://localhost:3000>, then *Sign in with Discogs*.

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
