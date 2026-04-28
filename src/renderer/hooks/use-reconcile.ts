import { useMutation, type UseMutationResult } from '@tanstack/react-query'
import type { ReconcileResult } from '@shared/types'

export function useReconcile(): UseMutationResult<ReconcileResult, Error, void> {
  return useMutation({
    mutationFn: () => window.api.reconcile()
  })
}
