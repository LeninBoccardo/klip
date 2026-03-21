/**
 * Abstraction over unique ID generation.
 * Allows use-cases to generate IDs without importing Node's crypto module.
 */
export interface IIdGenerator {
  /** Generate a new unique identifier (UUID v4) */
  generate(): string
}
