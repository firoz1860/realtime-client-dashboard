import { ProjectStatus } from '@prisma/client'
import { z } from 'zod'
import { paginationSchema, uuidSchema } from './common.schema'

export const createProjectBodySchema = z.object({
  name: z.string().trim().min(2).max(150),
  description: z.string().trim().max(3000).optional().nullable(),
  clientId: uuidSchema,
  status: z.nativeEnum(ProjectStatus).optional(),
  createdById: uuidSchema.optional()
})

export const updateProjectBodySchema = z.object({
  name: z.string().trim().min(2).max(150).optional(),
  description: z.string().trim().max(3000).optional().nullable(),
  clientId: uuidSchema.optional(),
  status: z.nativeEnum(ProjectStatus).optional()
}).refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required.' })

export const projectQuerySchema = paginationSchema.extend({
  status: z.nativeEnum(ProjectStatus).optional(),
  clientId: uuidSchema.optional(),
  search: z.string().trim().min(1).max(100).optional()
})
