'use client'

// Project chat. Channels are the projects the user can access; history loads
// from the API and new messages stream over the shared workspace socket.
import { useEffect, useRef, useState } from 'react'
import { Hash, Search, Send } from 'lucide-react'
import { messageApi, projectApi, taskApi } from '../lib/endpoints'
import type { AppSocket } from '../lib/socket'
import { initials, relativeTime, toneFor } from '../lib/format'
import type { AuthUser, Message } from '../lib/types'

interface Channel { id: string; name: string }

export function ChatView({ user, socket, onToast }: { user: AuthUser | null; socket: AppSocket | null; onToast: (m: string) => void }) {
  const [channels, setChannels] = useState<Channel[]>([])
  const [channelsLoading, setChannelsLoading] = useState(true)
  const [activeId, setActiveId] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const activeIdRef = useRef('')
  useEffect(() => { activeIdRef.current = activeId }, [activeId])

  // Channels = accessible projects (developers derive them from assigned tasks).
  useEffect(() => {
    if (!user) { setChannelsLoading(false); return }
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
      .finally(() => { if (active) setChannelsLoading(false) })
    return () => { active = false }
  }, [user])

  // Live messages for the active channel. The workspace socket already joins
  // every accessible room; joining again here covers projects created after connect.
  useEffect(() => {
    if (!socket) return
    const onMessage = (msg: Message) => {
      if (msg.projectId !== activeIdRef.current) return
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
    }
    const rejoin = () => { if (activeIdRef.current) socket.emit('project:join', activeIdRef.current, () => undefined) }
    socket.on('message:new', onMessage)
    socket.on('connect', rejoin)
    return () => { socket.off('message:new', onMessage); socket.off('connect', rejoin) }
  }, [socket])

  // History for the active channel.
  useEffect(() => {
    if (!activeId) { setMessages([]); return }
    let active = true
    setLoading(true)
    setError(null)
    setMessages([])
    messageApi.list(activeId)
      .then((ms) => { if (active) setMessages([...ms].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))) })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'Could not load messages.') })
      .finally(() => { if (active) setLoading(false) })
    if (socket?.connected) socket.emit('project:join', activeId, () => undefined)
    return () => { active = false }
  }, [activeId, socket])

  useEffect(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight }, [messages])

  const send = async () => {
    const text = draft.trim()
    if (!text || !activeId || sending) return
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
    <div className="chat">
      <aside className="chat-channels">
        <label className="field-search"><Search size={15} aria-hidden /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a project" aria-label="Find a project channel" /></label>
        <p className="chat-channels-title">Project channels</p>
        <div className="chat-channel-list">
          {channelsLoading ? <p className="muted-note">Loading channels…</p>
            : filtered.length ? filtered.map((c) => (
              <button key={c.id} type="button" className={`chat-channel ${c.id === activeId ? 'is-active' : ''}`} onClick={() => setActiveId(c.id)} aria-current={c.id === activeId ? 'true' : undefined}>
                <span className={`chip-icon tone-${toneFor(c.id)}`}><Hash size={14} /></span>
                <span className="chat-channel-name">{c.name}</span>
              </button>
            )) : <p className="muted-note">{user ? 'Channels appear here once you are part of a project.' : 'Log in to see your project channels.'}</p>}
        </div>
      </aside>
      <section className="chat-thread" aria-label="Conversation">
        <header className="chat-thread-head">
          <h3>{activeChannel?.name ?? 'No channel selected'}</h3>
          <span className={`live-state ${socket?.connected ? 'is-live' : ''}`}>{socket?.connected ? 'Connected' : 'Connecting…'}</span>
        </header>
        <div className="chat-messages" ref={listRef} aria-live="polite">
          {loading ? <p className="muted-note">Loading messages…</p>
            : error ? <p className="form-error" role="alert">{error}</p>
            : messages.length ? messages.map((m) => {
              const mine = (m.senderId ?? m.sender?.id) === user?.id
              return (
                <div className={`chat-message ${mine ? 'is-mine' : ''}`} key={m.id}>
                  <span className={`avatar tone-${toneFor(m.sender?.id ?? m.id)}`}>{initials(m.sender?.name ?? '?')}</span>
                  <div className="chat-bubble">
                    <div className="chat-meta"><strong>{mine ? 'You' : m.sender?.name ?? 'Someone'}</strong><time dateTime={m.createdAt}>{relativeTime(m.createdAt)}</time></div>
                    <p>{m.body}</p>
                  </div>
                </div>
              )
            }) : <p className="muted-note">{activeId ? 'No messages yet. Start the conversation below.' : 'Pick a project channel to read and send messages.'}</p>}
        </div>
        <form className="chat-composer" onSubmit={(e) => { e.preventDefault(); void send() }}>
          <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={2000} placeholder={activeChannel ? `Message ${activeChannel.name}` : 'Select a channel first'} disabled={!activeId} aria-label="Message" />
          <button className="btn btn-primary btn-icon" type="submit" disabled={sending || !draft.trim() || !activeId} aria-label="Send message"><Send size={16} /></button>
        </form>
      </section>
    </div>
  )
}
