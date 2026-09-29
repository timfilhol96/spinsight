import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { UserCheck, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '#/components/ui/button'
import { followUser, unfollowUser } from '#/lib/friends.functions'
import { inviteUrl } from '#/lib/friends'
import { friendsQuery, viewerQuery } from '#/lib/queries'
import { cn } from '#/lib/utils'

/** Follow / unfollow a Discogs username, with toasts. */
export function useFollow() {
  const qc = useQueryClient()
  const { data: viewer } = useQuery(viewerQuery)
  const [pending, setPending] = useState(false)

  async function follow(username: string) {
    setPending(true)
    try {
      const r = await followUser({ data: { username } })
      await qc.invalidateQueries({ queryKey: friendsQuery.queryKey })
      if (r.pending && viewer) {
        toast(`${r.username} isn't on Spinsight yet.`, {
          description:
            "They'll show up here once they sign in. Send them your invite link.",
          action: {
            label: 'Copy invite',
            onClick: () => copyInvite(viewer.username),
          },
        })
      } else {
        toast.success(`Following ${r.username}.`)
      }
      return true
    } catch (e) {
      toast.error((e as Error).message)
      return false
    } finally {
      setPending(false)
    }
  }

  async function unfollow(username: string) {
    setPending(true)
    try {
      await unfollowUser({ data: { username } })
      await qc.invalidateQueries({ queryKey: friendsQuery.queryKey })
      toast(`Unfollowed ${username}.`)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setPending(false)
    }
  }

  return { follow, unfollow, pending }
}

export async function copyInvite(username: string) {
  const url = inviteUrl(username)
  try {
    // The share sheet on phones, the clipboard elsewhere.
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      await navigator.share({
        title: 'Spinsight',
        text: 'Compare record collections with me on Spinsight',
        url,
      })
      return
    }
    await navigator.clipboard.writeText(url)
    toast.success('Invite link copied.')
  } catch (e) {
    if ((e as Error).name !== 'AbortError')
      toast.error("Couldn't copy the invite link.")
  }
}

/** Follow toggle for someone's profile. Hidden when signed out or on yourself. */
export function FollowButton({
  username,
  className,
}: {
  username: string
  className?: string
}) {
  const { data: viewer } = useQuery(viewerQuery)
  const { data: activity } = useQuery({ ...friendsQuery, enabled: !!viewer })
  const { follow, unfollow, pending } = useFollow()
  if (!viewer || viewer.username.toLowerCase() === username.toLowerCase())
    return null
  const following = activity?.friends.some(
    (f) => f.username.toLowerCase() === username.toLowerCase(),
  )
  const followsYou = activity?.followers.some(
    (f) => f.username.toLowerCase() === username.toLowerCase(),
  )
  if (following) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => unfollow(username)}
        disabled={pending}
        className={cn('group', className)}
        title="Unfollow"
      >
        <UserCheck />
        <span className="group-hover:hidden">Following</span>
        <span className="hidden group-hover:inline">Unfollow</span>
      </Button>
    )
  }
  return (
    <Button
      size="sm"
      onClick={() => follow(username)}
      disabled={pending || !activity}
      className={cn(
        'bg-record-1 text-record-ink hover:bg-record-1/90',
        className,
      )}
    >
      <UserPlus />
      {followsYou ? 'Follow back' : 'Follow'}
    </Button>
  )
}
