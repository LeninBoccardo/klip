import { randomUUID } from 'crypto'
import type { IIdGenerator } from '@domain/ports'

export class NodeIdGenerator implements IIdGenerator {
  generate(): string {
    return randomUUID()
  }
}
