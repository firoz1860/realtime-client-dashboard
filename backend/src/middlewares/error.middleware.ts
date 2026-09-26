import type { ErrorRequestHandler } from 'express'
import { Prisma } from '@prisma/client'
import { ZodError } from 'zod'
import { logger } from '../lib/logger'
import { AppError } from '../utils/app-error'

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(422).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Request validation failed.', details: error.issues }
    })
    return
  }

  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      success: false,
      error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) }
    })
    return
  }

  if (error instanceof SyntaxError && 'status' in error && error.status === 400) {
    res.status(400).json({ success: false, error: { code: 'INVALID_JSON', message: 'Request body contains invalid JSON.' } })
    return
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      res.status(409).json({ success: false, error: { code: 'CONFLICT', message: 'A unique value already exists.' } })
      return
    }
    if (error.code === 'P2003') {
      res.status(409).json({ success: false, error: { code: 'RELATION_CONFLICT', message: 'This resource is still referenced by another record.' } })
      return
    }
    if (error.code === 'P2025') {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Requested resource was not found.' } })
      return
    }
  }

  logger.error({ err: error }, 'Unhandled request error')
  res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'An unexpected server error occurred.' } })
}
