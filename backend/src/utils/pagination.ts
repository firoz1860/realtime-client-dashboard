import type { PaginationMeta } from '../types/pagination'

export const paginationMeta = (page: number, limit: number, total: number): PaginationMeta => ({
  page,
  limit,
  total,
  totalPages: Math.ceil(total / limit)
})
