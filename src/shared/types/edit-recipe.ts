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

const trimOpSchema = z.object({
  type: z.literal('trim'),
  in: z.number().min(0),
  out: z.number().min(0)
})

const concatOpSchema = z.object({
  type: z.literal('concat'),
  segments: z
    .array(
      z.object({
        sourceVideoId: z.string().min(1),
        in: z.number().min(0),
        out: z.number().min(0)
      })
    )
    .min(1)
    .max(64)
})

const muteOpSchema = z.object({ type: z.literal('mute') })

const cropOpSchema = z.object({
  type: z.literal('crop'),
  x: z.number().min(0),
  y: z.number().min(0),
  w: z.number().positive(),
  h: z.number().positive()
})

const speedOpSchema = z.object({
  type: z.literal('speed'),
  factor: z.number().positive()
})

const fadeOpSchema = z.object({
  type: z.literal('fade'),
  durationMs: z.number().positive(),
  kind: z.enum(['in', 'out'])
})

export const editOpSchema = z.discriminatedUnion('type', [
  trimOpSchema,
  concatOpSchema,
  muteOpSchema,
  cropOpSchema,
  speedOpSchema,
  fadeOpSchema
])

export type EditOp = z.infer<typeof editOpSchema>

export const editRecipeSchema = z.object({
  version: z.literal(1),
  sourceVideoId: z.string().min(1),
  ops: z.array(editOpSchema).min(1).max(64),
  output: z.object({
    container: z.enum(['mp4', 'webm', 'mkv']),
    mode: z.enum(['copy', 'reencode'])
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
