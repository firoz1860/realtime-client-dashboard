import { z } from 'zod'
import { paginationSchema } from './common.schema'

export const createClientBodySchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().email().transform((value) => value.toLowerCase()),
  company: z.string().trim().min(1).max(150).optional().nullable(),
  phone: z.string().trim().min(6).max(30).optional().nullable()
})

export const updateClientBodySchema = createClientBodySchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: 'At least one field is required.' }
)

export const clientQuerySchema = paginationSchema.extend({
  search: z.string().trim().min(1).max(100).optional()
})
