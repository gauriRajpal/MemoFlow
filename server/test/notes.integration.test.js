import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import test from 'node:test'
import Database from 'better-sqlite3'

const serverDir = path.resolve(import.meta.dirname, '..')

async function availablePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  await new Promise((resolve) => server.close(resolve))
  return port
}

async function startServer({ port, dbPath, uploadDir }) {
  const child = spawn(process.execPath, ['src/index.js'], {
    cwd: serverDir,
    env: {
      ...process.env,
      PORT: String(port),
      MEMOFLOW_DB_PATH: dbPath,
      MEMOFLOW_UPLOAD_DIR: uploadDir,
      MEMOFLOW_DISABLE_SEED: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Server did not start\n${output}`)), 10000)
    const collect = (chunk) => {
      output += chunk.toString()
      if (output.includes('MemoFlow API on')) {
        clearTimeout(timer)
        resolve()
      }
    }
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)
    child.once('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`Server exited with ${code}\n${output}`))
    })
  })
  return child
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return
  child.kill()
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 5000)
    child.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
  })
}

function client(baseUrl) {
  return async function request(route, { method = 'GET', token, json, status = 200 } = {}) {
    const headers = {}
    if (token) headers.cookie = token
    if (json !== undefined) headers['content-type'] = 'application/json'
    const response = await fetch(`${baseUrl}${route}`, {
      method,
      headers,
      body: json === undefined ? undefined : JSON.stringify(json),
    })
    const data = await response.json().catch(() => ({}))
    assert.equal(response.status, status, `${method} ${route}: ${JSON.stringify(data)}`)
    const serverReturnedToken = Object.hasOwn(data, 'token')
    const setCookie = response.headers.get('set-cookie') || ''
    if (setCookie) {
      data.setCookie = setCookie
      data.token = setCookie.split(';', 1)[0]
    }
    data.serverReturnedToken = serverReturnedToken
    return data
  }
}

function zonedDay(iso, timeZone) {
  const formatter = new Intl.DateTimeFormat('en', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(iso)).map((part) => [part.type, part.value])
  )
  return `${parts.year}-${parts.month}-${parts.day}`
}

test('notes, authentication, invitations, and workspace authorization persist correctly', async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'memoflow-notes-'))
  const dbPath = path.join(tempDir, 'memoflow.db')
  const uploadDir = path.join(tempDir, 'uploads')
  const port = await availablePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const request = client(baseUrl)
  let server = await startServer({ port, dbPath, uploadDir })

  t.after(async () => {
    await stopServer(server)
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  await request('/api/notes', { status: 401 })

  const alice = await request('/api/auth/register', {
    method: 'POST',
    status: 201,
    json: { name: 'Alice', email: 'alice@example.com', password: 'secret1' },
  })
  const bob = await request('/api/auth/register', {
    method: 'POST',
    status: 201,
    json: { name: 'Bob', email: 'bob@example.com', password: 'secret2' },
  })
  const charlie = await request('/api/auth/register', {
    method: 'POST',
    status: 201,
    json: { name: 'Charlie', email: 'charlie@example.com', password: 'secret3' },
  })
  assert.match(alice.setCookie, /HttpOnly/i)
  assert.match(alice.setCookie, /SameSite=Strict/i)
  assert.equal(alice.serverReturnedToken, false)
  assert.deepEqual((await request('/api/auth/me', { token: alice.token })).user, alice.user)

  const { workspace } = await request('/api/workspaces', {
    method: 'POST',
    token: alice.token,
    status: 201,
    json: { name: 'Product', description: 'Shared product notes' },
  })
  const bobInvitationWorkspace = await request(`/api/workspaces/${workspace.id}/invitations`, {
    method: 'POST',
    token: alice.token,
    status: 201,
    json: { email: 'bob@example.com' },
  })
  assert.equal(bobInvitationWorkspace.workspace.members.length, 1)
  assert.equal(bobInvitationWorkspace.workspace.pendingInvitations.length, 1)
  assert.equal(bobInvitationWorkspace.workspace.pendingInvitations[0].email, 'bob@example.com')
  const bobPending = await request('/api/workspaces', { token: bob.token })
  assert.equal(bobPending.workspaces.length, 0)
  assert.equal(bobPending.invitations.length, 1)
  assert.equal(bobPending.invitations[0].workspaceId, workspace.id)
  await request(`/api/workspaces/${workspace.id}`, { token: bob.token, status: 404 })
  await request('/api/notes', {
    method: 'POST',
    token: bob.token,
    status: 403,
    json: {
      body: 'Invitation is not membership',
      visibility: 'shared',
      workspaceId: workspace.id,
      tags: [],
      items: [],
    },
  })
  await request(`/api/workspaces/invitations/${bobPending.invitations[0].id}/accept`, {
    method: 'POST',
    token: charlie.token,
    status: 404,
  })
  await request(`/api/workspaces/invitations/${bobPending.invitations[0].id}/accept`, {
    method: 'POST',
    token: bob.token,
  })
  assert.equal((await request('/api/workspaces', { token: bob.token })).invitations.length, 0)

  await request(`/api/workspaces/${workspace.id}/invitations`, {
    method: 'POST',
    token: bob.token,
    status: 403,
    json: { email: 'charlie@example.com' },
  })
  await request(`/api/workspaces/${workspace.id}/invitations`, {
    method: 'POST',
    token: alice.token,
    status: 201,
    json: { email: 'charlie@example.com' },
  })
  const charlieDecline = await request('/api/workspaces', { token: charlie.token })
  assert.equal(charlieDecline.workspaces.length, 0)
  assert.equal(charlieDecline.invitations.length, 1)
  await request(`/api/workspaces/invitations/${charlieDecline.invitations[0].id}/decline`, {
    method: 'POST',
    token: charlie.token,
  })
  assert.equal((await request('/api/workspaces', { token: charlie.token })).workspaces.length, 0)

  const charlieCancel = await request(`/api/workspaces/${workspace.id}/invitations`, {
    method: 'POST',
    token: alice.token,
    status: 201,
    json: { email: 'charlie@example.com' },
  })
  const cancelledInvitation = charlieCancel.workspace.pendingInvitations.find(
    (invitation) => invitation.email === 'charlie@example.com'
  )
  await request(`/api/workspaces/${workspace.id}/invitations/${cancelledInvitation.id}`, {
    method: 'DELETE',
    token: bob.token,
    status: 403,
  })
  await request(`/api/workspaces/${workspace.id}/invitations/${cancelledInvitation.id}`, {
    method: 'DELETE',
    token: alice.token,
  })
  assert.equal((await request('/api/workspaces', { token: charlie.token })).invitations.length, 0)

  await request(`/api/workspaces/${workspace.id}/invitations`, {
    method: 'POST',
    token: alice.token,
    status: 201,
    json: { email: 'charlie@example.com' },
  })
  const charlieAccept = await request('/api/workspaces', { token: charlie.token })
  await request(`/api/workspaces/invitations/${charlieAccept.invitations[0].id}/accept`, {
    method: 'POST',
    token: charlie.token,
  })
  await request(`/api/workspaces/${workspace.id}/members/${charlie.user.id}`, {
    method: 'DELETE',
    token: bob.token,
    status: 403,
  })
  await request(`/api/workspaces/${workspace.id}/members/${charlie.user.id}`, {
    method: 'DELETE',
    token: alice.token,
  })
  await request(`/api/workspaces/${workspace.id}`, { token: charlie.token, status: 404 })
  const aliceWorkspaces = await request('/api/workspaces', { token: alice.token })
  const bobWorkspaces = await request('/api/workspaces', { token: bob.token })
  assert.equal(aliceWorkspaces.workspaces[0].role, 'owner')
  assert.equal(bobWorkspaces.workspaces[0].role, 'member')

  const { note: personal } = await request('/api/notes', {
    method: 'POST',
    token: alice.token,
    status: 201,
    json: {
      body: 'Private alpha\nSecond line',
      visibility: 'private',
      tags: ['Journal', '2026'],
      items: [],
    },
  })
  assert.deepEqual(personal.tags, ['2026', 'journal'])
  assert.equal(personal.workspaceId, null)

  const calendarTimeZone = 'Pacific/Kiritimati'
  const personalDay = zonedDay(personal.createdAt, calendarTimeZone)
  const personalMonth = personalDay.slice(0, 7)
  const calendar = await request(
    `/api/notes?scope=personal&month=${personalMonth}&day=${personalDay}&timeZone=${calendarTimeZone}`,
    { token: alice.token },
  )
  assert.deepEqual(calendar.notes.map((note) => note.id), [personal.id])
  assert.deepEqual(calendar.days, [{ day: personalDay, count: 1 }])
  await request('/api/notes?timeZone=Not%2FA_Time_Zone', { token: alice.token, status: 400 })

  await request('/api/notes', {
    method: 'POST',
    token: alice.token,
    status: 400,
    json: { body: '   ', visibility: 'private', tags: [], items: [] },
  })
  await request('/api/notes', {
    method: 'POST',
    token: alice.token,
    status: 400,
    json: { body: 'Bad tag', visibility: 'private', tags: ['not valid'], items: [] },
  })

  await request('/api/notes', {
    method: 'POST',
    token: alice.token,
    status: 400,
    json: { body: 'Missing workspace', visibility: 'shared', tags: [], items: [] },
  })
  await request('/api/notes', {
    method: 'POST',
    token: alice.token,
    status: 403,
    json: { body: 'Unknown workspace', visibility: 'shared', workspaceId: 999999, tags: [], items: [] },
  })

  const { note: shared } = await request('/api/notes', {
    method: 'POST',
    token: alice.token,
    status: 201,
    json: {
      body: 'Launch brief with milestones',
      visibility: 'shared',
      workspaceId: workspace.id,
      tags: ['release'],
      items: [{ text: 'Ship preview', done: false }],
    },
  })
  const { note: bobPrivate } = await request('/api/notes', {
    method: 'POST',
    token: bob.token,
    status: 201,
    json: { body: 'Bob secret', visibility: 'private', tags: ['private'], items: [] },
  })
  const { note: bobShared } = await request('/api/notes', {
    method: 'POST',
    token: bob.token,
    status: 201,
    json: {
      body: 'Member-authored shared note',
      visibility: 'shared',
      workspaceId: workspace.id,
      tags: ['team'],
      items: [{ text: 'Member task', done: false }],
    },
  })
  const { note: memberEdited } = await request(`/api/notes/${bobShared.id}`, {
    method: 'PUT',
    token: bob.token,
    json: {
      body: 'Member edited their shared note',
      visibility: 'shared',
      workspaceId: workspace.id,
      tags: ['team'],
      items: [{ text: 'Member task', done: false }],
    },
  })
  assert.equal(memberEdited.body, 'Member edited their shared note')
  const { note: ownerModerated } = await request(`/api/notes/${bobShared.id}`, {
    method: 'PUT',
    token: alice.token,
    json: {
      body: 'Owner-moderated shared note',
      visibility: 'private',
      tags: ['moderated'],
      items: [{ text: 'Member task', done: false }],
    },
  })
  assert.equal(ownerModerated.visibility, 'shared')
  assert.equal(ownerModerated.workspaceId, workspace.id)
  assert.equal(ownerModerated.canEdit, true)
  assert.equal((await request(`/api/notes/${bobShared.id}`, { token: bob.token })).note.body, 'Owner-moderated shared note')

  const { note: ownerDeleteCandidate } = await request('/api/notes', {
    method: 'POST',
    token: bob.token,
    status: 201,
    json: {
      body: 'Owner may remove this shared note',
      visibility: 'shared',
      workspaceId: workspace.id,
      tags: [],
      items: [],
    },
  })
  await request(`/api/notes/${ownerDeleteCandidate.id}`, { method: 'DELETE', token: alice.token })
  await request(`/api/notes/${ownerDeleteCandidate.id}`, { token: bob.token, status: 404 })

  const { note: memberDeleteCandidate } = await request('/api/notes', {
    method: 'POST',
    token: bob.token,
    status: 201,
    json: {
      body: 'Member removes their own shared note',
      visibility: 'shared',
      workspaceId: workspace.id,
      tags: [],
      items: [],
    },
  })
  await request(`/api/notes/${memberDeleteCandidate.id}`, { method: 'DELETE', token: bob.token })
  await request(`/api/notes/${memberDeleteCandidate.id}`, { token: alice.token, status: 404 })

  const bobAll = await request('/api/notes', { token: bob.token })
  assert.deepEqual(new Set(bobAll.notes.map((note) => note.id)), new Set([shared.id, bobShared.id, bobPrivate.id]))
  assert.ok(!bobAll.notes.some((note) => note.id === personal.id))
  assert.equal(bobAll.tasks.length, 2)
  assert.equal(bobAll.tasks.find((task) => task.noteId === shared.id).canEdit, false)
  assert.equal(bobAll.tasks.find((task) => task.noteId === bobShared.id).canEdit, true)

  const aliceTasks = await request('/api/notes/tasks/unfinished', { token: alice.token })
  assert.equal(aliceTasks.tasks.length, 2)
  assert.ok(aliceTasks.tasks.every((task) => task.canEdit))

  const workspaceFeed = await request(`/api/notes?scope=workspace&workspaceId=${workspace.id}`, { token: bob.token })
  assert.deepEqual(new Set(workspaceFeed.notes.map((note) => note.id)), new Set([shared.id, bobShared.id]))
  assert.ok(workspaceFeed.notes.every((note) => note.visibility === 'shared'))

  await request(`/api/notes/${personal.id}`, { token: bob.token, status: 404 })
  await request(`/api/notes/${shared.id}`, { token: bob.token })
  await request(`/api/notes/${shared.id}`, { token: charlie.token, status: 404 })
  await request(`/api/notes?scope=workspace&workspaceId=${workspace.id}`, { token: charlie.token, status: 403 })

  const contentSearch = await request('/api/notes?q=milestones', { token: alice.token })
  assert.deepEqual(contentSearch.notes.map((note) => note.id), [shared.id])
  const tagSearch = await request('/api/notes?q=journal', { token: alice.token })
  assert.deepEqual(tagSearch.notes.map((note) => note.id), [personal.id])
  const privateWorkspaceSearch = await request(
    `/api/notes?scope=workspace&workspaceId=${workspace.id}&q=alpha`,
    { token: alice.token },
  )
  assert.equal(privateWorkspaceSearch.notes.length, 0)

  const { note: updated } = await request(`/api/notes/${personal.id}`, {
    method: 'PUT',
    token: alice.token,
    json: {
      body: 'Private alpha edited',
      visibility: 'private',
      tags: ['edited'],
      items: [],
    },
  })
  assert.equal(updated.body, 'Private alpha edited')
  assert.deepEqual(updated.tags, ['edited'])

  await request(`/api/notes/${shared.id}`, {
    method: 'PUT',
    token: bob.token,
    status: 403,
    json: { body: 'Unauthorized edit', visibility: 'shared', workspaceId: workspace.id, tags: [], items: [] },
  })
  await request(`/api/notes/${shared.id}/items/${shared.items[0].id}`, {
    method: 'PATCH',
    token: bob.token,
    status: 403,
    json: { done: true },
  })
  await request(`/api/notes/${shared.id}/items/${shared.items[0].id}`, {
    method: 'PATCH',
    token: alice.token,
    status: 400,
    json: { done: 'true' },
  })
  await request(`/api/notes/${shared.id}/items/${shared.items[0].id}`, {
    method: 'PATCH',
    token: alice.token,
    json: { done: true },
  })
  const completedTasks = await request('/api/notes/tasks/unfinished', { token: alice.token })
  assert.ok(!completedTasks.tasks.some((task) => task.id === shared.items[0].id))

  const normalCreateStarted = Date.now()
  const { note: newest } = await request('/api/notes', {
    method: 'POST',
    token: alice.token,
    status: 201,
    json: { body: 'Newest note', visibility: 'private', tags: [], items: [] },
  })
  const normalCreatedAt = new Date(newest.createdAt).getTime()
  assert.ok(normalCreatedAt >= normalCreateStarted - 5000)
  assert.ok(normalCreatedAt <= Date.now() + 5000)
  const timeline = await request('/api/notes?scope=personal', { token: alice.token })
  assert.equal(timeline.notes[0].id, newest.id)
  const countedCalendar = await request(
    `/api/notes?scope=personal&month=${personalMonth}&timeZone=${calendarTimeZone}`,
    { token: alice.token },
  )
  assert.equal(countedCalendar.days.find((entry) => entry.day === personalDay)?.count, 2)

  const selectedTimeZone = 'Pacific/Kiritimati'
  const selectedDays = ['2024-02-03', '2030-07-14']
  const selectedNotes = []
  for (const selectedDay of selectedDays) {
    const { note } = await request('/api/notes', {
      method: 'POST',
      token: alice.token,
      status: 201,
      json: {
        body: `Calendar note ${selectedDay}`,
        visibility: 'private',
        calendarDay: selectedDay,
        timeZone: selectedTimeZone,
        tags: [],
        items: [],
      },
    })
    assert.equal(note.day, selectedDay)
    assert.equal(zonedDay(note.createdAt, selectedTimeZone), selectedDay)
    const calendarFeed = await request(
      `/api/notes?scope=personal&month=${selectedDay.slice(0, 7)}&day=${selectedDay}&timeZone=${selectedTimeZone}`,
      { token: alice.token },
    )
    assert.ok(calendarFeed.notes.some((entry) => entry.id === note.id))
    assert.equal(calendarFeed.days.find((entry) => entry.day === selectedDay)?.count, 1)
    selectedNotes.push(note)
  }

  const sqlite = new Database(dbPath, { readonly: true })
  try {
    const storedAlice = sqlite.prepare('SELECT password_hash FROM users WHERE id = ?').get(alice.user.id)
    assert.notEqual(storedAlice.password_hash, 'secret1')
    assert.match(storedAlice.password_hash, /^\$2[aby]\$/)
    for (const note of selectedNotes) {
      const stored = sqlite.prepare('SELECT day, created_at FROM notes WHERE id = ?').get(note.id)
      assert.equal(stored.day, note.day)
      assert.equal(stored.created_at, note.createdAt)
    }
  } finally {
    sqlite.close()
  }

  const { note: disposable } = await request('/api/notes', {
    method: 'POST',
    token: alice.token,
    status: 201,
    json: { body: 'Delete me', visibility: 'private', tags: [], items: [] },
  })
  await request(`/api/notes/${disposable.id}`, { method: 'DELETE', token: alice.token })
  await request(`/api/notes/${disposable.id}`, { token: alice.token, status: 404 })

  const persistedInvitationWorkspace = await request(`/api/workspaces/${workspace.id}/invitations`, {
    method: 'POST',
    token: alice.token,
    status: 201,
    json: { email: 'charlie@example.com' },
  })
  const persistedInvitation = persistedInvitationWorkspace.workspace.pendingInvitations.find(
    (invitation) => invitation.email === 'charlie@example.com'
  )

  await stopServer(server)
  server = await startServer({ port, dbPath, uploadDir })
  const invitationsAfterRestart = await request('/api/workspaces', { token: charlie.token })
  assert.ok(invitationsAfterRestart.invitations.some((invitation) => invitation.id === persistedInvitation.id))
  const workspaceAfterRestart = await request(`/api/workspaces/${workspace.id}`, { token: alice.token })
  assert.ok(workspaceAfterRestart.workspace.pendingInvitations.some(
    (invitation) => invitation.id === persistedInvitation.id
  ))
  await request(`/api/workspaces/invitations/${persistedInvitation.id}/decline`, {
    method: 'POST',
    token: charlie.token,
  })
  const persisted = await request(`/api/notes/${personal.id}`, { token: alice.token })
  assert.equal(persisted.note.body, 'Private alpha edited')
  assert.deepEqual(persisted.note.tags, ['edited'])
  const persistedTask = await request(`/api/notes/${shared.id}`, { token: alice.token })
  assert.equal(persistedTask.note.items[0].done, true)
  await request(`/api/notes/${shared.id}/items/${shared.items[0].id}`, {
    method: 'PATCH',
    token: alice.token,
    json: { done: false },
  })
  const reopenedTasks = await request('/api/notes/tasks/unfinished', { token: alice.token })
  assert.ok(reopenedTasks.tasks.some((task) => task.id === shared.items[0].id))
  const persistedCalendarNote = await request(
    `/api/notes/${selectedNotes[1].id}?timeZone=${selectedTimeZone}`,
    { token: alice.token },
  )
  assert.equal(persistedCalendarNote.note.day, selectedDays[1])

  await request(`/api/workspaces/${workspace.id}/leave`, {
    method: 'POST',
    token: alice.token,
    status: 400,
  })
  const transferred = await request(`/api/workspaces/${workspace.id}/owner`, {
    method: 'PATCH',
    token: alice.token,
    json: { userId: bob.user.id },
  })
  assert.equal(transferred.workspace.role, 'member')
  assert.equal(transferred.workspace.ownerId, bob.user.id)
  const bobOwnedWorkspace = await request(`/api/workspaces/${workspace.id}`, { token: bob.token })
  assert.equal(bobOwnedWorkspace.workspace.role, 'owner')
  await request(`/api/workspaces/${workspace.id}/leave`, { method: 'POST', token: alice.token })
  await request(`/api/workspaces/${workspace.id}`, { token: alice.token, status: 404 })
  await request(`/api/notes/${shared.id}`, { token: alice.token, status: 404 })
  await request(`/api/notes/${personal.id}`, { token: alice.token })
  await request(`/api/workspaces/${workspace.id}/leave`, {
    method: 'POST',
    token: bob.token,
    status: 400,
  })

  const logout = await request('/api/auth/logout', { method: 'POST', token: alice.token })
  assert.match(logout.setCookie, /Max-Age=0|Expires=/i)
  assert.equal((await request('/api/auth/me', { token: alice.token })).user, null)
  await request('/api/auth/login', {
    method: 'POST',
    status: 401,
    json: { email: 'alice@example.com', password: 'wrong-password' },
  })
  const aliceAgain = await request('/api/auth/login', {
    method: 'POST',
    json: { email: 'alice@example.com', password: 'secret1' },
  })
  assert.equal(aliceAgain.user.name, 'Alice')
  await request(`/api/notes/${personal.id}`, { token: aliceAgain.token })

  await request(`/api/workspaces/${workspace.id}`, { method: 'DELETE', token: bob.token })
  await request(`/api/workspaces/${workspace.id}`, { token: bob.token, status: 404 })
  await request(`/api/notes/${shared.id}`, { token: bob.token, status: 404 })
  await request(`/api/notes/${bobPrivate.id}`, { token: bob.token })
})
