import fs from 'fs'
import path from 'path'
import express from 'express'
import cors from 'cors'
import { initDb, rootDir } from './db.js'
import { HttpError } from './errors.js'
import authRoutes from './routes/auth.js'
import noteRoutes from './routes/notes.js'
import workspaceRoutes from './routes/workspaces.js'

initDb()

const app = express()
app.disable('x-powered-by')
app.use(cors())
app.use(express.json({ limit: '1mb' }))

app.get('/api/health', (req, res) => {
  res.json({ ok: true })
})

app.use('/api/auth', authRoutes)
app.use('/api/notes', noteRoutes)
app.use('/api/workspaces', workspaceRoutes)

const dist = path.join(rootDir, '..', 'client', 'dist')
if (fs.existsSync(dist)) {
  app.use(express.static(dist))
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next()
    res.sendFile(path.join(dist, 'index.html'))
  })
}

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err)
  const status = err.status || 500
  if (status >= 500) console.error(err)
  res.status(status).json({ error: status >= 500 ? 'Something went wrong' : err.message })
})

const port = Number(process.env.PORT) || 4000
app.listen(port, '127.0.0.1', () => {
  console.log(`MemoFlow API on http://127.0.0.1:${port}`)
})
