import { Router } from 'express'
import {
  createSession,
  createUser,
  deleteSession,
  findUserByEmail,
  userFromToken,
  verifyPassword,
} from '../db.js'
import { asyncRoute, HttpError } from '../errors.js'
import { clearSessionCookie, setSessionCookie, tokenFrom } from '../auth.js'

const router = Router()

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store')
  next()
})

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email }
}

router.post('/register', asyncRoute(async (req, res) => {
  const name = String(req.body?.name || '').trim()
  const email = String(req.body?.email || '').trim().toLowerCase()
  const password = String(req.body?.password || '')
  if (name.length < 2 || name.length > 40) throw new HttpError(400, 'Name needs 2 to 40 characters')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Enter a valid email')
  if (email.length > 254) throw new HttpError(400, 'Email is too long')
  if (password.length < 6 || password.length > 128) {
    throw new HttpError(400, 'Password needs 6 to 128 characters')
  }
  if (findUserByEmail(email)) throw new HttpError(409, 'An account with that email already exists')
  const user = createUser({ name, email, password })
  setSessionCookie(res, createSession(user.id))
  res.status(201).json({ user })
}))

router.post('/login', asyncRoute(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase()
  const password = String(req.body?.password || '')
  if (email.length > 254 || password.length > 128) {
    throw new HttpError(401, 'Email or password is incorrect')
  }
  const user = findUserByEmail(email)
  if (!user || !verifyPassword(user, password)) {
    throw new HttpError(401, 'Email or password is incorrect')
  }
  setSessionCookie(res, createSession(user.id))
  res.json({ user: publicUser(user) })
}))

router.post('/logout', (req, res) => {
  deleteSession(tokenFrom(req))
  clearSessionCookie(res)
  res.json({ ok: true })
})

router.get('/me', (req, res) => {
  const user = userFromToken(tokenFrom(req))
  if (!user) clearSessionCookie(res)
  res.json({ user })
})

export default router
