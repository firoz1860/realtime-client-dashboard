import { clientRepository } from '../repositories/client.repository'
import { AppError } from '../utils/app-error'
import { paginationMeta } from '../utils/pagination'

export const clientService = {
  list: async (input: { page: number; limit: number; search?: string }) => {
    const result = await clientRepository.list(input)
    return { data: result.data, pagination: paginationMeta(input.page, input.limit, result.total) }
  },
  get: async (id: string) => {
    const client = await clientRepository.findById(id)
    if (!client) throw new AppError(404, 'CLIENT_NOT_FOUND', 'Client was not found.')
    return client
  },
  create: clientRepository.create,
  update: async (id: string, input: Parameters<typeof clientRepository.update>[1]) => {
    if (!(await clientRepository.findById(id))) throw new AppError(404, 'CLIENT_NOT_FOUND', 'Client was not found.')
    return clientRepository.update(id, input)
  },
  remove: async (id: string) => {
    if (!(await clientRepository.findById(id))) throw new AppError(404, 'CLIENT_NOT_FOUND', 'Client was not found.')
    return clientRepository.remove(id)
  }
}
