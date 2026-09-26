import { TaskPriority, TaskStatus } from '@prisma/client'
import { z } from 'zod'
import { paginationSchema, uuidSchema } from './common.schema'

const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/
const offsetDateTimePattern = /^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/

const isValidDateOnly = (value: string): boolean => {
  if (!dateOnlyPattern.test(value)) return false
  const [yearText, monthText, dayText] = value.split('-')
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

const isValidOffsetDateTime = (value: string): boolean =>
  offsetDateTimePattern.test(value) && !Number.isNaN(Date.parse(value))

const dateInputSchema = (endOfDay = false) => z.string()
  .refine((value) => isValidDateOnly(value) || isValidOffsetDateTime(value), {
    message: 'Expected YYYY-MM-DD or an ISO datetime with timezone offset.'
  })
  .transform((value) => {
    if (!dateOnlyPattern.test(value)) return new Date(value)
    return new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`)
  })

const optionalDate = dateInputSchema().optional().nullable()

export const createTaskBodySchema = z.object({
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(5000).optional().nullable(),
  assignedDeveloperId: uuidSchema.optional().nullable(),
  status: z.nativeEnum(TaskStatus).optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
  dueDate: optionalDate
})

export const updateTaskBodySchema = z.object({
  title: z.string().trim().min(2).max(200).optional(),
  description: z.string().trim().max(5000).optional().nullable(),
  assignedDeveloperId: uuidSchema.optional().nullable(),
  status: z.nativeEnum(TaskStatus).optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
  dueDate: optionalDate,
  version: z.number().int().min(0).optional()
}).refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required.' })

export const taskQuerySchema = paginationSchema.extend({
  status: z.nativeEnum(TaskStatus).optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
  dueDateFrom: dateInputSchema().optional(),
  dueDateTo: dateInputSchema(true).optional(),
  projectId: uuidSchema.optional(),
  assignedDeveloperId: uuidSchema.optional()
}).refine(
  (value) => !value.dueDateFrom || !value.dueDateTo || value.dueDateFrom <= value.dueDateTo,
  { message: 'dueDateFrom must be before or equal to dueDateTo.', path: ['dueDateFrom'] }
)
