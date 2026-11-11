import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'
import { HttpError } from './errors.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const rootDir = path.join(__dirname, '..')
export const uploadDir = process.env.MEMOFLOW_UPLOAD_DIR
  ? path.resolve(process.env.MEMOFLOW_UPLOAD_DIR)
  : path.join(rootDir, 'uploads')
const dbPath = process.env.MEMOFLOW_DB_PATH
  ? path.resolve(process.env.MEMOFLOW_DB_PATH)
  : path.join(rootDir, 'data', 'memoflow.db')

fs.mkdirSync(path.dirname(dbPath), { recursive: true })
fs.mkdirSync(uploadDir, { recursive: true })

const db = new Database(dbPath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

const TAG_PATTERN = /#([A-Za-z0-9][\w-]{0,23})/g
const TAG_NAME_PATTERN = /^[A-Za-z0-9][\w-]{0,23}$/

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workspaces (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      owner_id INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workspace_members (
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
      joined_at TEXT NOT NULL,
      PRIMARY KEY (workspace_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS workspace_invitations (
      id INTEGER PRIMARY KEY,
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      invitee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      invited_by INTEGER NOT NULL REFERENCES users(id),
      status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'declined')),
      created_at TEXT NOT NULL,
      responded_at TEXT
    );

    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY,
      author_id INTEGER NOT NULL REFERENCES users(id),
      workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
      visibility TEXT NOT NULL CHECK (visibility IN ('private', 'shared')),
      body TEXT NOT NULL,
      link_url TEXT,
      link_title TEXT,
      image_name TEXT,
      reference_note_id INTEGER REFERENCES notes(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      day TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS checklist_items (
      id INTEGER PRIMARY KEY,
      note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      done INTEGER NOT NULL DEFAULT 0,
      position INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL COLLATE NOCASE UNIQUE
    );

    CREATE TABLE IF NOT EXISTS note_tags (
      note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (note_id, tag_id)
    );

    CREATE INDEX IF NOT EXISTS idx_notes_day ON notes(day);
    CREATE INDEX IF NOT EXISTS idx_notes_author ON notes(author_id);
    CREATE INDEX IF NOT EXISTS idx_notes_workspace ON notes(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_notes_created_at ON notes(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_workspace_invitations_invitee
      ON workspace_invitations(invitee_id, status);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_invitations_pending
      ON workspace_invitations(workspace_id, invitee_id) WHERE status = 'pending';

    CREATE TRIGGER IF NOT EXISTS notes_visibility_insert
    BEFORE INSERT ON notes
    WHEN (NEW.visibility = 'private' AND NEW.workspace_id IS NOT NULL)
      OR (NEW.visibility = 'shared' AND NEW.workspace_id IS NULL)
    BEGIN
      SELECT RAISE(ABORT, 'invalid note visibility');
    END;

    CREATE TRIGGER IF NOT EXISTS notes_visibility_update
    BEFORE UPDATE OF visibility, workspace_id ON notes
    WHEN (NEW.visibility = 'private' AND NEW.workspace_id IS NOT NULL)
      OR (NEW.visibility = 'shared' AND NEW.workspace_id IS NULL)
    BEGIN
      SELECT RAISE(ABORT, 'invalid note visibility');
    END;
  `)
  if (process.env.MEMOFLOW_DISABLE_SEED !== '1') seed()
}

function publicUser(row) {
  return { id: row.id, name: row.name, email: row.email }
}

export function createUser({ name, email, password }) {
  const now = new Date().toISOString()
  const passwordHash = bcrypt.hashSync(password, 10)
  const info = db.prepare(
    `INSERT INTO users (name, email, password_hash, created_at) VALUES (?, ?, ?, ?)`
  ).run(name, email, passwordHash, now)
  return publicUser(db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(info.lastInsertRowid))
}

export function findUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email)
}

export function verifyPassword(user, password) {
  return bcrypt.compareSync(password, user.password_hash)
}

export function createSession(userId) {
  const token = cryptoRandom()
  db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)').run(
    token,
    userId,
    new Date().toISOString()
  )
  return token
}

export function userFromToken(token) {
  if (!token) return null
  const row = db.prepare(`
    SELECT u.id, u.name, u.email, s.created_at AS session_created
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ?
  `).get(token)
  if (!row) return null
  const age = Date.now() - new Date(row.session_created).getTime()
  if (age > 30 * 24 * 60 * 60 * 1000) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token)
    return null
  }
  return { id: row.id, name: row.name, email: row.email }
}

export function deleteSession(token) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token)
}

function cryptoRandom() {
  return globalThis.crypto.randomUUID().replaceAll('-', '') + globalThis.crypto.randomUUID().replaceAll('-', '')
}

function memberIds(userId) {
  return new Set(
    db.prepare('SELECT workspace_id FROM workspace_members WHERE user_id = ?').all(userId).map((row) => row.workspace_id)
  )
}

function canSee(userId, note, members) {
  if (!note?.visibility) return false
  if (note.visibility === 'private') return note.author_id === userId
  return note.visibility === 'shared' && members.has(note.workspace_id)
}

function visibleSql() {
  return `(
    (n.visibility = 'private' AND n.author_id = @userId)
    OR (
      n.visibility = 'shared'
      AND n.workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = @userId)
    )
  )`
}

function scopeSql(filters) {
  if (filters.scope === 'personal') return `n.visibility = 'private' AND n.author_id = @userId`
  if (filters.scope === 'workspace') return `n.visibility = 'shared' AND n.workspace_id = @workspaceId`
  return '1 = 1'
}

const NOTE_SELECT = `
  SELECT
    n.id, n.author_id, n.workspace_id, n.visibility, n.body, n.link_url, n.link_title,
    n.image_name, n.reference_note_id, n.created_at, n.updated_at, n.day,
    u.name AS author_name,
    w.name AS workspace_name,
    rn.body AS reference_body,
    rn.visibility AS reference_visibility,
    rn.author_id AS reference_author_id,
    rn.workspace_id AS reference_workspace_id
  FROM notes n
  JOIN users u ON u.id = n.author_id
  LEFT JOIN workspaces w ON w.id = n.workspace_id
  LEFT JOIN notes rn ON rn.id = n.reference_note_id
`

const dateFormatters = new Map()
const dateTimeFormatters = new Map()

function dayInTimeZone(iso, timeZone = 'UTC') {
  let formatter = dateFormatters.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    dateFormatters.set(timeZone, formatter)
  }
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(iso)).map((part) => [part.type, part.value])
  )
  return `${parts.year}-${parts.month}-${parts.day}`
}

function timeZoneFromInput(value) {
  const timeZone = String(value || 'UTC').trim().slice(0, 80)
  try {
    new Intl.DateTimeFormat('en', { timeZone }).format()
    return timeZone
  } catch {
    throw new HttpError(400, 'Invalid time zone')
  }
}

function dateTimePartsInZone(date, timeZone) {
  let formatter = dateTimeFormatters.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
    dateTimeFormatters.set(timeZone, formatter)
  }
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value])
  )
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  }
}

function calendarParts(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new HttpError(400, 'Invalid calendar date')
  const [year, month, date] = day.split('-').map(Number)
  const check = new Date(Date.UTC(year, month - 1, date))
  if (
    check.getUTCFullYear() !== year
    || check.getUTCMonth() !== month - 1
    || check.getUTCDate() !== date
  ) {
    throw new HttpError(400, 'Invalid calendar date')
  }
  return { year, month, day: date }
}

function zonedWallTimeToUtc(day, clock, timeZone) {
  const calendar = calendarParts(day)
  const target = {
    ...calendar,
    hour: clock.hour,
    minute: clock.minute,
    second: clock.second,
  }
  const targetMs = Date.UTC(
    target.year,
    target.month - 1,
    target.day,
    target.hour,
    target.minute,
    target.second,
    clock.millisecond || 0
  )
  let guess = targetMs
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const shown = dateTimePartsInZone(new Date(guess), timeZone)
    const shownMs = Date.UTC(
      shown.year,
      shown.month - 1,
      shown.day,
      shown.hour,
      shown.minute,
      shown.second,
      clock.millisecond || 0
    )
    const correction = targetMs - shownMs
    if (correction === 0) break
    guess += correction
  }
  const result = new Date(guess)
  const shown = dateTimePartsInZone(result, timeZone)
  const matches = Object.entries(target).every(([key, value]) => shown[key] === value)
  return matches ? result : null
}

function creationMoment(calendarDay, timeZone) {
  const now = new Date()
  if (!calendarDay) {
    return { date: now, day: dayInTimeZone(now.toISOString(), timeZone) }
  }
  const day = String(calendarDay).trim()
  calendarParts(day)
  const currentClock = dateTimePartsInZone(now, timeZone)
  let date = zonedWallTimeToUtc(day, {
    ...currentClock,
    millisecond: now.getUTCMilliseconds(),
  }, timeZone)
  // A selected date can contain a DST gap at the current wall-clock time.
  // Noon is always a safe fallback and preserves the selected local date.
  if (!date) {
    date = zonedWallTimeToUtc(day, {
      hour: 12,
      minute: 0,
      second: 0,
      millisecond: 0,
    }, timeZone)
  }
  if (!date || dayInTimeZone(date.toISOString(), timeZone) !== day) {
    throw new HttpError(400, 'That calendar date is not available in this time zone')
  }
  return { date, day }
}

function hydrate(rows, userId, members, timeZone = 'UTC') {
  if (!rows.length) return []
  const ids = rows.map((row) => row.id)
  const marks = ids.map(() => '?').join(',')
  const items = db.prepare(
    `SELECT id, note_id, text, done, position FROM checklist_items WHERE note_id IN (${marks}) ORDER BY position, id`
  ).all(...ids)
  const tags = db.prepare(
    `SELECT nt.note_id, t.name FROM note_tags nt JOIN tags t ON t.id = nt.tag_id WHERE nt.note_id IN (${marks}) ORDER BY t.name`
  ).all(...ids)
  const itemsByNote = new Map()
  for (const item of items) {
    const list = itemsByNote.get(item.note_id) || []
    list.push({ id: item.id, text: item.text, done: Boolean(item.done) })
    itemsByNote.set(item.note_id, list)
  }
  const tagsByNote = new Map()
  for (const tag of tags) {
    const list = tagsByNote.get(tag.note_id) || []
    list.push(tag.name)
    tagsByNote.set(tag.note_id, list)
  }
  const ownedWorkspaceIds = new Set(
    db.prepare(`SELECT workspace_id FROM workspace_members WHERE user_id = ? AND role = 'owner'`)
      .all(userId)
      .map((row) => row.workspace_id)
  )
  return rows.map((row) => {
    const referenceOk = row.reference_note_id && canSee(userId, {
      visibility: row.reference_visibility,
      author_id: row.reference_author_id,
      workspace_id: row.reference_workspace_id,
    }, members)
    return {
      id: row.id,
      body: row.body,
      visibility: row.visibility,
      workspaceId: row.workspace_id,
      workspaceName: row.workspace_name,
      authorId: row.author_id,
      authorName: row.author_name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      day: dayInTimeZone(row.created_at, timeZone),
      linkUrl: row.link_url,
      linkTitle: row.link_title,
      imageName: row.image_name,
      tags: tagsByNote.get(row.id) || [],
      items: itemsByNote.get(row.id) || [],
      reference: referenceOk ? { id: row.reference_note_id, body: row.reference_body } : null,
      canEdit: row.author_id === userId
        || (row.visibility === 'shared' && ownedWorkspaceIds.has(row.workspace_id)),
    }
  })
}

function listRows(userId, filters) {
  const where = [visibleSql(), scopeSql(filters)]
  const params = { userId, workspaceId: Number(filters.workspaceId) || 0 }
  if (filters.view === 'tasks') {
    where.push('EXISTS (SELECT 1 FROM checklist_items ci WHERE ci.note_id = n.id AND ci.done = 0)')
  }
  if (filters.tag) {
    where.push(`EXISTS (
      SELECT 1 FROM note_tags nt JOIN tags t ON t.id = nt.tag_id
      WHERE nt.note_id = n.id AND lower(t.name) = lower(@tag)
    )`)
    params.tag = filters.tag
  }
  if (filters.q) {
    where.push(`(
      n.body LIKE @like
      OR IFNULL(n.link_title, '') LIKE @like
      OR EXISTS (SELECT 1 FROM checklist_items ci WHERE ci.note_id = n.id AND ci.text LIKE @like)
      OR EXISTS (
        SELECT 1 FROM note_tags nt JOIN tags t ON t.id = nt.tag_id
        WHERE nt.note_id = n.id AND t.name LIKE @like
      )
    )`)
    params.like = `%${filters.q}%`
  }
  const rows = db.prepare(`${NOTE_SELECT} WHERE ${where.join(' AND ')} ORDER BY n.created_at DESC, n.id DESC`).all(params)
  if (!filters.day) return rows
  return rows.filter((row) => dayInTimeZone(row.created_at, filters.timeZone) === filters.day)
}

export function feedFor(userId, filters) {
  const members = memberIds(userId)
  if (filters.scope === 'workspace' && !members.has(Number(filters.workspaceId))) {
    throw new HttpError(403, 'You are not a member of that workspace')
  }
  const scopeOnly = {
    scope: filters.scope,
    workspaceId: filters.workspaceId,
    timeZone: filters.timeZone,
  }
  return {
    notes: hydrate(listRows(userId, filters), userId, members, filters.timeZone),
    tags: tagsFor(userId, scopeOnly),
    days: daysFor(userId, filters.month, scopeOnly),
    tasks: unfinishedTasksFor(userId, scopeOnly),
    recent: hydrate(listRows(userId, scopeOnly), userId, members, filters.timeZone).slice(0, 15).map((note) => ({
      id: note.id,
      body: note.body,
    })),
  }
}

function tagsFor(userId, filters) {
  return db.prepare(`
    SELECT t.name AS name, COUNT(DISTINCT n.id) AS count
    FROM tags t
    JOIN note_tags nt ON nt.tag_id = t.id
    JOIN notes n ON n.id = nt.note_id
    WHERE ${visibleSql()} AND ${scopeSql(filters)}
    GROUP BY t.id
    ORDER BY t.name COLLATE NOCASE
  `).all({ userId, workspaceId: Number(filters.workspaceId) || 0 })
}

function daysFor(userId, month, filters) {
  const rows = db.prepare(`
    SELECT n.created_at
    FROM notes n
    WHERE ${visibleSql()} AND ${scopeSql(filters)}
    ORDER BY n.created_at
  `).all({
    userId,
    workspaceId: Number(filters.workspaceId) || 0,
  })
  const counts = new Map()
  for (const row of rows) {
    const day = dayInTimeZone(row.created_at, filters.timeZone)
    if (!day.startsWith(`${month}-`)) continue
    counts.set(day, (counts.get(day) || 0) + 1)
  }
  return [...counts].map(([day, count]) => ({ day, count }))
}

export function unfinishedTasksFor(userId, filters) {
  const members = memberIds(userId)
  if (filters.scope === 'workspace' && !members.has(Number(filters.workspaceId))) {
    throw new HttpError(403, 'You are not a member of that workspace')
  }
  const ownedWorkspaceIds = new Set(
    db.prepare(`SELECT workspace_id FROM workspace_members WHERE user_id = ? AND role = 'owner'`)
      .all(userId)
      .map((row) => row.workspace_id)
  )
  return db.prepare(`
    SELECT
      ci.id, ci.note_id, ci.text, ci.position,
      n.body AS note_body, n.author_id, n.visibility, n.workspace_id, n.created_at,
      u.name AS author_name, w.name AS workspace_name
    FROM checklist_items ci
    JOIN notes n ON n.id = ci.note_id
    JOIN users u ON u.id = n.author_id
    LEFT JOIN workspaces w ON w.id = n.workspace_id
    WHERE ci.done = 0 AND ${visibleSql()} AND ${scopeSql(filters)}
    ORDER BY n.created_at DESC, ci.position, ci.id
  `).all({
    userId,
    workspaceId: Number(filters.workspaceId) || 0,
  }).map((row) => ({
    id: row.id,
    noteId: row.note_id,
    text: row.text,
    noteBody: row.note_body,
    authorId: row.author_id,
    authorName: row.author_name,
    visibility: row.visibility,
    workspaceId: row.workspace_id,
    workspaceName: row.workspace_name,
    createdAt: row.created_at,
    canEdit: row.author_id === userId
      || (row.visibility === 'shared' && ownedWorkspaceIds.has(row.workspace_id)),
  }))
}

export function getNote(userId, noteId, timeZone = 'UTC') {
  const members = memberIds(userId)
  const row = db.prepare(`${NOTE_SELECT} WHERE n.id = ?`).get(noteId)
  if (!row || !canSee(userId, row, members)) return null
  return hydrate([row], userId, members, timeZone)[0]
}

function assertCanModify(userId, noteId) {
  const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(noteId)
  if (!note) throw new HttpError(404, 'Note not found')
  const members = memberIds(userId)
  if (!canSee(userId, note, members)) throw new HttpError(404, 'Note not found')
  if (note.author_id === userId) return { note, isAuthor: true }
  if (note.visibility === 'shared') {
    const membership = db.prepare(`
      SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?
    `).get(note.workspace_id, userId)
    if (membership?.role === 'owner') return { note, isAuthor: false }
  }
  throw new HttpError(403, 'Only the note author or workspace owner can change this note')
}

export function extractTags(body) {
  const seen = new Set()
  const tags = []
  for (const match of body.matchAll(TAG_PATTERN)) {
    const name = match[1].toLowerCase()
    if (!seen.has(name)) {
      seen.add(name)
      tags.push(name)
    }
  }
  return tags.slice(0, 8)
}

function cleanTags(value) {
  if (value == null) return []
  if (!Array.isArray(value)) throw new HttpError(400, 'Tags are invalid')
  if (value.length > 8) throw new HttpError(400, 'Use up to 8 tags')
  const seen = new Set()
  const tags = []
  for (const raw of value) {
    const name = String(raw || '').trim().replace(/^#/, '').toLowerCase()
    if (!name) continue
    if (!TAG_NAME_PATTERN.test(name)) {
      throw new HttpError(400, 'Tags use letters, numbers, hyphens, or underscores (24 characters max)')
    }
    if (!seen.has(name)) {
      seen.add(name)
      tags.push(name)
    }
  }
  return tags
}

function cleanItems(items) {
  if (!Array.isArray(items)) throw new HttpError(400, 'Checklist is invalid')
  return items
    .map((item) => ({
      text: String(item?.text || '').trim().slice(0, 300),
      done: Boolean(item?.done),
    }))
    .filter((item) => item.text)
    .slice(0, 30)
}

function cleanLink(url, title) {
  const linkUrl = String(url || '').trim()
  const linkTitle = String(title || '').trim().slice(0, 180)
  if (!linkUrl) return { linkUrl: null, linkTitle: null }
  let parsed
  try {
    parsed = new URL(linkUrl)
  } catch {
    throw new HttpError(400, 'Link must be a valid URL')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new HttpError(400, 'Link must start with http or https')
  }
  return { linkUrl: parsed.toString(), linkTitle: linkTitle || parsed.hostname }
}

function normalizeNote(userId, input, { noteId } = {}) {
  const body = String(input.body || '').trim()
  if (!body) throw new HttpError(400, 'Write something before saving')
  if (body.length > 8000) throw new HttpError(400, 'Note is too long')
  const visibility = input.visibility === 'shared' ? 'shared' : 'private'
  let workspaceId = positiveId(input.workspaceId)
  if (visibility === 'private') workspaceId = null
  if (visibility === 'shared') {
    if (!workspaceId) throw new HttpError(400, 'Choose a workspace for a shared note')
    const member = db.prepare(
      'SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?'
    ).get(workspaceId, userId)
    if (!member) throw new HttpError(403, 'You are not a member of that workspace')
  }
  let referenceNoteId = input.referenceNoteId ? positiveId(input.referenceNoteId) : null
  if (input.referenceNoteId && !referenceNoteId) throw new HttpError(400, 'That reference is not available')
  if (referenceNoteId) {
    if (referenceNoteId === noteId) throw new HttpError(400, 'A note cannot reference itself')
    if (!getNote(userId, referenceNoteId)) throw new HttpError(400, 'That reference is not available')
  } else {
    referenceNoteId = null
  }
  const link = cleanLink(input.linkUrl, input.linkTitle)
  return {
    body,
    visibility,
    workspaceId,
    items: cleanItems(input.items),
    tags: [...new Set([...cleanTags(input.tags), ...extractTags(body)])].slice(0, 8),
    referenceNoteId,
    timeZone: timeZoneFromInput(input.timeZone),
    ...link,
  }
}

function positiveId(value) {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

function replaceChildren(noteId, items, tags) {
  db.prepare('DELETE FROM checklist_items WHERE note_id = ?').run(noteId)
  const insertItem = db.prepare(
    'INSERT INTO checklist_items (note_id, text, done, position) VALUES (?, ?, ?, ?)'
  )
  items.forEach((item, position) => insertItem.run(noteId, item.text, item.done ? 1 : 0, position))
  db.prepare('DELETE FROM note_tags WHERE note_id = ?').run(noteId)
  const insertTag = db.prepare('INSERT INTO tags (name) VALUES (?) ON CONFLICT(name) DO NOTHING')
  const findTag = db.prepare('SELECT id FROM tags WHERE name = ?')
  const linkTag = db.prepare('INSERT INTO note_tags (note_id, tag_id) VALUES (?, ?)')
  for (const name of [...new Set(tags.map((tag) => String(tag || '').trim().toLowerCase()).filter(Boolean))]) {
    insertTag.run(name)
    linkTag.run(noteId, findTag.get(name).id)
  }
}

function removeFile(name) {
  if (!name) return
  const full = path.join(uploadDir, name)
  if (full.startsWith(uploadDir) && fs.existsSync(full)) fs.unlinkSync(full)
}

export function createNote(userId, input) {
  const note = normalizeNote(userId, input)
  const creation = creationMoment(input.calendarDay, note.timeZone)
  const iso = creation.date.toISOString()
  const day = creation.day
  const id = db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO notes (
        author_id, workspace_id, visibility, body, link_url, link_title, image_name,
        reference_note_id, created_at, updated_at, day
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      note.workspaceId,
      note.visibility,
      note.body,
      note.linkUrl,
      note.linkTitle,
      input.imageName || null,
      note.referenceNoteId,
      iso,
      iso,
      day
    )
    const noteId = Number(info.lastInsertRowid)
    replaceChildren(noteId, note.items, note.tags)
    return noteId
  })()
  return getNote(userId, id, note.timeZone)
}

export function updateNote(userId, noteId, input) {
  const access = assertCanModify(userId, noteId)
  const existing = access.note
  const effectiveInput = access.isAuthor ? input : {
    ...input,
    visibility: 'shared',
    workspaceId: existing.workspace_id,
  }
  const note = normalizeNote(userId, effectiveInput, { noteId })
  let imageName = existing.image_name
  if (input.removeImage && imageName) {
    removeFile(imageName)
    imageName = null
  }
  if (input.imageName) {
    if (imageName && imageName !== input.imageName) removeFile(imageName)
    imageName = input.imageName
  }
  db.transaction(() => {
    db.prepare(`
      UPDATE notes
      SET workspace_id = ?, visibility = ?, body = ?, link_url = ?, link_title = ?,
          image_name = ?, reference_note_id = ?, updated_at = ?
      WHERE id = ?
    `).run(
      note.workspaceId,
      note.visibility,
      note.body,
      note.linkUrl,
      note.linkTitle,
      imageName,
      note.referenceNoteId,
      new Date().toISOString(),
      noteId
    )
    replaceChildren(noteId, note.items, note.tags)
  })()
  return getNote(userId, noteId, note.timeZone)
}

export function deleteNote(userId, noteId) {
  const { note: existing } = assertCanModify(userId, noteId)
  removeFile(existing.image_name)
  db.prepare('DELETE FROM notes WHERE id = ?').run(noteId)
}

export function setItemDone(userId, noteId, itemId, done) {
  assertCanModify(userId, noteId)
  const note = getNote(userId, noteId)
  const item = note.items.find((entry) => entry.id === Number(itemId))
  if (!item) throw new HttpError(404, 'Checklist item not found')
  db.prepare('UPDATE checklist_items SET done = ? WHERE id = ? AND note_id = ?').run(
    done ? 1 : 0,
    item.id,
    noteId
  )
  return getNote(userId, noteId)
}

export function fileIsVisible(userId, filename) {
  const rows = db.prepare('SELECT author_id, visibility, workspace_id FROM notes WHERE image_name = ?').all(filename)
  const members = memberIds(userId)
  return rows.some((row) => canSee(userId, row, members))
}

export function listWorkspaces(userId) {
  return db.prepare(`
    SELECT w.id, w.name, w.description, w.owner_id, w.created_at, m.role,
      (SELECT COUNT(*) FROM workspace_members wm WHERE wm.workspace_id = w.id) AS member_count
    FROM workspaces w
    JOIN workspace_members m ON m.workspace_id = w.id AND m.user_id = ?
    ORDER BY w.name COLLATE NOCASE
  `).all(userId).map(presentWorkspace)
}

function presentWorkspace(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    ownerId: row.owner_id,
    createdAt: row.created_at,
    role: row.role,
    memberCount: row.member_count,
  }
}

export function createWorkspace(userId, name, description) {
  const cleanName = String(name || '').trim()
  const cleanDescription = String(description || '').trim().slice(0, 240)
  if (cleanName.length < 2) throw new HttpError(400, 'Workspace name needs at least 2 characters')
  if (cleanName.length > 40) throw new HttpError(400, 'Workspace name is too long')
  const now = new Date().toISOString()
  const id = db.transaction(() => {
    const info = db.prepare(
      'INSERT INTO workspaces (name, description, owner_id, created_at) VALUES (?, ?, ?, ?)'
    ).run(cleanName, cleanDescription, userId, now)
    const workspaceId = Number(info.lastInsertRowid)
    db.prepare(
      `INSERT INTO workspace_members (workspace_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)`
    ).run(workspaceId, userId, now)
    return workspaceId
  })()
  return getWorkspace(userId, id)
}

export function getWorkspace(userId, workspaceId) {
  const row = db.prepare(`
    SELECT w.id, w.name, w.description, w.owner_id, w.created_at, m.role,
      (SELECT COUNT(*) FROM workspace_members wm WHERE wm.workspace_id = w.id) AS member_count
    FROM workspaces w
    JOIN workspace_members m ON m.workspace_id = w.id AND m.user_id = ?
    WHERE w.id = ?
  `).get(userId, workspaceId)
  if (!row) return null
  const members = db.prepare(`
    SELECT u.id, u.name, u.email, wm.role
    FROM workspace_members wm
    JOIN users u ON u.id = wm.user_id
    WHERE wm.workspace_id = ?
    ORDER BY CASE wm.role WHEN 'owner' THEN 0 ELSE 1 END, u.name COLLATE NOCASE
  `).all(workspaceId)
  const pendingInvitations = row.role === 'owner' ? db.prepare(`
    SELECT wi.id, wi.invitee_id, wi.created_at, u.name, u.email
    FROM workspace_invitations wi
    JOIN users u ON u.id = wi.invitee_id
    WHERE wi.workspace_id = ? AND wi.status = 'pending'
    ORDER BY wi.created_at, wi.id
  `).all(workspaceId).map((invitation) => ({
    id: invitation.id,
    userId: invitation.invitee_id,
    name: invitation.name,
    email: invitation.email,
    createdAt: invitation.created_at,
  })) : []
  return { ...presentWorkspace(row), members, pendingInvitations }
}

export function inviteMember(actorId, workspaceId, email) {
  const workspace = getWorkspace(actorId, workspaceId)
  if (!workspace) throw new HttpError(404, 'Workspace not found')
  if (workspace.role !== 'owner') throw new HttpError(403, 'Only the owner can invite members')
  const cleanEmail = String(email || '').trim().toLowerCase()
  const user = findUserByEmail(cleanEmail)
  if (!user) throw new HttpError(404, 'No account uses that email')
  const existing = db.prepare(
    'SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?'
  ).get(workspaceId, user.id)
  if (existing) throw new HttpError(409, 'That person is already a member')
  const pending = db.prepare(`
    SELECT id FROM workspace_invitations
    WHERE workspace_id = ? AND invitee_id = ? AND status = 'pending'
  `).get(workspaceId, user.id)
  if (pending) throw new HttpError(409, 'That person already has a pending invitation')
  db.prepare(`
    INSERT INTO workspace_invitations (
      workspace_id, invitee_id, invited_by, status, created_at
    ) VALUES (?, ?, ?, 'pending', ?)
  `).run(workspaceId, user.id, actorId, new Date().toISOString())
  return getWorkspace(actorId, workspaceId)
}

export function listWorkspaceInvitations(userId) {
  return db.prepare(`
    SELECT wi.id, wi.workspace_id, wi.created_at,
      w.name AS workspace_name, w.description AS workspace_description,
      u.name AS inviter_name
    FROM workspace_invitations wi
    JOIN workspaces w ON w.id = wi.workspace_id
    JOIN users u ON u.id = wi.invited_by
    WHERE wi.invitee_id = ? AND wi.status = 'pending'
    ORDER BY wi.created_at DESC, wi.id DESC
  `).all(userId).map((row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    workspaceName: row.workspace_name,
    workspaceDescription: row.workspace_description,
    inviterName: row.inviter_name,
    createdAt: row.created_at,
  }))
}

export function cancelWorkspaceInvitation(actorId, workspaceId, invitationId) {
  const workspace = getWorkspace(actorId, workspaceId)
  if (!workspace) throw new HttpError(404, 'Workspace not found')
  if (workspace.role !== 'owner') throw new HttpError(403, 'Only the owner can cancel invitations')
  const result = db.prepare(`
    DELETE FROM workspace_invitations
    WHERE id = ? AND workspace_id = ? AND status = 'pending'
  `).run(invitationId, workspaceId)
  if (!result.changes) throw new HttpError(404, 'Invitation not found')
  return getWorkspace(actorId, workspaceId)
}

export function respondToWorkspaceInvitation(userId, invitationId, accept) {
  return db.transaction(() => {
    const invitation = db.prepare(`
      SELECT id, workspace_id
      FROM workspace_invitations
      WHERE id = ? AND invitee_id = ? AND status = 'pending'
    `).get(invitationId, userId)
    if (!invitation) throw new HttpError(404, 'Invitation not found')
    const now = new Date().toISOString()
    if (accept) {
      const existing = db.prepare(`
        SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?
      `).get(invitation.workspace_id, userId)
      if (existing) throw new HttpError(409, 'You are already a member of that workspace')
      db.prepare(`
        INSERT INTO workspace_members (workspace_id, user_id, role, joined_at)
        VALUES (?, ?, 'member', ?)
      `).run(invitation.workspace_id, userId, now)
    }
    db.prepare(`
      UPDATE workspace_invitations SET status = ?, responded_at = ? WHERE id = ?
    `).run(accept ? 'accepted' : 'declined', now, invitation.id)
    return accept ? getWorkspace(userId, invitation.workspace_id) : null
  })()
}

export function removeMember(actorId, workspaceId, memberId) {
  const workspace = getWorkspace(actorId, workspaceId)
  if (!workspace) throw new HttpError(404, 'Workspace not found')
  if (workspace.role !== 'owner') throw new HttpError(403, 'Only the owner can remove members')
  if (Number(memberId) === workspace.ownerId) throw new HttpError(400, 'The owner stays in the workspace')
  const result = db.prepare(
    `DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ? AND role = 'member'`
  ).run(workspaceId, memberId)
  if (!result.changes) throw new HttpError(404, 'Member not found')
  return getWorkspace(actorId, workspaceId)
}

export function transferWorkspaceOwnership(actorId, workspaceId, memberId) {
  const workspace = getWorkspace(actorId, workspaceId)
  if (!workspace) throw new HttpError(404, 'Workspace not found')
  if (workspace.role !== 'owner') throw new HttpError(403, 'Only the owner can transfer ownership')
  const nextOwnerId = Number(memberId)
  if (!Number.isInteger(nextOwnerId) || nextOwnerId < 1) {
    throw new HttpError(400, 'Choose a valid workspace member')
  }
  if (nextOwnerId === actorId) throw new HttpError(400, 'You already own this workspace')
  const member = db.prepare(`
    SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?
  `).get(workspaceId, nextOwnerId)
  if (!member) throw new HttpError(404, 'Member not found')
  db.transaction(() => {
    db.prepare('UPDATE workspaces SET owner_id = ? WHERE id = ?').run(nextOwnerId, workspaceId)
    db.prepare(`UPDATE workspace_members SET role = 'member' WHERE workspace_id = ? AND user_id = ?`)
      .run(workspaceId, actorId)
    db.prepare(`UPDATE workspace_members SET role = 'owner' WHERE workspace_id = ? AND user_id = ?`)
      .run(workspaceId, nextOwnerId)
  })()
  return getWorkspace(actorId, workspaceId)
}

export function leaveWorkspace(userId, workspaceId) {
  const workspace = getWorkspace(userId, workspaceId)
  if (!workspace) throw new HttpError(404, 'Workspace not found')
  if (workspace.role === 'owner') {
    throw new HttpError(400, 'Transfer ownership or delete the workspace before leaving')
  }
  db.prepare('DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
    .run(workspaceId, userId)
}

export function deleteWorkspace(actorId, workspaceId) {
  const workspace = getWorkspace(actorId, workspaceId)
  if (!workspace) throw new HttpError(404, 'Workspace not found')
  if (workspace.role !== 'owner') throw new HttpError(403, 'Only the owner can delete a workspace')
  const images = db.prepare('SELECT image_name FROM notes WHERE workspace_id = ? AND image_name IS NOT NULL').all(workspaceId)
  db.prepare('DELETE FROM workspaces WHERE id = ?').run(workspaceId)
  for (const row of images) removeFile(row.image_name)
}

function localDay(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function at(dayOffset, hours, minutes) {
  const date = new Date()
  date.setDate(date.getDate() + dayOffset)
  date.setHours(hours, minutes, 0, 0)
  return date
}

function seed() {
  const existing = db.prepare('SELECT COUNT(*) AS count FROM users').get().count
  if (existing > 0) return
  const sketchSrc = path.join(rootDir, 'assets', 'sketch.svg')
  const sketchName = 'seed-sketch.svg'
  if (fs.existsSync(sketchSrc)) fs.copyFileSync(sketchSrc, path.join(uploadDir, sketchName))
  const passwordHash = bcrypt.hashSync('memoflow', 10)
  const now = new Date().toISOString()
  const insertUser = db.prepare(
    'INSERT INTO users (name, email, password_hash, created_at) VALUES (?, ?, ?, ?)'
  )
  const gauriId = Number(insertUser.run('Gauri', 'gauri@memoflow.app', passwordHash, now).lastInsertRowid)
  const alexId = Number(insertUser.run('Alex', 'alex@memoflow.app', passwordHash, now).lastInsertRowid)
  const workspaceId = Number(db.prepare(
    'INSERT INTO workspaces (name, description, owner_id, created_at) VALUES (?, ?, ?, ?)'
  ).run('Product', 'Notes for the product team.', gauriId, now).lastInsertRowid)
  const addMemberRow = db.prepare(
    'INSERT INTO workspace_members (workspace_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)'
  )
  addMemberRow.run(workspaceId, gauriId, 'owner', now)
  addMemberRow.run(workspaceId, alexId, 'member', now)

  const insert = db.transaction(() => {
    const ideasId = insertSeedNote({
      authorId: gauriId,
      workspaceId,
      visibility: 'shared',
      body: 'Try showing the result before asking people to sign up. #ideas',
      when: new Date(2026, 9, 16, 11, 20, 0),
    })
    insertSeedNote({
      authorId: gauriId,
      workspaceId,
      visibility: 'shared',
      body: 'Before the next release #project',
      when: at(0, 10, 42),
      items: [
        { text: 'Sketch the first screen', done: true },
        { text: 'Polish the preview', done: false },
        { text: 'Write a short changelog', done: false },
      ],
    })
    insertSeedNote({
      authorId: gauriId,
      workspaceId,
      visibility: 'shared',
      body: "Keep the first step small. Reveal the details when they're needed. #reading",
      linkUrl: 'https://www.nngroup.com/articles/progressive-disclosure/',
      linkTitle: 'Progressive Disclosure — Nielsen Norman Group',
      when: at(0, 9, 18),
    })
    insertSeedNote({
      authorId: gauriId,
      workspaceId,
      visibility: 'shared',
      body: 'A simpler first screen. One input, then a preview. #design',
      imageName: sketchName,
      when: at(-1, 15, 20),
    })
    insertSeedNote({
      authorId: gauriId,
      workspaceId,
      visibility: 'shared',
      body: "Tried yesterday's idea. Both people reached the preview without help. #project",
      referenceNoteId: ideasId,
      when: at(-1, 10, 5),
    })
    insertSeedNote({
      authorId: gauriId,
      visibility: 'private',
      body: 'Hold the pricing notes until the preview feels obvious. #ideas',
      when: at(0, 8, 12),
    })
    insertSeedNote({
      authorId: alexId,
      workspaceId,
      visibility: 'shared',
      body: 'Empty states should show the result, not a tour. #design',
      when: at(-1, 16, 5),
    })
  })
  insert()
}

function insertSeedNote({
  authorId,
  workspaceId = null,
  visibility,
  body,
  linkUrl = null,
  linkTitle = null,
  imageName = null,
  referenceNoteId = null,
  when,
  items = [],
}) {
  const iso = when.toISOString()
  const info = db.prepare(`
    INSERT INTO notes (
      author_id, workspace_id, visibility, body, link_url, link_title, image_name,
      reference_note_id, created_at, updated_at, day
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    authorId,
    workspaceId,
    visibility,
    body,
    linkUrl,
    linkTitle,
    imageName,
    referenceNoteId,
    iso,
    iso,
    localDay(when)
  )
  const noteId = Number(info.lastInsertRowid)
  replaceChildren(noteId, items, extractTags(body))
  return noteId
}
