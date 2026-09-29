import { Link, createFileRoute } from '@tanstack/react-router'
import { TextPage } from '#/components/site-footer'
import { POLICIES_UPDATED, REPO_URL } from '#/lib/site'

export const Route = createFileRoute('/terms')({
  head: () => ({ meta: [{ title: 'Terms · Spinsight' }] }),
  component: TermsPage,
})

function TermsPage() {
  return (
    <TextPage
      kicker="Terms"
      title="The house rules"
      lead="Spinsight is a free, independent hobby project for record collectors. By signing in you agree to these terms, written to be read."
      updated={POLICIES_UPDATED}
    >
      <h2>The service</h2>
      <p>
        Spinsight reads your Discogs collection and turns it into stats, a
        record picker and a way to compare with friends. It's free, has no paid
        tier and no ads. It's run on a best-effort basis: features can change,
        pause or stop, and there's no guarantee it will always be available.
      </p>

      <h2>Your account</h2>
      <p>
        You sign in with Discogs, so you need a Discogs account and must keep to{' '}
        <a
          href="https://support.discogs.com/hc/en-us/articles/360009334333-Terms-of-Service"
          rel="noreferrer"
          target="_blank"
        >
          Discogs' terms
        </a>
        . You're responsible for what happens under your account. Spinsight only
        reads from Discogs; it never buys, sells, edits or deletes anything
        there.
      </p>

      <h2>Your data stays yours</h2>
      <p>
        Your collection, plays and settings belong to you. You allow Spinsight
        to store and process them to run the service, and to show them to others
        as your visibility settings allow (see{' '}
        <Link to="/privacy">Privacy</Link>). You can download everything or
        delete your account at any time.
      </p>

      <h2>Play nicely</h2>
      <ul>
        <li>
          Don't use Spinsight to harass anyone, including through follows or
          reactions.
        </li>
        <li>
          Don't scrape it, overload it, automate sign-ups or follows, or try to
          reach data you shouldn't see.
        </li>
        <li>Don't use it to get around Discogs' own rules or rate limits.</li>
      </ul>
      <p>Accounts that break these rules may be removed.</p>

      <h2>Numbers are estimates</h2>
      <p>
        Collection values, prices, runtimes, genres and artwork come from
        Discogs, Spotify, Apple and Wikipedia, and can be incomplete or wrong.
        Treat values as a rough guide, not a valuation for insurance, sale or
        tax.
      </p>

      <h2>No warranty</h2>
      <p>
        Spinsight is provided "as is", without warranties of any kind. As far as
        the law allows, its maintainers aren't liable for any loss arising from
        using it or not being able to, including lost data. Nothing here limits
        rights you have under consumer law that can't be waived.
      </p>

      <h2>Open source</h2>
      <p>
        The code is{' '}
        <a href={REPO_URL} rel="noreferrer" target="_blank">
          open source
        </a>{' '}
        under the MIT licence. That licence covers the code only, not other
        people's data or the Discogs, Spotify and Apple names and content.
      </p>

      <h2>Ending things</h2>
      <p>
        You can stop at any time by deleting your account on the{' '}
        <Link to="/privacy" hash="your-data">
          Privacy
        </Link>{' '}
        page and revoking access in Discogs. We may suspend accounts that break
        these terms, or shut the service down; if that happens we'll try to give
        notice so you can download your data.
      </p>

      <h2>Changes</h2>
      <p>
        If these terms change, the date at the top changes too. Continuing to
        use Spinsight after a change means you accept it. Questions:{' '}
        <a href={`${REPO_URL}/issues`} rel="noreferrer" target="_blank">
          open an issue
        </a>
        .
      </p>
    </TextPage>
  )
}
