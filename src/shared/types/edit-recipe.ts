import { z } from 'zod'

/**
 * The unit of work the editor produces and the render backend consumes.
 *
 * `EditRecipe` is plumbed *as a single value* through the IPC boundary,
 * the use-case, the queue, the backend, the on-disk sidecar (`cut-data.json`),
 * and the DB mirror (`cuts.edit_recipe_json`). MVP only ever constructs and
 * supports recipes shaped like `[{ type: 'trim', ... }]`. The reserved op
 * variants below exist in the type union from day one so v2 (multi-segment,
 * filters, smart-cut backend) is additive code, not a churning rewrite.
 *
 * Forward-compat contract: backends MUST `canRender()`-reject unknown ops
 * with an explicit reason rather than silently dropping them. See
 * `IRenderBackend` and the `forward-compat sentinel` test for the contract.
 *
 * Co-located Zod + TS: this DTO is validated at three boundaries (IPC,
 * sidecar JSON read, DB JSON column read) so a single canonical schema is
 * worth the small style departure from `ipc-schemas.ts`.
 */

// Upper bound on any timestamp field. 24h covers every realistic source
// klip touches (long stream archives, lectures); rejects garbage like
// `1e308` or `Infinity` that would otherwise be coerced through ffmpeg.
const MAX_SECONDS = 86_400

const trimOpSchema = z
  .object({
    type: z.literal('trim'),
    in: z.number().finite().min(0).max(MAX_SECONDS),
    out: z.number().finite().min(0).max(MAX_SECONDS)
  })
  .strict()

const concatSegmentSchema = z
  .object({
    sourceVideoId: z.string().min(1).max(256),
    in: z.number().finite().min(0).max(MAX_SECONDS),
    out: z.number().finite().min(0).max(MAX_SECONDS)
  })
  .strict()

const concatOpSchema = z
  .object({
    type: z.literal('concat'),
    segments: z.array(concatSegmentSchema).min(1).max(64)
  })
  .strict()

const muteOpSchema = z.object({ type: z.literal('mute') }).strict()

const cropOpSchema = z
  .object({
    type: z.literal('crop'),
    x: z.number().finite().min(0),
    y: z.number().finite().min(0),
    w: z.number().finite().positive(),
    h: z.number().finite().positive()
  })
  .strict()

const speedOpSchema = z
  .object({
    type: z.literal('speed'),
    factor: z.number().finite().positive()
  })
  .strict()

const fadeOpSchema = z
  .object({
    type: z.literal('fade'),
    durationMs: z.number().finite().positive(),
    kind: z.enum(['in', 'out'])
  })
  .strict()

export const editOpSchema = z.discriminatedUnion('type', [
  trimOpSchema,
  concatOpSchema,
  muteOpSchema,
  cropOpSchema,
  speedOpSchema,
  fadeOpSchema
])

export type EditOp = z.infer<typeof editOpSchema>

export const editRecipeSchema = z
  .object({
    version: z.literal(1),
    sourceVideoId: z.string().min(1).max(256),
    ops: z.array(editOpSchema).min(1).max(64),
    output: z
      .object({
        container: z.enum(['mp4', 'webm', 'mkv']),
        mode: z.enum(['copy', 'reencode'])
      })
      .strict()
  })
  .strict()
  .superRefine((recipe, ctx) => {
    // Cross-field invariant: every interval in the recipe must satisfy
    // `out > in`. Lives on the top-level schema (rather than the discrim-
    // union variants) because Zod's discriminatedUnion only accepts
    // plain ZodObject variants, not refined ones.
    recipe.ops.forEach((op, opIdx) => {
      if (op.type === 'trim' && op.out <= op.in) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ops', opIdx, 'out'],
          message: 'trim.out must be greater than trim.in'
        })
      }
      if (op.type === 'concat') {
        op.segments.forEach((seg, segIdx) => {
          if (seg.out <= seg.in) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['ops', opIdx, 'segments', segIdx, 'out'],
              message: 'concat segment .out must be greater than .in'
            })
          }
        })
      }
    })
  })

export type EditRecipe = z.infer<typeof editRecipeSchema>

/**
 * Predicate matching the MVP-supported subset of the recipe space:
 * a single `trim` op. The editor enforces this on save; the backend
 * uses the same check in `canRender` so unsupported ops fail closed.
 */
export function isMvpSupportedRecipe(recipe: EditRecipe): boolean {
  return recipe.ops.length === 1 && recipe.ops[0].type === 'trim'
}
