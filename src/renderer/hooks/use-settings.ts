import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult
} from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'

export function useSettings(): UseQueryResult<Record<string, string>, Error> {
  return useQuery({
    queryKey: queryKeys.settings.all,
    queryFn: () => window.api.getSettings()
  })
}

export function useSetting(key: string): UseQueryResult<string | null, Error> {
  return useQuery({
    queryKey: queryKeys.settings.detail(key),
    queryFn: () => window.api.getSetting(key)
  })
}

export function useSetSetting(): UseMutationResult<void, Error, { key: string; value: string }> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      window.api.setSetting(key, value),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.settings.all })
  })
}
