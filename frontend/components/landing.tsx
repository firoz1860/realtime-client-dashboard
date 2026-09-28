'use client'

import { useEffect, useState } from 'react'
import { Bell, CheckCircle2, MessageSquare, Radio, ShieldCheck, Sparkles, Users } from 'lucide-react'

type AuthIntent = 'login' | 'signup'

const COLUMNS = ['To do', 'In progress', 'In review', 'Done'] as const
type Column = (typeof COLUMNS)[number]

interface BoardCard { id: string; title: string; who: string; tone: string; column: Column }

const START: BoardCard[] = [
  { id: 'a', title: 'Pricing page copy', who: 'MR', tone: 'violet', column: 'To do' },
  { id: 'b', title: 'Stripe webhooks', who: 'DK', tone: 'cobalt', column: 'In progress' },
  { id: 'c', title: 'Mobile nav polish', who: 'AS', tone: 'amber', column: 'In progress' },
  { id: 'd', title: 'Checkout QA', who: 'PS', tone: 'teal', column: 'In review' },
  { id: 'e', title: 'Brand tokens', who: 'MR', tone: 'violet', column: 'Done' },
]

/** The one moving element on the page: a card crosses to Done, the feed updates. */
function LiveBoard() {
  const [cards, setCards] = useState(START)
  const [moved, setMoved] = useState(false)

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const timer = window.setTimeout(() => {
      setCards((prev) => prev.map((c) => (c.id === 'd' ? { ...c, column: 'Done' } : c)))
      setMoved(true)
    }, reduce ? 0 : 1800)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <div className="board" aria-label="Example project board">
      <div className="board-head">
        <div>
          <strong>Northstar website</strong>
          <span>Acme Co. — due Oct 14</span>
        </div>
        <span className="live-state is-live">Live</span>
      </div>
      <div className="board-columns">
        {COLUMNS.map((col) => (
          <div className="board-col" key={col}>
            <p>{col}<span>{cards.filter((c) => c.column === col).length}</span></p>
            {cards.filter((c) => c.column === col).map((c) => (
              <div className={`board-card ${c.id === 'd' && moved ? 'just-moved' : ''}`} key={c.id}>
                <span>{c.title}</span>
                <i className={`avatar avatar-sm tone-${c.tone}`}>{c.who}</i>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className={`board-feed ${moved ? 'is-visible' : ''}`} aria-live="polite">
        <CheckCircle2 size={15} />
        <span>{moved ? <><b>Priya</b> moved Checkout QA to Done. The client lead was notified.</> : 'Waiting for updates…'}</span>
      </div>
    </div>
  )
}

export function Landing({ onAuth, onGuest, signupEnabled }: { onAuth: (intent: AuthIntent) => void; onGuest: () => void; signupEnabled: boolean }) {
  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div className="landing">
      <header className="landing-nav">
        <a className="brand" href="#top" aria-label="Orbit home"><span className="brand-mark"><Sparkles size={15} /></span>orbit</a>
        <nav aria-label="Page sections">
          <button type="button" onClick={() => go('how')}>How it works</button>
          <button type="button" onClick={() => go('roles')}>Roles</button>
          <button type="button" onClick={() => go('realtime')}>Realtime</button>
        </nav>
        <div className="landing-nav-actions">
          <button type="button" className="btn btn-ghost" onClick={() => onAuth('login')}>Log in</button>
          {signupEnabled && <button type="button" className="btn btn-primary" onClick={() => onAuth('signup')}>Create account</button>}
        </div>
      </header>

      <main id="top">
        <section className="hero">
          <div className="hero-copy">
            <h1>Client work, moving in real time.</h1>
            <p>Orbit keeps every client’s projects, tasks and conversations in one place, and shows your whole team the moment something changes.</p>
            <div className="hero-actions">
              {signupEnabled
                ? <button type="button" className="btn btn-primary btn-lg" onClick={() => onAuth('signup')}>Create your account</button>
                : <button type="button" className="btn btn-primary btn-lg" onClick={() => onAuth('login')}>Log in to your workspace</button>}
              <button type="button" className="btn btn-outline btn-lg" onClick={onGuest}>Preview the workspace</button>
            </div>
            <p className="hero-note">{signupEnabled ? 'Already have an account? ' : 'Accounts are created by your workspace admin. '}<button type="button" className="link" onClick={() => onAuth('login')}>Log in</button></p>
          </div>
          <LiveBoard />
        </section>

        <section className="band" id="how">
          <h2>From brief to shipped, in four steps</h2>
          <ol className="steps">
            <li><b>Set up the client</b><span>Add the client and open a project with an owner and a delivery date.</span></li>
            <li><b>Plan the work</b><span>Break it into tasks with priorities, due dates and a developer on each.</span></li>
            <li><b>Review together</b><span>Move tasks to review; the project manager is notified straight away.</span></li>
            <li><b>Ship and report</b><span>Progress bars and the activity feed show the client exactly where things stand.</span></li>
          </ol>
        </section>

        <section className="band band-alt" id="roles">
          <h2>Everyone sees the work that is theirs</h2>
          <div className="roles">
            <article>
              <span className="chip-icon tone-cobalt"><ShieldCheck size={18} /></span>
              <h3>Admins</h3>
              <p>Manage clients and team accounts, change roles, and see workload, overdue tasks and who is online across the whole workspace.</p>
            </article>
            <article>
              <span className="chip-icon tone-violet"><Users size={18} /></span>
              <h3>Project managers</h3>
              <p>Run their own projects: create and assign tasks, track what is due this week, and review work as it comes in.</p>
            </article>
            <article>
              <span className="chip-icon tone-teal"><CheckCircle2 size={18} /></span>
              <h3>Developers</h3>
              <p>A focused list of assigned tasks, with status updates in one click and a chat channel for every project they are on.</p>
            </article>
          </div>
        </section>

        <section className="band realtime" id="realtime">
          <div>
            <h2>No refresh button required</h2>
            <p className="band-lead">Every change is pushed to the people it affects over a live connection, and missed events are caught up when you reconnect.</p>
            <ul className="feature-list">
              <li><Radio size={18} /><div><b>Live activity feed</b><span>Task and project changes appear as they happen.</span></div></li>
              <li><Bell size={18} /><div><b>Notifications that matter</b><span>Assignments and review requests reach the right person, with an unread count.</span></div></li>
              <li><MessageSquare size={18} /><div><b>Project chat</b><span>Keep decisions next to the work instead of in scattered threads.</span></div></li>
            </ul>
          </div>
          <div className="notice-stack" aria-hidden="true">
            <div className="notice"><span className="avatar tone-cobalt">DK</span><div><b>Dev Kumar</b><span>assigned you “Stripe webhooks”</span></div><time>now</time></div>
            <div className="notice"><span className="avatar tone-teal">PS</span><div><b>Priya Shah</b><span>requested review on “Checkout QA”</span></div><time>2m</time></div>
            <div className="notice"><span className="avatar tone-amber">AS</span><div><b>Ana Silva</b><span>in #northstar: “Pushed the fix, can you check?”</span></div><time>5m</time></div>
          </div>
        </section>

        <section className="cta">
          <h2>Bring your next client project into Orbit.</h2>
          <div className="hero-actions">
            {signupEnabled && <button type="button" className="btn btn-light btn-lg" onClick={() => onAuth('signup')}>Create your account</button>}
            <button type="button" className="btn btn-on-dark btn-lg" onClick={() => onAuth('login')}>Log in</button>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <span className="brand"><span className="brand-mark"><Sparkles size={13} /></span>orbit</span>
        <span>Projects, people and progress for client teams.</span>
        <span>© {new Date().getFullYear()} Orbit</span>
      </footer>
    </div>
  )
}
