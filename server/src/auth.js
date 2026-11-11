import { userFromToken } from './db.js'

export const SESSION_COOKIE = 'memoflow_session'
const SESSION_MAX_AGE = 30 * 24 * 60 * 60 * 1000

function cookiesFrom(req) {
  const cookies = new Map()
  for (const part of String(req.headers.cookie || '').split(';')) {
    const separator = part.indexOf('=')
    if (separator < 1) continue
    const name = part.slice(0, separator).trim()
    const value = part.slice(separator + 1).trim()
    try {
      cookies.set(name, decodeURIComponent(value))
    } catch {
      // Ignore malformed cookie values.
    }
  }
  return cookies
}

export function tokenFrom(req) {
  return cookiesFrom(req).get(SESSION_COOKIE) || ''
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  }
}

export function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions(), maxAge: SESSION_MAX_AGE })
}

export function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, cookieOptions())
}

export function requireUser(req, res, next) {
  const token = tokenFrom(req)
  const user = userFromToken(token)
  if (!user) return res.status(401).json({ error: 'Sign in required' })
  req.user = user
  req.sessionToken = token
  next()
}
