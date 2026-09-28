import { queryOptions } from '@tanstack/react-query'
import { getProfile, getViewer } from '#/lib/collection.functions'

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
