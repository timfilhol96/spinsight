import { createFileRoute } from '@tanstack/react-router'
import { useEffect } from 'react'
import { TextPage } from '#/components/site-footer'
import { CHANGELOG, markChangesSeen } from '#/lib/changelog'
import { REPO_URL } from '#/lib/site'

export const Route = createFileRoute('/changelog')({
  head: () => ({ meta: [{ title: "What's new · Spinsight" }] }),
  component: ChangelogPage,
})

const dateFmt = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

function ChangelogPage() {
  useEffect(() => markChangesSeen(), [])

  return (
    <TextPage
      kicker="What's new"
      title="Changes to Spinsight"
      lead="New features and fixes, newest first. Many of them started as a suggestion, so keep them coming."
    >
      {CHANGELOG.map((r) => (
        <section key={`${r.date}-${r.title}`}>
          <p className="mt-12 mb-0 font-mono text-xs text-muted-foreground">
            <time dateTime={r.date}>
              {dateFmt.format(new Date(`${r.date}T00:00:00Z`))}
            </time>
          </p>
          <h2 className="mt-1!">{r.title}</h2>
          <ul>
            {r.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          {r.issue && (
            <p className="text-sm text-muted-foreground">
              Suggested in{' '}
              <a
                href={`${REPO_URL}/issues/${r.issue}`}
                target="_blank"
                rel="noreferrer"
              >
                issue #{r.issue}
              </a>
              .
            </p>
          )}
        </section>
      ))}

      <h2>Got an idea?</h2>
      <p>
        Open an{' '}
        <a href={`${REPO_URL}/issues`} target="_blank" rel="noreferrer">
          issue on GitHub
        </a>{' '}
        with what you'd like Spinsight to do.
      </p>
    </TextPage>
  )
}
