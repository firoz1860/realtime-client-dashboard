import type { RequestHandler } from 'express'
import type { ZodType } from 'zod'

export type ValidationSchemas = {
  body?: ZodType
  query?: ZodType
  params?: ZodType
}

export const validate = (schemas: ValidationSchemas): RequestHandler => (req, _res, next) => {
  if (schemas.body) req.body = schemas.body.parse(req.body)
  if (schemas.query) {
    const parsedQuery = schemas.query.parse(req.query)
    Object.defineProperty(req, 'query', {
      value: parsedQuery,
      configurable: true,
      enumerable: true,
      writable: true
    })
  }
  if (schemas.params) req.params = schemas.params.parse(req.params) as typeof req.params
  next()
}
