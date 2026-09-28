import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

// Regression guard for the dashboard Chat tab losing its realtime connection.
//
// ChatView registers its `message:new` listener inside an effect that returns
// early when `socket` is falsy (components/chat-view.tsx). The dashboard owns the
// single shared connection via useWorkspaceData().socket. When page.tsx rendered
// <ChatView user onToast /> without `socket`, the Chat tab still loaded history
// over REST but never received live messages, and its header pill stayed on
// "Connecting...". The backend was fine the whole time, so nothing failed loudly.
//
// `npx tsc --noEmit` catches the omission today because `socket` is a required
// prop. These assertions additionally pin the wiring so that making the prop
// optional, or dropping it at the call site, fails a test rather than silently
// disabling realtime chat again.

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

const page = read('../app/page.tsx')
const chatView = read('../components/chat-view.tsx')

test('ChatView still requires a socket prop', () => {
  assert.match(
    chatView,
    /socket:\s*AppSocket\s*\|\s*null/,
    'ChatView should keep `socket: AppSocket | null` required; making it optional re-hides the bug',
  )
})

test('ChatView guards its realtime listener on socket', () => {
  assert.match(
    chatView,
    /if\s*\(!socket\)\s*return/,
    'ChatView should bail out of its socket effect when no socket is supplied',
  )
  assert.match(
    chatView,
    /socket\.on\('message:new'/,
    'ChatView should subscribe to message:new for live delivery',
  )
})

test('the dashboard passes the shared workspace socket down to ChatView', () => {
  // WorkspaceView is the intermediate component that renders ChatView.
  assert.match(
    page,
    /<ChatView[^>]*\bsocket=\{socket\}/,
    'page.tsx must render <ChatView ... socket={socket} ...> or the Chat tab loses realtime',
  )
  assert.match(
    page,
    /<WorkspaceView[^>]*\bsocket=\{workspace\.socket\}/,
    'page.tsx must pass socket={workspace.socket} into WorkspaceView',
  )
  assert.match(
    page,
    /function WorkspaceView\(\{[^}]*\bsocket\b/,
    'WorkspaceView must accept a socket prop to forward it',
  )
})

test('the shared socket really is exposed by useWorkspaceData', () => {
  const hook = read('../lib/useWorkspaceData.ts')
  assert.match(
    hook,
    /socket:\s*AppSocket\s*\|\s*null/,
    'useWorkspaceData must keep exposing `socket` for the dashboard to forward',
  )
})
