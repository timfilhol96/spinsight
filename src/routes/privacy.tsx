import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Download, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { TextPage } from '#/components/site-footer'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { deleteMyAccount, exportMyData } from '#/lib/account.functions'
import { viewerQuery } from '#/lib/queries'
import { POLICIES_UPDATED, REPO_URL } from '#/lib/site'

export const Route = createFileRoute('/privacy')({
  head: () => ({ meta: [{ title: 'Privacy · Spinsight' }] }),
  component: PrivacyPage,
})

function PrivacyPage() {
  return (
    <TextPage
      kicker="Privacy"
      title="What Spinsight knows about you"
      lead="Very little beyond your record collection. No email, no password, no ads, no tracking. Here's all of it, and how to take it back."
      updated={POLICIES_UPDATED}
    >
      <YourData />

      <h2>What we store</h2>
      <p>
        <strong>From Discogs, when you sign in:</strong> your Discogs user ID,
        username, display name and avatar, plus the access key Discogs issues so
        Spinsight can read your collection. That key stays on the server; it is
        never sent to your browser.
      </p>
      <p>
        <strong>From Discogs, when you sync</strong> (and once a day
        automatically): the records in your collection (with the folder, your
        rating and the date you added each one), your wantlist, and the
        collection value estimate Discogs shows you.
      </p>
      <p>
        <strong>Things you do in Spinsight:</strong> records you mark as playing
        and when, plus the picker answers that led to a pick (mood, a weather
        category like "rainy", how much time you had); covers and disc photos
        you choose; your currency and visibility settings; who you follow; and
        emoji you put on friends' spins.
      </p>
      <p>
        <strong>Release details</strong> such as titles, tracklists, artwork,
        prices and have/want counts are public Discogs data. They're stored once
        and shared by everyone who owns that record, so they aren't personal
        data.
      </p>
      <p>
        We don't collect your email address, a password, payment details, your
        precise location or anything about how you browse. There are no
        analytics, advertising or tracking scripts.
      </p>

      <h2>Your location, for the weather</h2>
      <p>
        The record picker can ask your browser for your location to check the
        weather. If you allow it, your browser rounds the coordinates to about a
        kilometre and asks{' '}
        <a href="https://open-meteo.com" rel="noreferrer" target="_blank">
          Open-Meteo
        </a>{' '}
        directly. Your location is never sent to Spinsight's servers or stored.
        Only the resulting category ("sunny", "rainy"…) is saved, and only if
        you then log a play.
      </p>

      <h2>Who can see what</h2>
      <ul>
        <li>
          <strong>Public profile (the default):</strong> anyone with the link
          can see your collection, its stats, your play counts and, if you share
          them, what you're spinning.
        </li>
        <li>
          <strong>Private profile:</strong> only you. People who follow you see
          that your collection is private.
        </li>
        <li>
          <strong>What you're spinning</strong> (your current record, last spin
          and weekly leaderboard row) is shown to people who follow you and to
          visitors of your public profile. Turn it off on the{' '}
          <Link to="/friends">Friends</Link> page with "Sharing my spins".
        </li>
        <li>
          <strong>Following:</strong> people you follow can see that you follow
          them. Emoji you add are shown to the person spinning and to their
          other followers. "Spin it too" shows the friend's name on your spin.
        </li>
        <li>
          <strong>Your collection value</strong> is only ever shown to you.
        </li>
      </ul>

      <h2>Services we rely on</h2>
      <p>
        These see some data as part of running Spinsight. None of them get your
        Discogs access key.
      </p>
      <ul>
        <li>
          <strong>Supabase</strong> hosts the database.
        </li>
        <li>
          <strong>Vercel</strong> hosts the app. Like any web host, it keeps
          short-lived request logs that include IP addresses.
        </li>
        <li>
          <strong>Discogs</strong> provides your collection, wantlist and
          release details, using your access key.
        </li>
        <li>
          <strong>Spotify</strong> and <strong>Apple (iTunes Search)</strong>{' '}
          are searched by album and artist name for clean artwork, runtimes and
          artist genres. <strong>Wikipedia</strong> is searched the same way for
          liner notes. <strong>Frankfurter</strong> provides exchange rates.
          None of these receive anything about you.
        </li>
        <li>
          <strong>Google Fonts</strong> serves the typefaces, so your browser
          contacts Google when the page loads.
        </li>
      </ul>

      <h2>Cookies and browser storage</h2>
      <p>
        One cookie, <code>spinsight_session</code>, keeps you signed in. It's
        encrypted, can't be read by scripts on the page, and expires after 90
        days. Your browser also remembers your light/dark choice and whether the
        player is minimised. Nothing is used for tracking, so there's no cookie
        banner.
      </p>

      <h2>How long we keep it</h2>
      <p>
        For as long as you have an account. Records you remove on Discogs
        disappear from Spinsight on the next sync; your play history for a
        pressing you swapped out is kept (hidden) in case it comes back. When
        you delete your account, everything above is deleted immediately. Copies
        may survive in our hosting provider's backups for a short time before
        they expire.
      </p>

      <h2>Your controls</h2>
      <ul>
        <li>
          <a href="#your-data">Download a copy</a> of your data, or{' '}
          <a href="#your-data">delete your account</a>, at the top of this page.
        </li>
        <li>
          Make your collection private from your collection page, or stop
          sharing your spins from the Friends page.
        </li>
        <li>
          Cut Spinsight off from Discogs at any time in{' '}
          <a
            href="https://www.discogs.com/settings/applications"
            rel="noreferrer"
            target="_blank"
          >
            Discogs → Settings → Applications
          </a>
          . Spinsight can then no longer sync your collection.
        </li>
      </ul>

      <h2>Changes and questions</h2>
      <p>
        If this page changes in a way that matters, the date at the top changes
        too, and the history is public in the{' '}
        <a href={REPO_URL} rel="noreferrer" target="_blank">
          source code
        </a>
        . Questions or requests:{' '}
        <a href={`${REPO_URL}/issues`} rel="noreferrer" target="_blank">
          open an issue
        </a>
        . See also the <Link to="/terms">terms</Link> and{' '}
        <Link to="/trust">how your data is protected</Link>.
      </p>
    </TextPage>
  )
}

/** Download / delete, for whoever is signed in. */
function YourData() {
  const { data: viewer } = useQuery(viewerQuery)
  const qc = useQueryClient()
  const [exporting, setExporting] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [typed, setTyped] = useState('')
  const [deleting, setDeleting] = useState(false)

  if (!viewer) return null

  async function download() {
    setExporting(true)
    try {
      const data = await exportMyData()
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `spinsight-${viewer!.username}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      toast.error(`Couldn't export: ${(e as Error).message}`)
    } finally {
      setExporting(false)
    }
  }

  async function remove(e: React.FormEvent) {
    e.preventDefault()
    setDeleting(true)
    try {
      await deleteMyAccount({ data: { confirm: typed } })
      qc.clear()
      // Full reload: every cached query belonged to the deleted account.
      window.location.assign('/')
    } catch (err) {
      toast.error((err as Error).message)
      setDeleting(false)
    }
  }

  return (
    <section
      id="your-data"
      className="not-prose scroll-mt-24 rounded-2xl border bg-card/80 p-5"
    >
      <h2 className="font-display text-xl font-bold">Your data</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Signed in as @{viewer.username}.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outline" onClick={download} disabled={exporting}>
          <Download /> {exporting ? 'Preparing…' : 'Download my data'}
        </Button>
        {!confirming && (
          <Button
            variant="outline"
            className="border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setConfirming(true)}
          >
            <Trash2 /> Delete my account
          </Button>
        )}
      </div>
      {confirming && (
        <form
          onSubmit={remove}
          className="mt-4 rounded-xl border border-destructive/40 p-4"
        >
          <p className="text-sm">
            This deletes your collection mirror, play history, wantlist, follows
            and reactions from Spinsight straight away. Your Discogs account is
            not touched. Type{' '}
            <strong className="font-mono">{viewer.username}</strong> to confirm.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              aria-label="Your Discogs username"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
            />
            <Button
              type="submit"
              disabled={
                deleting ||
                typed.toLowerCase() !== viewer.username.toLowerCase()
              }
              className="shrink-0 bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Deleting…' : 'Delete for good'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setConfirming(false)
                setTyped('')
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </section>
  )
}
