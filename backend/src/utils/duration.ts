import { AppError } from './app-error'

export const durationToMs = (value: string): number => {
  const match = /^(\d+)(s|m|h|d)$/.exec(value)
  if (!match) throw new AppError(500, 'CONFIG_ERROR', `Unsupported duration: ${value}`)
  const amount = Number(match[1])
  const unit = match[2]
  const multiplier = unit === 's' ? 1000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000
  return amount * multiplier
}
