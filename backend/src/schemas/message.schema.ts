import { z } from 'zod'
import { paginationSchema } from './common.schema'

export const createMessageBodySchema = z.object({
  body: z.string().trim().min(1).max(2000)
})

export const messageQuerySchema = paginationSchema
