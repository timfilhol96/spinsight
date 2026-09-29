import { Link, createFileRoute } from '@tanstack/react-router'
import { TextPage } from '#/components/site-footer'
import { REPO_URL } from '#/lib/site'

export const Route = createFileRoute('/about')({
  head: () => ({ meta: [{ title: 'How it works · Spinsight' }] }),
  component: AboutPage,
})

const FAQ: Array<[string, React.ReactNode]> = [
  [
    'Is it free?',
    'Yes. No paid tier, no ads, no trial. It is a hobby project for people who own too many records.',
  ],
  [
    'Can Spinsight change anything on my Discogs account?',
    <>
      It only ever reads. See <Link to="/trust">Trust & security</Link> for the
      details and how to check.
    </>,
  ],
  [
    'Why is my collection taking a while to fill in?',
    'Discogs allows about one request a second. The list of records arrives in seconds, but details like tracklists, prices and original years are fetched one record at a time, so a large first sync takes a few minutes.',
  ],
  [
    'Where do the colours come from?',
    'From the format text on Discogs, such as "Clear With Blue Splatter". Spinsight draws the disc and tints the whole app to match. Black and picture discs take their colour from the cover.',
  ],
  [
    'Do my friends need to be on Spinsight?',
    "To see what they're spinning or compare collections, yes. You can follow any Discogs username now, and they'll show up once they sign in. Your invite link makes them follow you back.",
  ],
  [
    'Can I keep my collection to myself?',
    'Yes. Make your collection private from your collection page, or keep it public and stop sharing what you spin from the Friends page.',
  ],
  [
    'How do I leave?',
    <>
      Delete your account on the{' '}
      <Link to="/privacy" hash="your-data">
        Privacy
      </Link>{' '}
      page. It's immediate and doesn't touch your Discogs account.
    </>,
  ],
]

function AboutPage() {
  return (
    <TextPage
      kicker="How it works"
      title="Your crates, decoded"
      lead="Spinsight reads your Discogs collection, works out what it says about you, helps you pick what to play and lets you compare notes with friends."
    >
      <h2>Three steps</h2>
      <ol>
        <li>
          <strong>Sign in with Discogs.</strong> No new password: Discogs asks
          you to allow Spinsight to read your collection.
        </li>
        <li>
          <strong>Sync.</strong> Your records come across, then each one is
          filled in with its tracklist, original year, community stats, price
          and clean artwork.
        </li>
        <li>
          <strong>Explore.</strong> Insights on genres, decades, labels,
          rarities and value; a year-by-year recap; a picker that weighs mood,
          weather and how long since you last played something; and friends to
          follow and compare with.
        </li>
      </ol>

      <h2>Questions</h2>
      <dl>
        {FAQ.map(([q, a]) => (
          <div key={q}>
            <dt className="font-semibold">{q}</dt>
            <dd className="ml-0">{a}</dd>
          </div>
        ))}
      </dl>

      <h2>Credits</h2>
      <p>
        Record data comes from{' '}
        <a href="https://www.discogs.com" rel="noreferrer" target="_blank">
          Discogs
        </a>
        . Spinsight uses the Discogs API but is not affiliated with, sponsored
        or endorsed by Discogs. Artwork, runtimes and artist genres come from
        Spotify and Apple Music, liner notes from Wikipedia, weather from
        Open-Meteo and exchange rates from Frankfurter.
      </p>
      <p>
        The code is{' '}
        <a href={REPO_URL} rel="noreferrer" target="_blank">
          open source
        </a>
        . Ideas and bug reports are welcome as{' '}
        <a href={`${REPO_URL}/issues`} rel="noreferrer" target="_blank">
          issues
        </a>
        .
      </p>
    </TextPage>
  )
}
