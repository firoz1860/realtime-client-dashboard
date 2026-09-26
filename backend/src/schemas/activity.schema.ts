import { z } from 'zod'
import { paginationSchema, uuidSchema } from './common.schema'

export const activityQuerySchema = paginationSchema.extend({
  projectId: uuidSchema.optional(),
  taskId: uuidSchema.optional()
})

export const recentActivityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20)
})
