import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getNowPlaying,
  getProfile,
  getTracklist,
  getTracklists,
  getViewer,
} from '#/lib/collection.functions'
import {
  getFriendFollows,
  getFriendRecentSpins,
  getFriendsCrates,
  getFriendsLeaderboard,
  getFriendsLive,
  getWantlist,
} from '#/lib/friends.functions'

export const viewerQuery = queryOptions({
  queryKey: ['viewer'],
  queryFn: () => getViewer(),
  staleTime: 5 * 60_000,
})

export const profileQuery = (username: string) =>
  queryOptions({
    queryKey: ['profile', username.toLowerCase()],
    queryFn: () => getProfile({ data: { username } }),
    staleTime: 60_000,
  })

/** A record's tracklist, loaded when it's opened (not part of the profile). */
export const tracklistQuery = (releaseId: number) =>
  queryOptions({
    queryKey: ['tracklist', releaseId],
    queryFn: () => getTracklist({ data: { releaseId } }),
    staleTime: 10 * 60_000,
  })

/**
 * Every tracklist in a collection, fetched once the collection has loaded and
 * copied into each record's `tracklistQuery`, so records open instantly.
 */
export function usePrefetchTracklists(username: string, releaseIds: number[]) {
  const qc = useQueryClient()
  useQuery({
    queryKey: ['tracklists', username.toLowerCase()],
    queryFn: async () => {
      const lists = await getTracklists({ data: { releaseIds } })
      for (const [id, tracks] of Object.entries(lists))
        qc.setQueryData(tracklistQuery(Number(id)).queryKey, tracks)
      return true
    },
    enabled: releaseIds.length > 0,
    staleTime: 10 * 60_000,
  })
}

/** The signed-in user's current spin. Polled so it ends on its own. */
export const nowPlayingQuery = queryOptions({
  queryKey: ['now-playing'],
  queryFn: () => getNowPlaying(),
  staleTime: 30_000,
  refetchInterval: 60_000,
})

/** Every friends query starts with this: invalidate it after a follow. */
export const FRIENDS_KEY = ['friends'] as const

/** The Friends tab: who you follow and what they're spinning. Polled. */
export const friendsQuery = queryOptions({
  queryKey: [...FRIENDS_KEY, 'live'],
  queryFn: () => getFriendsLive(),
  staleTime: 30_000,
})

/** This week's leaderboard on the Friends tab. */
export const friendsLeaderboardQuery = queryOptions({
  queryKey: [...FRIENDS_KEY, 'leaderboard'],
  queryFn: () => getFriendsLeaderboard(),
  staleTime: 60_000,
})

/** Friends' collection sizes, new additions and your wants they own. */
export const friendsCratesQuery = queryOptions({
  queryKey: [...FRIENDS_KEY, 'crates'],
  queryFn: () => getFriendsCrates(),
  staleTime: 5 * 60_000,
})

/** Who you follow and who follows you, for Follow buttons. */
export const friendFollowsQuery = queryOptions({
  queryKey: [...FRIENDS_KEY, 'follows'],
  queryFn: () => getFriendFollows(),
  staleTime: 60_000,
})

/** Friends' spins in the last two weeks, for the picker. */
export const friendRecentSpinsQuery = queryOptions({
  queryKey: [...FRIENDS_KEY, 'recent-spins'],
  queryFn: () => getFriendRecentSpins(),
  staleTime: 60_000,
})

export const wantlistQuery = (username: string) =>
  queryOptions({
    queryKey: ['wantlist', username.toLowerCase()],
    queryFn: () => getWantlist({ data: { username } }),
    staleTime: 5 * 60_000,
  })
