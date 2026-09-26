import { z } from 'zod'

export const loginBodySchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128)
})

export const updateProfileBodySchema = z.strictObject({
  name: z.string().trim().min(2).max(100)
})
