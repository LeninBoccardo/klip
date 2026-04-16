import { useMutation } from '@tanstack/react-query'

export function useReconcile() {
  return useMutation({
    mutationFn: () => window.api.reconcile()
  })
}
