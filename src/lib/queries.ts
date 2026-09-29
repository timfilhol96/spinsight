import { queryOptions } from '@tanstack/react-query'
import {
  getNowPlaying,
  getProfile,
  getViewer,
} from '#/lib/collection.functions'
import { getFriendsActivity, getWantlist } from '#/lib/friends.functions'

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

/** The signed-in user's current spin. Polled so it ends on its own. */
export const nowPlayingQuery = queryOptions({
  queryKey: ['now-playing'],
  queryFn: () => getNowPlaying(),
  staleTime: 30_000,
  refetchInterval: 60_000,
})

/** The Friends tab: who you follow, what they're spinning, the leaderboard. */
export const friendsQuery = queryOptions({
  queryKey: ['friends'],
  queryFn: () => getFriendsActivity(),
  staleTime: 30_000,
})

export const wantlistQuery = (username: string) =>
  queryOptions({
    queryKey: ['wantlist', username.toLowerCase()],
    queryFn: () => getWantlist({ data: { username } }),
    staleTime: 5 * 60_000,
  })
