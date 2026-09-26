'use client'

import { type CSSProperties, useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Command,
  FolderKanban,
  LayoutDashboard,
  Menu,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Plus,
  Play,
  Search,
  Settings,
  Sparkles,
  Target,
  Users,
  X,
  Zap,
} from 'lucide-react'
import { useAuth } from '../lib/auth'
import { useWorkspaceData, type Kpi } from '../lib/useWorkspaceData'
import { useModuleData, type ModuleItem } from '../lib/useModuleData'
import { clientApi, notificationApi, projectApi, taskApi, userApi } from '../lib/endpoints'
import type { AuthUser, Client, Project, TaskStatus, TeamUser } from '../lib/types'
import { activityLine, initials, relativeTime, roleLabel, toneFor } from '../lib/format'
import { ChatView } from '../components/chat-view'

const navItems: { label: string; icon: typeof Target; count?: number }[] = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Projects', icon: FolderKanban },
  { label: 'Tasks', icon: Check },
  { label: 'Chat', icon: MessageSquare },
  { label: 'Team', icon: Users },
  { label: 'Notifications', icon: Bell },
]

function ProgressBar({ value, color = 'blue' }: { value: number; color?: string }) {
  return (
    <div className="progress-track" aria-label={`${value}% complete`}>
      <div className={`progress-fill ${color}`} style={{ width: `${value}%` }} />
    </div>
  )
}

function KpiCard({ label, value, change, icon: Icon, tone }: { label: string; value: string; change?: string; icon: typeof Target; tone: string }) {
  return (
    <div className="kpi-card reveal-up">
      <div className={`kpi-icon ${tone}`}><Icon size={17} strokeWidth={2.2} /></div>
      <div className="kpi-heading"><span>{label}</span><MoreHorizontal size={16} /></div>
      <div className="kpi-value">{value}</div>
      {change
        ? <div className="kpi-change"><span className="change-pill"><Zap size={11} fill="currentColor" /> {change}</span><span>vs last month</span></div>
        : <div className="kpi-change"><span className="change-pill"><Zap size={11} fill="currentColor" /> Live</span><span>updated in real time</span></div>}
    </div>
  )
}

const KPI_ICONS: Record<Kpi['iconKey'], typeof Target> = {
  projects: FolderKanban,
  tasks: Target,
  users: Users,
  overdue: Clock3,
  progress: Activity,
  review: Check,
  week: CalendarDays,
}

const FALLBACK_KPIS = [
  { label: 'Active projects', value: '24', change: '12.5%', icon: FolderKanban, tone: 'blue' },
  { label: 'Open tasks', value: '128', change: '8.2%', icon: Target, tone: 'purple' },
  { label: 'Team members', value: '42', change: '4.8%', icon: Users, tone: 'orange' },
  { label: 'On-time rate', value: '94.6%', change: '2.4%', icon: Clock3, tone: 'green' },
]

type WorkspaceItem = { title: string; meta: string; tone: string; value: string }

function WorkspaceView({ view, onToast, user, onAddNew }: { view: string; onToast: (message: string) => void; user: AuthUser | null; onAddNew: (view: string) => void }) {
  const moduleData = useModuleData(view, user)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('All status')
  const [statusMenuOpen, setStatusMenuOpen] = useState(false)
  const [dateMenuOpen, setDateMenuOpen] = useState(false)
  const [datePreset, setDatePreset] = useState('This month')
  const [dateFrom, setDateFrom] = useState('2026-09-01')
  const [dateTo, setDateTo] = useState('2026-09-30')
  const [chatChannel, setChatChannel] = useState('Northstar launch room')
  const [chatSearch, setChatSearch] = useState('')
  const [chatMessage, setChatMessage] = useState('')
  const [sentMessages, setSentMessages] = useState<string[]>([])
  const [chatReactions, setChatReactions] = useState<Record<string, number>>({})
  const [pinnedMessage, setPinnedMessage] = useState<string | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [newWorkspaceOpen, setNewWorkspaceOpen] = useState(false)
  const [workspaceName, setWorkspaceName] = useState('')
  const [supportOpen, setSupportOpen] = useState(false)
  const [supportSubject, setSupportSubject] = useState('')
  const [supportMessage, setSupportMessage] = useState('')
  const [settingsTab, setSettingsTab] = useState('General')
  const settingsDetails: Record<string, { title: string; description: string; fields: string[] }> = {
    General: { title: 'Workspace profile', description: 'How your workspace appears to teammates and guests.', fields: ['Workspace name', 'Workspace URL', 'Timezone', 'Default project view'] },
    Profile: { title: 'Profile & preferences', description: 'Personal details, language, timezone, and notification preferences.', fields: ['Full name', 'Display name', 'Language', 'Personal timezone'] },
    Authentication: { title: 'Authentication & security', description: 'Protect sign-in with password policies, sessions, and two-step verification.', fields: ['Password policy', 'Two-step verification', 'Active sessions', 'Sign-in alerts'] },
    Authorization: { title: 'Authorization & roles', description: 'Control what Admins, Managers, Developers, and Guests can access.', fields: ['Default member role', 'Project permissions', 'Guest access', 'Invite permissions'] },
    Notifications: { title: 'Notification preferences', description: 'Choose when Orbit sends email, push, and in-app updates.', fields: ['Mentions and replies', 'Task assignments', 'Deadlines and milestones', 'Weekly workspace digest'] },
  }
  const content: Record<string, { title: string; subtitle: string; items: WorkspaceItem[] }> = {
    Projects: { title: 'Project portfolio', subtitle: 'Manage delivery, owners, clients, and project health.', items: [] },
    Tasks: { title: 'Task command center', subtitle: 'Prioritize work and keep delivery moving.', items: [] },
    Chat: { title: 'Team chat', subtitle: 'Keep project decisions and conversations in one place.', items: [] },
    Team: { title: 'Team workspace', subtitle: 'See availability, ownership, and momentum at a glance.', items: [] },
    Calendar: { title: 'Calendar', subtitle: 'Upcoming milestones, reviews, and deadlines.', items: [] },
    Activity: { title: 'Activity stream', subtitle: 'A live timeline of everything happening in your workspace.', items: [] },
    Notifications: { title: 'Notifications', subtitle: 'Stay on top of mentions, deadlines, and project changes.', items: [] },
    Settings: { title: 'Workspace settings', subtitle: 'Manage your profile, preferences, security, and team access.', items: [] },
    'Help center': { title: 'Help center', subtitle: 'Find answers, contact support, and learn how Orbit works.', items: [{ title: 'Getting started with Orbit', meta: 'Workspace setup and first project guide', tone: 'blue', value: 'Guide' }, { title: 'Managing tasks and projects', meta: 'Workflows, statuses, priorities, and deadlines', tone: 'purple', value: 'Guide' }, { title: 'Roles and permissions', meta: 'Understand access across your workspace', tone: 'orange', value: 'Guide' }, { title: 'Contact support', meta: 'Send a message to the Orbit support team', tone: 'green', value: 'Open' }] },
  }
  const data = content[view]
  const baseItems: ModuleItem[] = moduleData.supported
    ? moduleData.items
    : (data?.items ?? []).map((i, idx) => ({ ...i, id: `${view}-${idx}` }))
  const filteredItems = useMemo(() => baseItems.filter((item) => {
    const matchesQuery = `${item.title} ${item.meta}`.toLowerCase().includes(query.toLowerCase())
    const matchesStatus = status === 'All status' || item.value === status
    return matchesQuery && matchesStatus
  }), [baseItems, query, status])
  const heading = data ?? { title: view, subtitle: `Manage your ${view.toLowerCase()} workspace from one place.` }
  const statuses = ['All status', ...Array.from(new Set(baseItems.map((item) => item.value)))]
  const chatChannels = (data?.items ?? []).filter((item) => item.title.toLowerCase().includes(chatSearch.toLowerCase()) || item.meta.toLowerCase().includes(chatSearch.toLowerCase()))
  // Overview (and any view with neither static content nor a backed fetch) renders no module box.
  if (!data && !moduleData.supported) return null
  // Chat is a bespoke real-time module.
  if (view === 'Chat') return <div className="reveal-up"><ChatView user={user} onToast={onToast} /></div>
  // Settings shows the real signed-in account.
  if (view === 'Settings') return <section className="workspace-view reveal-up"><div className="workspace-view-head"><div><span className="eyebrow-label">Account</span><h2>Settings</h2><p>Your account details and role in this workspace.</p></div></div><div className="settings-fields"><label>Full name<input value={user?.name ?? ''} readOnly /></label><label>Email address<input value={user?.email ?? ''} readOnly /></label><label>Role<input value={roleLabel(user?.role)} readOnly /></label><label>Member since<input value={user?.createdAt ? new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—'} readOnly /></label></div></section>
  return <section className="workspace-view reveal-up">
    <div className="workspace-view-head"><div><span className="eyebrow-label">Workspace module</span><h2>{heading.title}</h2><p>{heading.subtitle}</p></div>{view === 'Notifications' ? <button className="primary-button" onClick={() => { void notificationApi.markAllRead().then(() => { moduleData.refetch(); onToast('All notifications marked as read.') }).catch((err: unknown) => onToast(err instanceof Error ? err.message : 'Could not update notifications.')) }}><Check size={16} /> Mark all read</button> : (view === 'Projects' || view === 'Tasks') ? <button className="primary-button" onClick={() => onAddNew(view)}><Plus size={16} /> Add new</button> : <button className="primary-button" onClick={() => onToast(`${view} is read-only in this build.`)}><Plus size={16} /> Add new</button>}</div>
    <div className="workspace-toolbar"><label className="mini-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Filter ${view.toLowerCase()}...`} aria-label={`Filter ${view.toLowerCase()}`} /></label><div className="date-filter-wrap"><button type="button" className={`filter-button date-filter-button ${dateMenuOpen ? 'open' : ''}`} onClick={() => setDateMenuOpen((open) => !open)} aria-expanded={dateMenuOpen}><CalendarDays size={15} /><span>{datePreset}</span><ChevronDown size={14} /></button>{dateMenuOpen && <div className="date-range-menu" role="dialog" aria-label="Date range filter"><div className="date-menu-head"><div><span className="eyebrow-label">View range</span><strong>Select dates</strong></div><button type="button" className="date-menu-close" onClick={() => setDateMenuOpen(false)} aria-label="Close date range menu">×</button></div><div className="date-presets">{['Today', 'This week', 'This month', 'Last month'].map((preset) => <button type="button" key={preset} className={datePreset === preset ? 'selected' : ''} onClick={() => { setDatePreset(preset); if (preset === 'Today') { setDateFrom('2026-09-26'); setDateTo('2026-09-26') } else if (preset === 'This week') { setDateFrom('2026-09-21'); setDateTo('2026-09-27') } else if (preset === 'Last month') { setDateFrom('2026-08-01'); setDateTo('2026-08-31') } else { setDateFrom('2026-09-01'); setDateTo('2026-09-30') } }}>{preset}</button>)}</div><div className="date-inputs"><label>From<input type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setDatePreset('Custom range') }} /></label><span>→</span><label>To<input type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setDatePreset('Custom range') }} /></label></div><div className="date-menu-footer"><span>{dateFrom} — {dateTo}</span><button type="button" className="primary-button" onClick={() => { setDateMenuOpen(false); onToast(`Date range set to ${datePreset.toLowerCase()}.`) }}>Apply range</button></div></div>}</div><div className="status-filter-wrap"><button type="button" className={`filter-button status-filter-button ${statusMenuOpen ? 'open' : ''}`} onClick={() => setStatusMenuOpen((open) => !open)} aria-expanded={statusMenuOpen}><span>{status}</span><ChevronDown size={14} /></button>{statusMenuOpen && <div className="status-menu" role="menu" aria-label="Filter by status">{statuses.map((option) => <button type="button" role="menuitem" key={option} className={status === option ? 'selected' : ''} onClick={() => { setStatus(option); setStatusMenuOpen(false) }}>{option}<span>{option === 'All status' ? baseItems.length : baseItems.filter((item) => item.value === option).length}</span></button>)}</div>}</div><select aria-hidden="true" tabIndex={-1} className="filter-button duplicate-status-filter" value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by status">{statuses.map((itemStatus) => <option key={itemStatus}>{itemStatus}</option>)}</select></div>
    <div className="workspace-items">{moduleData.loading
      ? <div className="workspace-empty"><Search size={18} /><strong>Loading {view.toLowerCase()}…</strong><span>Fetching live data from the server.</span></div>
      : moduleData.error
      ? <div className="workspace-empty"><X size={18} /><strong>Couldn’t load {view.toLowerCase()}</strong><span>{moduleData.error}</span></div>
      : filteredItems.length ? filteredItems.map((item) => {
        if (item.kind === 'task') return <div className="workspace-item" key={item.id}><div className={`workspace-item-icon ${item.tone}`}><Check size={15} /></div><div className="workspace-item-copy"><strong>{item.title}</strong><span>{item.meta}</span></div><select className="task-status-select" value={item.status} onChange={(event) => { const next = event.target.value as TaskStatus; void taskApi.update(item.id, { status: next }).then(() => { moduleData.refetch(); onToast(`Task moved to ${event.target.selectedOptions[0].text}.`) }).catch((err: unknown) => onToast(err instanceof Error ? err.message : 'Could not update task.')) }} aria-label={`Change status of ${item.title}`}><option value="TODO">To Do</option><option value="IN_PROGRESS">In Progress</option><option value="IN_REVIEW">In Review</option><option value="DONE">Done</option></select></div>
        if (item.kind === 'notification') return <button className={`workspace-item ${item.isRead ? '' : 'is-unread'}`} key={item.id} onClick={() => { if (!item.isRead) void notificationApi.markRead(item.id).then(() => { moduleData.refetch(); onToast('Marked as read.') }).catch(() => undefined) }}><div className={`workspace-item-icon ${item.tone}`}><Bell size={15} /></div><div className="workspace-item-copy"><strong>{item.title}</strong><span>{item.meta}</span></div><span className={`workspace-status ${item.tone}`}>{item.value}</span></button>
        return <button className="workspace-item" key={item.id} onClick={() => onToast(`${item.title} selected.`)}><div className={`workspace-item-icon ${item.tone}`}><Check size={15} /></div><div className="workspace-item-copy"><strong>{item.title}</strong><span>{item.meta}</span></div><span className={`workspace-status ${item.tone}`}>{item.value}</span><MoreHorizontal size={17} className="workspace-more" /></button>
      }) : <div className="workspace-empty"><Search size={18} /><strong>No {view.toLowerCase()} found</strong><span>{moduleData.supported ? 'Nothing here yet — create one with “Add new”.' : 'Try a different search or status filter.'}</span></div>}</div>
  </section>
}

function PublicHome({ onEnter, onAuth }: { onEnter: () => void; onAuth: (mode: 'login' | 'signup' | 'guest') => void }) {
  const [scrollY, setScrollY] = useState(0)

  useEffect(() => {
    let frame = 0
    const handleScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setScrollY(window.scrollY))
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', handleScroll)
    }
  }, [])

  return <main className="public-home" style={{ '--scroll-progress': `${Math.min(scrollY / 700, 1)}`, '--hero-shift': `${scrollY * 0.18}px`, '--hero-tilt': `${scrollY * -0.018}deg`, '--scroll-wave': `${Math.sin(scrollY / 150) * 34}px`, '--scroll-wave-reverse': `${Math.sin(scrollY / 180) * 86}px`, '--scroll-drop': `${Math.sin(scrollY / 210) * 42 + scrollY * 0.08}px`, '--scroll-rotation': `${Math.sin(scrollY / 240) * 3.2}deg` } as CSSProperties}>
    <nav className="public-nav"><div className="public-brand"><span className="brand-mark"><Sparkles size={15} fill="currentColor" /></span> orbit<span>.</span></div><div className="public-links"><button type="button" onClick={() => document.getElementById('product')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Product</button><button type="button" onClick={() => document.getElementById('workflow')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>Workflow</button><button type="button" onClick={() => document.getElementById('stories')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>Stories</button></div><div className="public-actions"><button className="public-login" onClick={() => onAuth('login')}>Log in</button><button className="public-signup" onClick={() => onAuth('signup')}>Sign up free <ArrowRight size={14} /></button></div></nav>
    <section className="public-hero"><div className="hero-copy"><p className="hero-kicker"><span className="kicker-dot" /> The operating system for ambitious teams</p><h1>Make work feel<br /><em>in motion.</em></h1><p className="hero-description">Orbit brings projects, people, and momentum into one beautifully clear workspace.</p><div className="hero-actions"><button className="hero-primary" onClick={() => onAuth('signup')}>Start building free <ArrowRight size={16} /></button><button className="hero-secondary" onClick={onEnter}><Play size={14} fill="currentColor" /> Explore the workspace</button></div><div className="hero-proof"><div className="proof-avatars"><span>MC</span><span>JL</span><span>OP</span><span>+2k</span></div><span>Trusted by teams that ship every week</span></div></div><div className="hero-stage" aria-label="Animated 3D preview of the Orbit workspace"><div className="stage-glow" /><div className="floating-card card-back"><span>Team velocity</span><strong>+24.8%</strong><div className="mini-bars"><i /><i /><i /><i /><i /><i /></div></div><div className="dashboard-3d"><div className="mock-top"><span className="mock-logo">orbit.</span><span className="mock-pill">Live workspace</span></div><div className="mock-title">Good morning, Alex</div><div className="mock-kpis"><span><small>Active projects</small><b>24</b></span><span><small>Tasks shipped</small><b>1,284</b></span><span><small>Team health</small><b>94.6%</b></span></div><div className="mock-chart"><div className="chart-line" /><div className="chart-bars"><i /><i /><i /><i /><i /><i /><i /></div></div><div className="mock-row"><span /><span /><span /></div></div><div className="floating-card card-front"><span>Next milestone</span><strong>Launch review</strong><small>Tomorrow · 09:30</small></div><div className="ai-video-card" aria-label="AI-generated project story preview"><div className="ai-video-head"><span><i /> AI motion preview</span><small>00:24</small></div><div className="ai-video-scene"><div className="scene-orb" /><div className="scene-line line-one" /><div className="scene-line line-two" /><div className="scene-person person-one" /><div className="scene-person person-two" /><div className="scene-caption">From idea<br /><em>to momentum.</em></div><span className="scene-play"><Play size={12} fill="currentColor" /></span></div><div className="ai-video-progress"><span /><i /></div><div className="ai-video-foot"><b>Project story / Northstar</b><span>Generated for your team</span></div></div></div></section>
    <section className="scroll-signal"><span>Scroll to see the system</span><i /></section>
    <section className="public-section" id="product"><div className="section-label">01 / One clear surface</div><div><h2>Everything moves<br /><em>together.</em></h2><p>Orbit is a connected workspace for teams that plan, build, review, and ship together. Replace scattered tools and status meetings with one shared view of the work.</p><div className="content-points"><div><strong>Plan with confidence</strong><span>Turn ideas into projects, milestones, owners, priorities, and realistic deadlines.</span></div><div><strong>Move with context</strong><span>Keep tasks, conversations, files, and decisions connected to the work they belong to.</span></div><div><strong>Lead with visibility</strong><span>Give every teammate the right view while admins control roles, access, and workspace health.</span></div></div></div></section>
    <section className="feature-stage" id="workflow"><div className="feature-orbit orbit-one" /><div className="feature-orbit orbit-two" /><div className="feature-panel"><span className="panel-kicker">The Orbit workflow</span><h3>From first brief<br />to final <em>ship.</em></h3><p className="panel-description">Create a clear path from the first conversation to the final result. Everyone knows what matters now, what is blocked, and what comes next.</p><div className="panel-flow"><span>Brief</span><ArrowRight size={13} /><span>Build</span><ArrowRight size={13} /><span>Review</span><ArrowRight size={13} /><span className="active-flow">Ship</span></div><div className="workflow-details"><span><b>01</b> Assign ownership</span><span><b>02</b> Track momentum</span><span><b>03</b> Celebrate delivery</span></div></div></section>
    <section className="public-cta" id="stories"><p>Ready when your next big idea is.</p><h2>Give your team<br /><em>room to move.</em></h2><button className="hero-primary" onClick={() => onAuth('signup')}>Create your workspace <ArrowRight size={16} /></button></section>
    <footer className="public-footer"><span>orbit<span>.</span></span><span>Projects / People / Momentum</span><span>© 2026 Orbit Studio</span></footer>
  </main>
}

const fmtLocalISO = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const presetRange = (preset: string): { from: string; to: string } => {
  const now = new Date()
  if (preset === 'This month') return { from: fmtLocalISO(new Date(now.getFullYear(), now.getMonth(), 1)), to: fmtLocalISO(new Date(now.getFullYear(), now.getMonth() + 1, 0)) }
  if (preset === 'Last month') return { from: fmtLocalISO(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: fmtLocalISO(new Date(now.getFullYear(), now.getMonth(), 0)) }
  if (preset === 'Last 90 days') { const from = new Date(now); from.setDate(from.getDate() - 90); return { from: fmtLocalISO(from), to: fmtLocalISO(now) } }
  return { from: fmtLocalISO(new Date(now.getFullYear(), 0, 1)), to: fmtLocalISO(new Date(now.getFullYear(), 11, 31)) }
}

export default function Page() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [activeNav, setActiveNav] = useState('Overview')
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [range, setRange] = useState('This month')
  const [overviewDateOpen, setOverviewDateOpen] = useState(false)
  const [overviewFrom, setOverviewFrom] = useState(() => presetRange('This month').from)
  const [overviewTo, setOverviewTo] = useState(() => presetRange('This month').to)
  const [toast, setToast] = useState(false)
  const [toastMessage, setToastMessage] = useState('Workspace action completed.')
  const [newProjectOpen, setNewProjectOpen] = useState(false)
  const [role, setRole] = useState('Admin')
  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [showHome, setShowHome] = useState(true)
  const [authMode, setAuthMode] = useState<'login' | 'signup' | 'guest' | null>(null)
  const [globalSearch, setGlobalSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [projectName, setProjectName] = useState('')
  const [projectClient, setProjectClient] = useState('')
  const [createdProject, setCreatedProject] = useState<string | null>(null)
  const [newWorkspaceOpen, setNewWorkspaceOpen] = useState(false)
  const [workspaceName, setWorkspaceName] = useState('')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')

  const { user, status, login, logout } = useAuth()
  const workspace = useWorkspaceData(user, activeNav === 'Chat')
  const todayLabel = useMemo(() => new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }), [])
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authError, setAuthError] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(false)

  const displayName = user?.name ?? 'Guest user'
  const displayInitials = user ? initials(user.name) : 'GU'
  const firstName = displayName.split(' ')[0]

  // Enter the workspace automatically once a real session is established
  // (fresh login or a session restored from the refresh cookie on reload).
  useEffect(() => {
    if (status === 'authenticated') setShowHome(false)
  }, [status])

  // The role label is driven by the authenticated user, never a client toggle.
  useEffect(() => {
    if (user) setRole(roleLabel(user.role))
  }, [user])

  useEffect(() => {
    const closeMenus = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      // Ignore clicks inside the notification or profile menus (their own buttons toggle them).
      if (target?.closest?.('.notification-wrap') || target?.closest?.('.profile-menu-wrap')) return
      setProfileOpen(false)
      setNotificationsOpen(false)
    }
    const handleEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setProfileOpen(false); setNotificationsOpen(false) } }
    document.addEventListener('click', closeMenus)
    document.addEventListener('keydown', handleEscape)
    return () => { document.removeEventListener('click', closeMenus); document.removeEventListener('keydown', handleEscape) }
  }, [])

  const notify = (message = 'Workspace action completed.') => {
    setToastMessage(message)
    setToast(true)
    window.setTimeout(() => setToast(false), 2600)
  }

  const selectNav = (label: string) => {
    setShowHome(false)
    setActiveNav(label)
    setMobileOpen(false)
    setWorkspaceOpen(false)
    setSearchOpen(false)
    setProfileOpen(false)
    if (label !== 'Overview') {
      setToast(true)
      window.setTimeout(() => setToast(false), 2600)
    }
  }

  const handleLogin = useCallback(async () => {
    if (!authEmail.trim() || !authPassword) { setAuthError('Enter your email and password.'); return }
    setAuthError(null)
    setAuthLoading(true)
    try {
      await login(authEmail.trim(), authPassword)
      setAuthMode(null)
      setShowHome(false)
      setAuthPassword('')
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Login failed.')
    } finally {
      setAuthLoading(false)
    }
  }, [authEmail, authPassword, login])

  const handleSignOut = useCallback(() => {
    void logout()
    setProfileOpen(false)
    setShowHome(true)
    setAuthMode(null)
    setActiveNav('Overview')
    setMobileOpen(false)
  }, [logout])

  // ---- Dynamic create flows (projects / tasks) ----
  const [moduleRefresh, setModuleRefresh] = useState(0)
  const [newTaskOpen, setNewTaskOpen] = useState(false)
  const [taskTitle, setTaskTitle] = useState('')
  const [taskProjectId, setTaskProjectId] = useState('')
  const [taskAssignee, setTaskAssignee] = useState('')
  const [taskPriority, setTaskPriority] = useState('MEDIUM')
  const [taskDue, setTaskDue] = useState('')
  const [projectClientId, setProjectClientId] = useState('')
  const [projectOwnerId, setProjectOwnerId] = useState('')
  const [clientOptions, setClientOptions] = useState<Client[]>([])
  const [pmOptions, setPmOptions] = useState<TeamUser[]>([])
  const [projectOptions, setProjectOptions] = useState<Project[]>([])
  const [devOptions, setDevOptions] = useState<TeamUser[]>([])
  const [createBusy, setCreateBusy] = useState(false)
  const [overviewDeadlines, setOverviewDeadlines] = useState<{ id: string; title: string; project: { name: string }; dueDate: string | null; priority: string }[]>([])
  const [overviewProjects, setOverviewProjects] = useState<Project[]>([])
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({ TODO: 0, IN_PROGRESS: 0, IN_REVIEW: 0, DONE: 0 })

  // Load option lists when a create modal opens.
  useEffect(() => {
    if (!newProjectOpen || !user) return
    void clientApi.list().then(setClientOptions).catch(() => setClientOptions([]))
    if (user.role === 'ADMIN') void userApi.list({ role: 'PROJECT_MANAGER' }).then(setPmOptions).catch(() => setPmOptions([]))
  }, [newProjectOpen, user])

  useEffect(() => {
    if (!newTaskOpen || !user) return
    void projectApi.list().then(setProjectOptions).catch(() => setProjectOptions([]))
    void userApi.developers().then(setDevOptions).catch(() => setDevOptions([]))
  }, [newTaskOpen, user])

  // Real Overview data: upcoming deadlines, project progress, and task-status mix.
  useEffect(() => {
    if (status !== 'authenticated' || !user) return
    const today = new Date().toISOString().slice(0, 10)
    void taskApi.list({ dueDateFrom: today })
      .then((list) => setOverviewDeadlines(list.filter((t) => t.dueDate).sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : 1)).slice(0, 4)))
      .catch(() => setOverviewDeadlines([]))
    void taskApi.list()
      .then((all) => {
        const counts: Record<string, number> = { TODO: 0, IN_PROGRESS: 0, IN_REVIEW: 0, DONE: 0 }
        all.forEach((t) => { counts[t.status] = (counts[t.status] ?? 0) + 1 })
        setStatusCounts(counts)
      })
      .catch(() => undefined)
    if (user.role !== 'DEVELOPER') {
      void projectApi.list().then(setOverviewProjects).catch(() => setOverviewProjects([]))
    } else {
      setOverviewProjects([])
    }
  }, [status, user, moduleRefresh])

  const handleAddNew = useCallback((v: string) => {
    if (v === 'Projects') setNewProjectOpen(true)
    else if (v === 'Tasks') setNewTaskOpen(true)
    else notify(`${v} is read-only in this build.`)
  }, [])

  const handleCreateProject = useCallback(async () => {
    if (!projectName.trim() || !projectClientId) { notify('Project name and client are required.'); return }
    if (user?.role === 'ADMIN' && !projectOwnerId) { notify('Select a project owner (a project manager).'); return }
    setCreateBusy(true)
    try {
      await projectApi.create({
        name: projectName.trim(),
        clientId: projectClientId,
        ...(user?.role === 'ADMIN' ? { createdById: projectOwnerId } : {}),
      })
      setCreatedProject(projectName.trim())
      setNewProjectOpen(false); setProjectName(''); setProjectClient(''); setProjectClientId(''); setProjectOwnerId('')
      setModuleRefresh((n) => n + 1)
      notify('Project created.')
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not create project.')
    } finally { setCreateBusy(false) }
  }, [projectName, projectClientId, projectOwnerId, user])

  const handleCreateTask = useCallback(async () => {
    if (!taskTitle.trim() || !taskProjectId) { notify('Task title and project are required.'); return }
    setCreateBusy(true)
    try {
      await taskApi.create(taskProjectId, {
        title: taskTitle.trim(),
        priority: taskPriority,
        assignedDeveloperId: taskAssignee || null,
        dueDate: taskDue || null,
      })
      setNewTaskOpen(false); setTaskTitle(''); setTaskProjectId(''); setTaskAssignee(''); setTaskDue(''); setTaskPriority('MEDIUM')
      setModuleRefresh((n) => n + 1)
      notify('Task created.')
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not create task.')
    } finally { setCreateBusy(false) }
  }, [taskTitle, taskProjectId, taskPriority, taskAssignee, taskDue])

  if (showHome) return <><PublicHome onEnter={() => setShowHome(false)} onAuth={setAuthMode} />{authMode && <div className="auth-preview-backdrop" onClick={() => setAuthMode(null)}><section className="auth-preview" role="dialog" aria-modal="true" aria-labelledby="auth-title" onClick={(event) => event.stopPropagation()}><button className="auth-preview-close" onClick={() => setAuthMode(null)} aria-label="Close authentication dialog">×</button><span className="hero-kicker"><span className="kicker-dot" /> Orbit workspace</span><h2 id="auth-title">{authMode === 'login' ? 'Welcome back.' : authMode === 'signup' ? 'Start moving.' : 'Guest preview'}</h2><p>{authMode === 'login' ? 'Log in to continue to your workspace.' : authMode === 'signup' ? 'Sign in with a seeded account to explore the live workspace.' : 'Explore the workspace with sample data.'}</p>{authMode !== 'guest' ? <form onSubmit={(event) => { event.preventDefault(); void handleLogin() }}><label>Email address<input type="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} placeholder="you@company.com" autoComplete="username" autoFocus /></label><label>Password<input type="password" value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} placeholder="At least 8 characters" autoComplete="current-password" /></label>{authError && <div className="auth-error" role="alert">{authError}</div>}<button type="submit" className="hero-primary auth-submit" disabled={authLoading}>{authLoading ? 'Signing in…' : 'Log in to Orbit'} <ArrowRight size={16} /></button><button type="button" className="guest-login-button" onClick={() => setAuthMode('guest')}>Continue as guest</button><small className="auth-seed-hint">Seed logins — Admin: admin@dashboard.test / Admin123! · PM: pm1@dashboard.test / Manager123! · Dev: dev1@dashboard.test / Developer123!</small></form> : <><div className="guest-note"><span className="kicker-dot" /><div><strong>Guest preview</strong><small>Explore the workspace with sample project data. Nothing will be saved and no live backend data is loaded.</small></div></div><button className="hero-primary auth-submit" onClick={() => { setAuthMode(null); setShowHome(false); notify() }}>Continue as guest <ArrowRight size={16} /></button></>}<small>Guest access is a UI preview only. Live data requires signing in.</small></section></div>}</>

  return (
  <main className="dashboard-shell">
      <div className={`mobile-backdrop ${mobileOpen ? 'show' : ''}`} onClick={() => setMobileOpen(false)} />
      <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
        <div className="brand"><div className="brand-mark"><Sparkles size={16} fill="currentColor" /></div><span>orbit<span className="brand-dot">.</span></span></div>
        <button className="workspace-switcher" onClick={() => setWorkspaceOpen(!workspaceOpen)} aria-expanded={workspaceOpen}><div className="workspace-avatar">O</div><div><strong>Orbit Studio</strong><small>Workspace</small></div><ChevronDown size={14} /></button>{workspaceOpen && <div className="workspace-menu"><button onClick={() => { setWorkspaceOpen(false); notify() }}>Orbit Studio <span>Active</span></button><button onClick={() => { setWorkspaceOpen(false); notify() }}>Arcade Labs <span>Switch</span></button><button onClick={() => { setWorkspaceOpen(false); setNewWorkspaceOpen(true) }}><Plus size={13} /> New workspace</button></div>}
        <nav className="sidebar-nav" aria-label="Main navigation">
          <p className="nav-label">Workspace</p>
          {navItems.map(({ label, icon: Icon, count }) => <button type="button" key={label} title={label} className={`nav-item ${activeNav === label ? 'active' : ''}`} onClick={(event) => { event.preventDefault(); event.stopPropagation(); selectNav(label) }} aria-current={activeNav === label ? 'page' : undefined}><Icon size={17} /><span>{label}</span>{(() => { const badge = label === 'Notifications' ? workspace.unread : label === 'Chat' ? workspace.chatUnread : count; return badge ? <b>{badge}</b> : null })()}</button>)}
          <p className="nav-label projects-label">Manage</p>
          <button title="Calendar" className={`nav-item ${activeNav === 'Calendar' ? 'active' : ''}`} onClick={() => selectNav('Calendar')} aria-current={activeNav === 'Calendar' ? 'page' : undefined}><CalendarDays size={17} /><span>Calendar</span></button>
          <button title="Activity" className={`nav-item ${activeNav === 'Activity' ? 'active' : ''}`} onClick={() => selectNav('Activity')} aria-current={activeNav === 'Activity' ? 'page' : undefined}><Activity size={17} /><span>Activity</span><span className="live-dot" /></button>
        </nav>
        <div className="sidebar-bottom"><button title="Settings" className={`nav-item ${activeNav === 'Settings' ? 'active' : ''}`} onClick={() => selectNav('Settings')} aria-current={activeNav === 'Settings' ? 'page' : undefined}><Settings size={17} /><span>Settings</span></button><button title="Help center" className={`nav-item ${activeNav === 'Help center' ? 'active' : ''}`} onClick={() => selectNav('Help center')} aria-current={activeNav === 'Help center' ? 'page' : undefined}><CircleHelp size={17} /><span>Help center</span></button><div className="profile"><div className="profile-avatar">{displayInitials}</div><div><strong>{displayName}</strong><small>{role}</small></div><select className="role-select" value={role} onChange={(event) => setRole(event.target.value)} aria-label="Switch role" title="Role is set by your account; this is display only"><option>Admin</option><option>Project Manager</option><option>Developer</option></select></div></div>
      </aside>

      <section className="main-area">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMobileOpen(!mobileOpen)} aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={mobileOpen}><Menu size={20} /></button>
          <div className="breadcrumbs" aria-label={`Workspace > ${activeNav}`}><span>Workspace</span><ChevronRight size={14} aria-hidden="true" /><strong>{activeNav}</strong></div>
          <div className="top-actions">
            <div className={`header-search ${searchOpen ? 'focused' : ''}`}><Search size={16} /><input value={globalSearch} onFocus={() => setSearchOpen(true)} onChange={(event) => setGlobalSearch(event.target.value)} placeholder="Search anything" aria-label="Search anything" /><kbd><Command size={11} /> K</kbd>{searchOpen && globalSearch && <button className="search-clear" onClick={() => setGlobalSearch('')} aria-label="Clear search"><X size={13} /></button>}</div>{searchOpen && globalSearch && <div className="global-results"><strong>Search results</strong><button onClick={() => { setSearchOpen(false); selectNav('Projects') }}>Projects matching “{globalSearch}” <ChevronRight size={14} /></button><button onClick={() => { setSearchOpen(false); selectNav('Tasks') }}>Tasks matching “{globalSearch}” <ChevronRight size={14} /></button></div>}
            <button type="button" className="icon-button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); selectNav('Chat') }} aria-label="Open chat"><MessageSquare size={18} /><i /></button>
            <div className="notification-wrap" onClick={(event) => event.stopPropagation()}><button type="button" className={`icon-button ${notificationsOpen ? 'open' : ''}`} onClick={() => setNotificationsOpen((open) => !open)} aria-label="Open notifications" aria-expanded={notificationsOpen} aria-haspopup="menu"><Bell size={18} />{workspace.unread > 0 && <i />}</button>{notificationsOpen && <div className="notification-popover"><div className="popover-head"><strong>Notifications</strong>{workspace.unread > 0 ? <button className="popover-markall" onClick={() => workspace.markAllNotificationsRead()}>Mark all read</button> : <span>All caught up</span>}</div>{workspace.notifications.length ? workspace.notifications.slice(0, 5).map((n) => <button type="button" key={n.id} className={`notification-item ${n.isRead ? '' : 'unread'}`} onClick={() => { if (!n.isRead) workspace.markNotificationRead(n.id) }}><div className={`notification-dot ${n.isRead ? 'blue' : 'orange'}`} /><div><strong>{n.message}</strong><small>{(n.actor?.name ? n.actor.name + ' · ' : '') + relativeTime(n.createdAt)}</small></div></button>) : <div className="notification-empty">No notifications yet.</div>}<button className="view-all" onClick={() => { setNotificationsOpen(false); selectNav('Notifications') }}>View all notifications <ChevronRight size={14} /></button></div>}</div>
            <div className="header-divider" /><div className="profile-menu-wrap" onClick={(event) => event.stopPropagation()}><button type="button" className={`user-button ${profileOpen ? 'open' : ''}`} onClick={() => setProfileOpen((open) => !open)} aria-expanded={profileOpen} aria-haspopup="menu" aria-label="Open account menu"><div className="user-avatar">{displayInitials}</div><ChevronDown size={14} /></button>{profileOpen && <div className="profile-menu" role="menu" aria-label="Account menu"><div className="profile-menu-heading"><strong>{displayName}</strong><span>{role}</span></div><button type="button" role="menuitem" onClick={() => { setProfileOpen(false); selectNav('Account settings') }}><Settings size={14} /> Account settings</button><button type="button" role="menuitem" onClick={handleSignOut}>Sign out</button></div>}</div>
          </div>
        </header>

        <div className={`content-wrap ${activeNav === 'Overview' ? '' : 'module-mode'}`}>
          <div className="page-intro reveal-up"><div><div className="eyebrow"><span className="status-live"><span /> Live workspace</span><span>{todayLabel}</span></div><h1>{activeNav === 'Overview' ? <>Good morning, {firstName} <span>✦</span></> : activeNav}</h1><p>{activeNav === 'Overview' ? "Here's what's happening across your workspace today." : `Manage your ${activeNav.toLowerCase()} workspace from one place.`}</p></div><div className="intro-actions"><div className="date-filter-wrap overview-date-wrap"><button type="button" className={`range-control ${overviewDateOpen ? 'open' : ''}`} onClick={() => setOverviewDateOpen(true)} aria-expanded={overviewDateOpen} aria-haspopup="dialog" aria-label="Select date range"><CalendarDays size={15} /><span>{range}</span><ChevronDown size={14} /></button></div><button className="primary-button" onClick={() => setNewProjectOpen(true)}><Plus size={17} /> New project</button></div></div>

          {createdProject && activeNav === 'Projects' && <div className="created-project-banner"><Check size={15} /><span><strong>{createdProject}</strong> is ready in your project portfolio.</span><button onClick={() => setCreatedProject(null)} aria-label="Dismiss project confirmation"><X size={14} /></button></div>}

          <WorkspaceView key={`${activeNav}-${moduleRefresh}`} view={activeNav} user={user} onAddNew={handleAddNew} onToast={(message) => { setToastMessage(message); setToast(true); window.setTimeout(() => setToast(false), 2600) }} />

          <div className="stats-grid">{workspace.kpis.length
            ? workspace.kpis.map((kpi) => <KpiCard key={kpi.label} label={kpi.label} value={kpi.value} icon={KPI_ICONS[kpi.iconKey]} tone={kpi.tone} />)
            : FALLBACK_KPIS.map((kpi) => <KpiCard key={kpi.label} label={kpi.label} value={kpi.value} change={kpi.change} icon={kpi.icon} tone={kpi.tone} />)}</div>

          <div className="dashboard-grid">
            <section className="panel chart-panel reveal-up"><div className="panel-head"><div><h2>Tasks by status</h2><p>Live distribution across your tasks</p></div><div className="chart-legend"><span><i className="legend-blue" /> Tasks</span><button className="dots-button" onClick={() => notify('Chart actions are ready.')} aria-label="Open chart actions"><MoreHorizontal size={17} /></button></div></div>{(() => { const bars: [string, string][] = [['TODO', 'To Do'], ['IN_PROGRESS', 'In Progress'], ['IN_REVIEW', 'In Review'], ['DONE', 'Done']]; const max = Math.max(1, ...bars.map(([k]) => statusCounts[k] ?? 0)); return <div className="chart"><div className="chart-y"><span>{max}</span><span>{Math.round(max * 0.75)}</span><span>{Math.round(max * 0.5)}</span><span>{Math.round(max * 0.25)}</span><span>0</span></div><div className="chart-content"><div className="grid-lines"><i /><i /><i /><i /><i /></div><div className="bars">{bars.map(([k]) => <div className="bar-group" key={k}><div className="bar blue-bar" style={{ height: `${Math.round(((statusCounts[k] ?? 0) / max) * 100)}%` }} title={`${statusCounts[k] ?? 0} tasks`} /></div>)}</div><div className="chart-x">{bars.map(([k, l]) => <span key={k}>{l}</span>)}</div></div></div> })()}</section>
            <section className="panel progress-panel reveal-up"><div className="panel-head"><div><h2>Project progress</h2><p>Current active projects</p></div><button className="text-button" onClick={() => selectNav('Projects')}>View all <ChevronRight size={14} /></button></div><div className="project-list">{overviewProjects.length ? overviewProjects.slice(0, 5).map((project) => { const total = project._count?.tasks ?? 0; const pct = project.progress ?? 0; return <div className="project-row" key={project.id}><div className={`project-logo ${toneFor(project.id)}`}>{(project.client?.company || project.client?.name || project.name).slice(0, 2).toUpperCase()}</div><div className="project-info"><div className="project-title"><strong>{project.name}</strong><span>{pct}%</span></div><ProgressBar value={pct} color={toneFor(project.id)} /><div className="project-meta"><span>{project.doneTasks ?? 0}/{total} tasks</span><span>{project.client?.company || project.client?.name || ''}</span></div></div></div> }) : <div className="activity-empty-row">{user?.role === 'DEVELOPER' ? 'Developers track tasks, not projects.' : 'No projects yet — create one below.'}</div>}</div><button className="add-project" onClick={() => setNewProjectOpen(true)}><Plus size={15} /> Add project</button></section>
          </div>

          <div className="lower-grid">
            <section className="panel activity-panel reveal-up"><div className="panel-head"><div><h2>Recent activity</h2><p>Keep up with your team&apos;s latest moves</p></div><button className="dots-button" onClick={() => notify('Chart actions are ready.')} aria-label="Open chart actions"><MoreHorizontal size={17} /></button></div><div className="activity-list">{workspace.feed.length ? workspace.feed.slice(0, 6).map((item) => <div className="activity-row" key={item.id}><div className={`activity-avatar ${toneFor(item.id)}`}>{initials(item.actor?.name ?? 'Someone')}</div><div className="activity-copy"><p>{activityLine(item)}</p><small>{relativeTime(item.createdAt)}</small></div><button className="activity-more" onClick={() => notify('Activity options are ready.')} aria-label="Activity options"><MoreHorizontal size={15} /></button></div>) : <div className="activity-empty-row">{workspace.loading ? 'Loading activity…' : 'No activity yet. Live updates will appear here.'}</div>}</div><button className="activity-link" onClick={() => selectNav('Activity')}>View all activity <ChevronRight size={14} /></button></section>
            <section className="panel deadlines-panel reveal-up"><div className="panel-head"><div><h2>Upcoming deadlines</h2><p>Tasks due in the next 7 days</p></div><button className="text-button" onClick={() => selectNav('Calendar')}>See calendar <ChevronRight size={14} /></button></div><div className="deadline-list">{overviewDeadlines.length ? overviewDeadlines.map((t) => { const d = t.dueDate ? new Date(t.dueDate) : null; const pr = (t.priority === 'CRITICAL' || t.priority === 'HIGH') ? 'high' : t.priority === 'MEDIUM' ? 'medium' : 'low'; return <div className="deadline-item" key={t.id}><div className="date-tile"><strong>{d ? d.getDate() : '–'}</strong><small>{d ? d.toLocaleString('en-US', { month: 'short' }).toUpperCase() : ''}</small></div><div><strong>{t.title}</strong><span>{t.project.name}</span></div><div className={`priority ${pr}`}>{t.priority.charAt(0) + t.priority.slice(1).toLowerCase()}</div></div> }) : <div className="activity-empty-row">No upcoming deadlines.</div>}</div></section>
          </div>
        </div>
      </section>
      {newWorkspaceOpen && <div className="modal-backdrop" onClick={() => setNewWorkspaceOpen(false)}><section className="project-modal workspace-modal" role="dialog" aria-modal="true" aria-labelledby="workspace-title" onClick={(event) => event.stopPropagation()}><div className="modal-head"><div><span className="eyebrow-label">Workspace setup</span><h2 id="workspace-title">Create new workspace</h2><p>Start a focused space for another team, client, or initiative.</p></div><button className="modal-close" onClick={() => setNewWorkspaceOpen(false)} aria-label="Close workspace dialog"><X size={17} /></button></div><label>Workspace name<input value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} placeholder="e.g. Northstar Studio" autoFocus /></label><label>Workspace type<select defaultValue="Team workspace"><option>Team workspace</option><option>Client workspace</option><option>Personal workspace</option></select></label><div className="workspace-template-row"><span className="workspace-template-icon"><Sparkles size={16} /></span><div><strong>Ready to organize</strong><small>Projects, tasks, members, and chat will start in one clean workspace.</small></div></div><div className="modal-actions"><button className="secondary-button" onClick={() => setNewWorkspaceOpen(false)}>Cancel</button><button className="primary-button" disabled={!workspaceName.trim()} onClick={() => { setNewWorkspaceOpen(false); setWorkspaceName(''); notify() }}><Plus size={15} /> Create workspace</button></div></section></div>}
      {inviteOpen && <div className="modal-backdrop" onClick={() => setInviteOpen(false)}><section className="project-modal" role="dialog" aria-modal="true" aria-labelledby="invite-title" onClick={(event) => event.stopPropagation()}><div className="modal-head"><div><span className="eyebrow-label">Team access</span><h2 id="invite-title">Invite teammate</h2><p>Give a teammate access to Orbit Studio.</p></div><button className="modal-close" onClick={() => setInviteOpen(false)} aria-label="Close invite dialog"><X size={17} /></button></div><label>Email address<input type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="teammate@company.com" /></label><label>Workspace role<select defaultValue="Developer"><option>Developer</option><option>Project Manager</option><option>Admin</option><option>Guest</option></select></label><div className="modal-actions"><button className="secondary-button" onClick={() => setInviteOpen(false)}>Cancel</button><button className="primary-button" disabled={!inviteEmail.trim()} onClick={() => { setInviteOpen(false); setInviteEmail(''); notify() }}><ArrowRight size={15} /> Send invite</button></div></section></div>}
      {newProjectOpen && <div className="modal-backdrop" onClick={() => setNewProjectOpen(false)}><section className="project-modal" role="dialog" aria-modal="true" aria-labelledby="new-project-title" onClick={(event) => event.stopPropagation()}><div className="modal-head"><div><span className="eyebrow-label">Create workspace item</span><h2 id="new-project-title">New project</h2><p>Start a new delivery space for your team.</p></div><button className="modal-close" onClick={() => setNewProjectOpen(false)} aria-label="Close new project dialog"><X size={17} /></button></div><label>Project name<input value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="e.g. Website redesign" autoFocus /></label><label>Client<select value={projectClientId} onChange={(event) => setProjectClientId(event.target.value)}><option value="">{clientOptions.length ? 'Select a client…' : 'Loading clients…'}</option>{clientOptions.map((c) => <option key={c.id} value={c.id}>{c.company || c.name}</option>)}</select></label>{user?.role === 'ADMIN' ? <label>Project owner (manager)<select value={projectOwnerId} onChange={(event) => setProjectOwnerId(event.target.value)}><option value="">{pmOptions.length ? 'Select a project manager…' : 'Loading managers…'}</option>{pmOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label> : <div className="workspace-template-row"><span className="workspace-template-icon"><Sparkles size={16} /></span><div><strong>You will own this project</strong><small>As a project manager, new projects are created under your account.</small></div></div>}<div className="modal-actions"><button className="secondary-button" onClick={() => setNewProjectOpen(false)}>Cancel</button><button className="primary-button" disabled={createBusy || !projectName.trim() || !projectClientId || (user?.role === 'ADMIN' && !projectOwnerId)} onClick={() => { void handleCreateProject() }}><Plus size={15} /> {createBusy ? 'Creating…' : 'Create project'}</button></div></section></div>}
      {newTaskOpen && <div className="modal-backdrop" onClick={() => setNewTaskOpen(false)}><section className="project-modal" role="dialog" aria-modal="true" aria-labelledby="new-task-title" onClick={(event) => event.stopPropagation()}><div className="modal-head"><div><span className="eyebrow-label">Create workspace item</span><h2 id="new-task-title">New task</h2><p>Add a task to one of your projects and assign it.</p></div><button className="modal-close" onClick={() => setNewTaskOpen(false)} aria-label="Close new task dialog"><X size={17} /></button></div><label>Task title<input value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} placeholder="e.g. Build login screen" autoFocus /></label><label>Project<select value={taskProjectId} onChange={(event) => setTaskProjectId(event.target.value)}><option value="">{projectOptions.length ? 'Select a project…' : 'Loading projects…'}</option>{projectOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Assign developer<select value={taskAssignee} onChange={(event) => setTaskAssignee(event.target.value)}><option value="">Unassigned</option>{devOptions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label><label>Priority<select value={taskPriority} onChange={(event) => setTaskPriority(event.target.value)}><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="CRITICAL">Critical</option></select></label><label>Due date<input type="date" value={taskDue} onChange={(event) => setTaskDue(event.target.value)} /></label><div className="modal-actions"><button className="secondary-button" onClick={() => setNewTaskOpen(false)}>Cancel</button><button className="primary-button" disabled={createBusy || !taskTitle.trim() || !taskProjectId} onClick={() => { void handleCreateTask() }}><Plus size={15} /> {createBusy ? 'Creating…' : 'Create task'}</button></div></section></div>}
      {overviewDateOpen && <div className="modal-backdrop" onClick={() => setOverviewDateOpen(false)}><section className="project-modal" role="dialog" aria-modal="true" aria-labelledby="date-range-title" onClick={(event) => event.stopPropagation()}><div className="modal-head"><div><span className="eyebrow-label">Workspace timeline</span><h2 id="date-range-title">Choose a date range</h2><p>Set the window for your workspace overview.</p></div><button className="modal-close" onClick={() => setOverviewDateOpen(false)} aria-label="Close date range dialog"><X size={17} /></button></div><div className="date-presets">{['This month', 'Last month', 'Last 90 days', 'This year'].map((preset) => <button type="button" key={preset} className={range === preset ? 'selected' : ''} onClick={() => { setRange(preset); const r = presetRange(preset); setOverviewFrom(r.from); setOverviewTo(r.to) }}>{preset}</button>)}</div><div className="date-inputs"><label>From<input type="date" value={overviewFrom} onChange={(event) => { setOverviewFrom(event.target.value); setRange('Custom range') }} /></label><span>→</span><label>To<input type="date" value={overviewTo} onChange={(event) => { setOverviewTo(event.target.value); setRange('Custom range') }} /></label></div><div className="modal-actions"><button className="secondary-button" onClick={() => setOverviewDateOpen(false)}>Cancel</button><button className="primary-button" onClick={() => { setOverviewDateOpen(false); notify(`Date range set to ${range.toLowerCase()}.`) }}><Check size={15} /> Apply range</button></div></section></div>}
      {toast && <div className="toast"><div className="toast-check"><Check size={14} /></div><div><strong>Notification</strong><span>{toastMessage}</span></div><button onClick={() => setToast(false)} aria-label="Close notification"><X size={15} /></button></div>}
    </main>
  )
}
