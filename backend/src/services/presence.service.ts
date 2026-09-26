class PresenceService {
  private readonly socketsByUser = new Map<string, Set<string>>()

  connect(userId: string, socketId: string): void {
    const sockets = this.socketsByUser.get(userId) ?? new Set<string>()
    sockets.add(socketId)
    this.socketsByUser.set(userId, sockets)
  }

  disconnect(userId: string, socketId: string): void {
    const sockets = this.socketsByUser.get(userId)
    if (!sockets) return
    sockets.delete(socketId)
    if (sockets.size === 0) this.socketsByUser.delete(userId)
  }

  isOnline(userId: string): boolean {
    return (this.socketsByUser.get(userId)?.size ?? 0) > 0
  }

  count(): number {
    return this.socketsByUser.size
  }

  clear(): void {
    this.socketsByUser.clear()
  }
}

export const presenceService = new PresenceService()
