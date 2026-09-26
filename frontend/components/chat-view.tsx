'use client'

// Real project chat. Channels are the projects the user can access; messages
// load from the backend and stream live over the project's socket room.
import { useEffect, useRef, useState } from 'react'
import { Search, Send } from 'lucide-react'
import { getAccessToken } from '../lib/api'
import { messageApi, projectApi, taskApi } from '../lib/endpoints'
import { connectSocket, type AppSocket } from '../lib/socket'
import { initials, relativeTime, toneFor } from '../lib/format'
import type { AuthUser, Message } from '../lib/types'

interface Channel { id: string; name: string }

export function ChatView({ user, onToast }: { user: AuthUser | null; onToast: (m: string) => void }) {
  const [channels, setChannels] = useState<Channel[]>([])
  const [activeId, setActiveId] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const socketRef = useRef<AppSocket | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const activeIdRef = useRef('')
  useEffect(() => { activeIdRef.current = activeId }, [activeId])

  // Channels = accessible projects (devs derive them from their assigned tasks).
  useEffect(() => {
    if (!user) return
    let active = true
    const load = async (): Promise<Channel[]> => {
      if (user.role === 'DEVELOPER') {
        const tasks = await taskApi.list()
        const map = new Map<string, string>()
        tasks.forEach((t) => map.set(t.project.id, t.project.name))
        return [...map.entries()].map(([id, name]) => ({ id, name }))
      }
      const projects = await projectApi.list()
      return projects.map((p) => ({ id: p.id, name: p.name }))
    }
    load()
      .then((chs) => { if (active) { setChannels(chs); setActiveId((prev) => prev || (chs[0]?.id ?? '')) } })
      .catch(() => { if (active) setChannels([]) })
    return () => { active = false }
  }, [user])

  // One socket for live messages.
  useEffect(() => {
    const token = getAccessToken()
    if (!token) return
    const socket = connectSocket(token)
    socketRef.current = socket
    // Re-join the active room on every (re)connect so a network blip doesn't
    // silently drop the user out of the room and stop live delivery.
    const rejoin = () => { if (activeIdRef.current) socket.emit('project:join', activeIdRef.current, () => undefined) }
    socket.on('connect', rejoin)
    socket.on('message:new', (msg) => {
      if (msg.projectId && msg.projectId !== activeIdRef.current) return
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
    })
    return () => { socket.off('connect', rejoin); socket.removeAllListeners('message:new'); socket.disconnect(); socketRef.current = null }
  }, [])

  // Load history + join the room for the active channel.
  useEffect(() => {
    if (!activeId) { setMessages([]); return }
    let active = true
    setLoading(true)
    messageApi.list(activeId)
      .then((ms) => { if (active) { setMessages(ms); setLoading(false) } })
      .catch(() => { if (active) { setMessages([]); setLoading(false) } })
    const socket = socketRef.current
    const join = () => socket?.emit('project:join', activeId, () => undefined)
    if (socket) { if (socket.connected) join(); else socket.once('connect', join) }
    return () => { active = false; socket?.emit('project:leave', activeId) }
  }, [activeId])

  useEffect(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight }, [messages])

  const send = async () => {
    const text = draft.trim()
    if (!text || !activeId) return
    setSending(true)
    try {
      const msg = await messageApi.create(activeId, text)
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
      setDraft('')
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Could not send message.')
    } finally { setSending(false) }
  }

  const filtered = channels.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
  const activeChannel = channels.find((c) => c.id === activeId)

  return (
    <div className="chat-layout">
      <div className="chat-sidebar">
        <label className="mini-search"><Search size={15} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search channels…" aria-label="Search channels" /></label>
        <div className="chat-section-label"><span>Project channels</span></div>
        {filtered.length ? filtered.map((c) => (
          <button key={c.id} type="button" className={`chat-channel ${c.id === activeId ? 'active' : ''}`} onClick={() => setActiveId(c.id)}>
            <span className={`channel-icon ${toneFor(c.id)}`}>{c.name.charAt(0).toUpperCase()}</span>
            <span><strong>{c.name}</strong><small>Project chat</small></span>
          </button>
        )) : <div className="activity-empty-row">No channels available.</div>}
      </div>
      <div className="chat-conversation">
        <div className="conversation-head"><div><h3>{activeChannel?.name ?? 'Select a channel'}</h3><p>Real-time project chat</p></div></div>
        <div className="message-list" ref={listRef}>
          {loading ? <div className="activity-empty-row">Loading messages…</div>
            : messages.length ? messages.map((m) => (
              <div className="chat-message" key={m.id}>
                <span className={`member-avatar ${toneFor(m.sender?.id ?? m.id)}`}>{initials(m.sender?.name ?? '?')}</span>
                <div>
                  <div className="message-meta"><strong>{m.sender?.name ?? 'Someone'}</strong><time>{relativeTime(m.createdAt)}</time></div>
                  <p>{m.body}</p>
                </div>
              </div>
            )) : <div className="activity-empty-row">No messages yet. Say hello 👋</div>}
        </div>
        <div className="chat-composer">
          <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void send() } }} placeholder={activeChannel ? `Message ${activeChannel.name}…` : 'Select a channel first'} disabled={!activeId} aria-label="Message input" />
          <button className="send-message" type="button" onClick={() => void send()} disabled={sending || !draft.trim() || !activeId} aria-label="Send message"><Send size={15} /></button>
        </div>
      </div>
    </div>
  )
}
