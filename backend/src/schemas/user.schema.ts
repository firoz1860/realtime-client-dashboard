import { Role } from '@prisma/client'
import { z } from 'zod'
import { paginationSchema } from './common.schema'

export const createUserBodySchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().email().transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128),
  role: z.nativeEnum(Role),
  isActive: z.boolean().optional()
})

export const updateUserBodySchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  email: z.string().email().transform((value) => value.toLowerCase()).optional(),
  password: z.string().min(8).max(128).optional(),
  role: z.nativeEnum(Role).optional(),
  isActive: z.boolean().optional()
}).refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required.' })

export const userQuerySchema = paginationSchema.extend({
  role: z.nativeEnum(Role).optional(),
  isActive: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
  search: z.string().trim().min(1).max(100).optional()
})
