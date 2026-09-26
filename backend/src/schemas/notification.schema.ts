import { z } from 'zod'
import { paginationSchema } from './common.schema'

export const notificationQuerySchema = paginationSchema.extend({
  isRead: z.enum(['true', 'false']).transform((value) => value === 'true').optional()
})
