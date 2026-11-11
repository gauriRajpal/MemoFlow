import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { Router } from 'express'
import multer from 'multer'
import {
  fileIsVisible,
  uploadDir,
  feedFor,
  unfinishedTasksFor,
  getNote,
  createNote,
  updateNote,
  deleteNote,
  setItemDone,
} from '../db.js'
import { asyncRoute, HttpError } from '../errors.js'
import { requireUser } from '../auth.js'

const router = Router()

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    cb(null, `${crypto.randomBytes(16).toString('hex')}${ext}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    if (!['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) {
      cb(new HttpError(400, 'Use a PNG, JPG, GIF, or WebP image'))
      return
    }
    cb(null, true)
  },
})

function withUpload(req, res, next) {
  upload.single('image')(req, res, (err) => {
    if (!err) return next()
    if (req.file) fs.unlink(req.file.path, () => {})
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'Image must be under 2 MB' })
    const status = err.status || 400
    return res.status(status).json({ error: err.message || 'Could not upload that image' })
  })
}

function readItems(value) {
  if (Array.isArray(value)) return value
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value)
      if (!Array.isArray(parsed)) throw new Error('bad')
      return parsed
    } catch {
      throw new HttpError(400, 'Checklist is invalid')
    }
  }
  return []
}

function readTags(value) {
  if (Array.isArray(value)) return value
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value)
      if (!Array.isArray(parsed)) throw new Error('bad')
      return parsed
    } catch {
      throw new HttpError(400, 'Tags are invalid')
    }
  }
  return []
}

function payloadFrom(req) {
  const body = req.body || {}
  return {
    body: body.body,
    visibility: body.visibility,
    workspaceId: body.workspaceId,
    calendarDay: body.calendarDay,
    timeZone: body.timeZone,
    tags: readTags(body.tags),
    items: readItems(body.items),
    linkUrl: body.linkUrl,
    linkTitle: body.linkTitle,
    referenceNoteId: body.referenceNoteId,
    removeImage: body.removeImage === true || body.removeImage === 'true',
    imageName: req.file ? req.file.filename : null,
  }
}

function filtersFrom(query) {
  const month = /^\d{4}-\d{2}$/.test(query.month || '') ? query.month : currentMonth()
  const day = /^\d{4}-\d{2}-\d{2}$/.test(query.day || '') ? query.day : ''
  const tag = /^[a-z0-9-]{1,24}$/i.test(query.tag || '') ? query.tag : ''
  const q = String(query.q || '').trim().slice(0, 100).replace(/[%_]/g, '')
  const scope = ['personal', 'workspace'].includes(query.scope) ? query.scope : 'all'
  const view = query.view === 'tasks' ? 'tasks' : ''
  const timeZone = timeZoneFrom(query.timeZone)
  return {
    month,
    day,
    tag,
    q,
    scope,
    view,
    timeZone,
    workspaceId: query.workspaceId,
  }
}

function timeZoneFrom(value) {
  const timeZone = String(value || 'UTC').trim().slice(0, 80)
  try {
    new Intl.DateTimeFormat('en', { timeZone }).format()
    return timeZone
  } catch {
    throw new HttpError(400, 'Invalid time zone')
  }
}

function currentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function parseId(value, label) {
  const id = Number(value)
  if (!Number.isInteger(id) || id < 1) throw new HttpError(400, `Invalid ${label}`)
  return id
}

router.get('/', requireUser, asyncRoute(async (req, res) => {
  res.json(feedFor(req.user.id, filtersFrom(req.query)))
}))

router.get('/tasks/unfinished', requireUser, asyncRoute(async (req, res) => {
  res.json({ tasks: unfinishedTasksFor(req.user.id, filtersFrom(req.query)) })
}))

router.get('/:id', requireUser, asyncRoute(async (req, res) => {
  const note = getNote(
    req.user.id,
    parseId(req.params.id, 'note'),
    timeZoneFrom(req.query.timeZone)
  )
  if (!note) throw new HttpError(404, 'Note not found')
  res.json({ note })
}))

router.post('/', requireUser, withUpload, asyncRoute(async (req, res) => {
  try {
    const note = createNote(req.user.id, payloadFrom(req))
    res.status(201).json({ note })
  } catch (error) {
    if (req.file) fs.unlink(req.file.path, () => {})
    throw error
  }
}))

router.put('/:id', requireUser, withUpload, asyncRoute(async (req, res) => {
  try {
    const note = updateNote(req.user.id, parseId(req.params.id, 'note'), payloadFrom(req))
    res.json({ note })
  } catch (error) {
    if (req.file) fs.unlink(req.file.path, () => {})
    throw error
  }
}))

router.delete('/:id', requireUser, asyncRoute(async (req, res) => {
  deleteNote(req.user.id, parseId(req.params.id, 'note'))
  res.json({ ok: true })
}))

router.patch('/:id/items/:itemId', requireUser, asyncRoute(async (req, res) => {
  if (typeof req.body?.done !== 'boolean') throw new HttpError(400, 'Task status must be true or false')
  const note = setItemDone(
    req.user.id,
    parseId(req.params.id, 'note'),
    parseId(req.params.itemId, 'checklist item'),
    req.body.done
  )
  res.json({ note })
}))

const TYPES = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
}

router.get('/files/:name', requireUser, asyncRoute(async (req, res) => {
  const name = req.params.name
  if (!/^[a-zA-Z0-9._-]+$/.test(name) || path.basename(name) !== name) {
    throw new HttpError(400, 'Unknown file')
  }
  if (!fileIsVisible(req.user.id, name)) throw new HttpError(404, 'File not found')
  const full = path.join(uploadDir, name)
  if (!full.startsWith(uploadDir) || !fs.existsSync(full)) throw new HttpError(404, 'File not found')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'")
  res.setHeader('Cache-Control', 'private, max-age=3600')
  res.type(TYPES[path.extname(name).toLowerCase()] || 'application/octet-stream')
  res.sendFile(full)
}))

export default router
