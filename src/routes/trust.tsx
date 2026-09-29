import { Link, createFileRoute } from '@tanstack/react-router'
import { TextPage } from '#/components/site-footer'
import { POLICIES_UPDATED, REPO_URL } from '#/lib/site'

export const Route = createFileRoute('/trust')({
  head: () => ({ meta: [{ title: 'Trust & security · Spinsight' }] }),
  component: TrustPage,
})

const VISIBILITY: Array<[string, string, string, string]> = [
  ['Collection and stats', 'Anyone with the link', 'Only you', 'You'],
  [
    'Play counts and listening stats',
    'Anyone with the link',
    'Only you',
    'You',
  ],
  [
    "What you're spinning now",
    'Visitors and followers, unless you stop sharing',
    'Only you',
    'You',
  ],
  ['Collection value', 'Only you', 'Only you', 'You'],
  ['Wantlist (as on Discogs)', 'Anyone with the link', 'Only you', 'You'],
  ['Who you follow', 'The people you follow', 'The people you follow', 'You'],
  ['Discogs access key', 'Nobody, not even you', 'Nobody', 'Server only'],
]

function TrustPage() {
  return (
    <TextPage
      kicker="Trust & security"
      title="How your data is looked after"
      lead="Spinsight is built so that the least possible data exists, the browser never holds anything sensitive, and you can check every claim on this page in the source code."
      updated={POLICIES_UPDATED}
    >
      <h2>Read-only by design</h2>
      <p>
        Discogs doesn't offer read-only app permissions, so the key it issues at
        sign-in could in principle change your account. Spinsight never uses it
        that way: the only requests it sends to Discogs are reads. The whole
        Discogs client is{' '}
        <a
          href={`${REPO_URL}/blob/main/src/lib/discogs.server.ts`}
          rel="noreferrer"
          target="_blank"
        >
          one short file
        </a>{' '}
        if you'd like to check. You can revoke the key at any time in{' '}
        <a
          href="https://www.discogs.com/settings/applications"
          rel="noreferrer"
          target="_blank"
        >
          Discogs → Settings → Applications
        </a>
        .
      </p>

      <h2>What protects your account</h2>
      <ul>
        <li>
          <strong>No passwords to leak.</strong> Signing in goes through Discogs
          (OAuth). Spinsight never sees your Discogs password or email.
        </li>
        <li>
          <strong>Keys stay on the server.</strong> Your Discogs access key is
          stored in the database and only used by server code. It's never sent
          to your browser and isn't included in your data export.
        </li>
        <li>
          <strong>Sealed session cookie.</strong> Your browser holds one
          encrypted cookie that only says which account you are. It's HTTP-only
          (page scripts can't read it), sent over HTTPS only, and protected
          against cross-site use.
        </li>
        <li>
          <strong>Locked database.</strong> Row-level security is on for every
          table with no public access rules, so the database's public key can
          read nothing. All access goes through the app's server functions,
          which check who you are and what you're allowed to see.
        </li>
        <li>
          <strong>Checked inputs.</strong> Every request is validated on the
          server, and actions like reacting to a spin check that you follow that
          person and that they share their spins.
        </li>
        <li>
          <strong>Encrypted in transit.</strong> Everything is served over
          HTTPS.
        </li>
      </ul>

      <h2>Who sees what</h2>
      <div className="not-prose -mx-4 overflow-x-auto px-4">
        <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-2 pr-3 font-medium">Data</th>
              <th className="py-2 pr-3 font-medium">Public profile</th>
              <th className="py-2 pr-3 font-medium">Private profile</th>
              <th className="py-2 font-medium">Can change it</th>
            </tr>
          </thead>
          <tbody>
            {VISIBILITY.map(([what, pub, priv, who]) => (
              <tr key={what} className="border-b border-border/50 align-top">
                <td className="py-2 pr-3 font-medium">{what}</td>
                <td className="py-2 pr-3">{pub}</td>
                <td className="py-2 pr-3">{priv}</td>
                <td className="py-2 text-muted-foreground">{who}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>What we don't do</h2>
      <ul>
        <li>No ads, no analytics, no tracking pixels, no data sales.</li>
        <li>
          No sharing of personal data with anyone beyond the services that run
          the app (listed in <Link to="/privacy">Privacy</Link>).
        </li>
        <li>No email address, so no mailing lists.</li>
        <li>No storing your location.</li>
      </ul>

      <h2>Open source</h2>
      <p>
        All of Spinsight's code is{' '}
        <a href={REPO_URL} rel="noreferrer" target="_blank">
          public on GitHub
        </a>
        , including this page. It follows the{' '}
        <a
          href="https://support.discogs.com/hc/en-us/articles/360009334593-API-Terms-of-Use"
          rel="noreferrer"
          target="_blank"
        >
          Discogs API terms
        </a>{' '}
        and stays within Discogs' rate limits.
      </p>

      <h2>Found a problem?</h2>
      <p>
        If you think you've found a security issue, please don't open a public
        issue. Use <strong>Report a vulnerability</strong> on the repository's{' '}
        <a href={`${REPO_URL}/security`} rel="noreferrer" target="_blank">
          Security tab
        </a>{' '}
        so it can be fixed before it's public. Anything else:{' '}
        <a href={`${REPO_URL}/issues`} rel="noreferrer" target="_blank">
          open an issue
        </a>
        .
      </p>
      <p>
        Hobby project, honest limits: there's no security team or formal audit.
        What there is: little data, nothing sensitive in the browser, and code
        anyone can review.
      </p>
    </TextPage>
  )
}
