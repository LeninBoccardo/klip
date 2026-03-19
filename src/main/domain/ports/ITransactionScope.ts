/**
 * Abstraction over database transaction management.
 * Implementations wrap a synchronous function in an atomic transaction.
 */
export interface ITransactionScope {
  /** Run `fn` inside a transaction. Commits on success, rolls back on error. */
  run<T>(fn: () => T): T
}
