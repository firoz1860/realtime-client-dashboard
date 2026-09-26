export function mergeActivity<T extends { id: string; createdAt: string }>(current: T[], incoming: T[], limit: number): T[] {
  const unique = new Map<string, T>()
  for (const item of [...current, ...incoming]) unique.set(item.id, item)
  return [...unique.values()]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, limit)
}
