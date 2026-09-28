import { queryOptions } from '@tanstack/react-query'
import {
  getNowPlaying,
  getProfile,
  getViewer,
} from '#/lib/collection.functions'

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
