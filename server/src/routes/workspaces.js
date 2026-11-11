import { Router } from 'express'
import {
  cancelWorkspaceInvitation,
  createWorkspace,
  deleteWorkspace,
  getWorkspace,
  inviteMember,
  leaveWorkspace,
  listWorkspaceInvitations,
  listWorkspaces,
  removeMember,
  respondToWorkspaceInvitation,
  transferWorkspaceOwnership,
} from '../db.js'
import { asyncRoute, HttpError } from '../errors.js'
import { requireUser } from '../auth.js'

const router = Router()
router.use(requireUser)

function parseId(value, label) {
  const id = Number(value)
  if (!Number.isInteger(id) || id < 1) throw new HttpError(400, `Invalid ${label}`)
  return id
}

router.get('/', asyncRoute(async (req, res) => {
  res.json({
    workspaces: listWorkspaces(req.user.id),
    invitations: listWorkspaceInvitations(req.user.id),
  })
}))

router.post('/', asyncRoute(async (req, res) => {
  const workspace = createWorkspace(req.user.id, req.body?.name, req.body?.description)
  res.status(201).json({ workspace })
}))

router.post('/invitations/:invitationId/accept', asyncRoute(async (req, res) => {
  const workspace = respondToWorkspaceInvitation(
    req.user.id,
    parseId(req.params.invitationId, 'invitation'),
    true
  )
  res.json({ workspace })
}))

router.post('/invitations/:invitationId/decline', asyncRoute(async (req, res) => {
  respondToWorkspaceInvitation(
    req.user.id,
    parseId(req.params.invitationId, 'invitation'),
    false
  )
  res.json({ ok: true })
}))

router.get('/:id', asyncRoute(async (req, res) => {
  const workspace = getWorkspace(req.user.id, parseId(req.params.id, 'workspace'))
  if (!workspace) throw new HttpError(404, 'Workspace not found')
  res.json({ workspace })
}))

router.post('/:id/invitations', asyncRoute(async (req, res) => {
  const workspace = inviteMember(req.user.id, parseId(req.params.id, 'workspace'), req.body?.email)
  res.status(201).json({ workspace })
}))

router.delete('/:id/invitations/:invitationId', asyncRoute(async (req, res) => {
  const workspace = cancelWorkspaceInvitation(
    req.user.id,
    parseId(req.params.id, 'workspace'),
    parseId(req.params.invitationId, 'invitation')
  )
  res.json({ workspace })
}))

router.delete('/:id/members/:userId', asyncRoute(async (req, res) => {
  const workspace = removeMember(
    req.user.id,
    parseId(req.params.id, 'workspace'),
    parseId(req.params.userId, 'member')
  )
  res.json({ workspace })
}))

router.patch('/:id/owner', asyncRoute(async (req, res) => {
  const workspace = transferWorkspaceOwnership(
    req.user.id,
    parseId(req.params.id, 'workspace'),
    parseId(req.body?.userId, 'member')
  )
  res.json({ workspace })
}))

router.post('/:id/leave', asyncRoute(async (req, res) => {
  leaveWorkspace(req.user.id, parseId(req.params.id, 'workspace'))
  res.json({ ok: true })
}))

router.delete('/:id', asyncRoute(async (req, res) => {
  deleteWorkspace(req.user.id, parseId(req.params.id, 'workspace'))
  res.json({ ok: true })
}))

export default router
