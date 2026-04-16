import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'

export function useSettings() {
  return useQuery({
    queryKey: queryKeys.settings.all,
    queryFn: () => window.api.getSettings()
  })
}

export function useSetting(key: string) {
  return useQuery({
    queryKey: queryKeys.settings.detail(key),
    queryFn: () => window.api.getSetting(key)
  })
}

export function useSetSetting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      window.api.setSetting(key, value),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.settings.all })
  })
}
