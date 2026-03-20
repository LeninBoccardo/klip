import { eq, sql } from 'drizzle-orm'
import type { AppDatabase } from '@main/framework-drivers/database'
import { operations } from '@main/framework-drivers/database/schema'
import type { Operation, OperationStatus } from '@domain/entities'
import type { IOperationRepository } from '@domain/repositories'

export class SqliteOperationRepository implements IOperationRepository {
  constructor(private db: AppDatabase) {}

  create(operation: Operation): void {
    this.db
      .insert(operations)
      .values({
        id: operation.id,
        type: operation.type,
        status: operation.status,
        payload: operation.payload,
        error: operation.error,
        startedAt: operation.startedAt,
        completedAt: operation.completedAt,
        createdAt: operation.createdAt
      })
      .run()
  }

  findById(id: string): Operation | null {
    const row = this.db.select().from(operations).where(eq(operations.id, id)).get()
    return row ? mapRowToOperation(row) : null
  }

  findByStatus(status: OperationStatus): Operation[] {
    return this.db
      .select()
      .from(operations)
      .where(eq(operations.status, status))
      .all()
      .map(mapRowToOperation)
  }

  updateStatus(id: string, status: OperationStatus, error?: string | null): void {
    const now = new Date().toISOString()
    const isTerminal = status === 'completed' || status === 'failed' || status === 'rolled_back'

    this.db
      .update(operations)
      .set({
        status,
        error: error ?? null,
        startedAt: status === 'in_progress' ? now : sql`started_at`,
        completedAt: isTerminal ? now : sql`completed_at`
      })
      .where(eq(operations.id, id))
      .run()
  }

  updatePayload(id: string, payload: string): void {
    this.db.update(operations).set({ payload }).where(eq(operations.id, id)).run()
  }
}

// ── Internal helpers ──

function mapRowToOperation(row: typeof operations.$inferSelect): Operation {
  return {
    id: row.id,
    type: row.type as Operation['type'],
    status: row.status as OperationStatus,
    payload: row.payload,
    error: row.error,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    createdAt: row.createdAt
  }
}
