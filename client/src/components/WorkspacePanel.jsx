import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { ConfirmDialog, EmptyState, LoadingState } from './Feedback.jsx'

export default function WorkspacePanel({ workspaces, invitations = [], onChanged, onOpen, onNotify = () => {} }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function createWorkspace(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api('/api/workspaces', { method: 'POST', json: { name, description } })
      setName('')
      setDescription('')
      onChanged()
      onNotify('Workspace created')
    } catch (err) {
      setError(err.message)
      onNotify(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  async function respondToInvitation(invitationId, action) {
    setBusy(true)
    setError('')
    try {
      await api(`/api/workspaces/invitations/${invitationId}/${action}`, { method: 'POST' })
      onChanged()
      onNotify(action === 'accept' ? 'Invitation accepted' : 'Invitation declined')
    } catch (err) {
      setError(err.message)
      onNotify(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <h1 className="text-xl font-semibold">Workspaces</h1>
      <p className="mt-1 text-sm text-muted">Shared notes are visible to every member of a workspace.</p>
      <form onSubmit={createWorkspace} className="mt-5 grid gap-2 rounded-xl border border-line bg-card p-4 sm:grid-cols-[1fr_1fr_auto]">
        <input name="workspaceName" value={name} onChange={(event) => setName(event.target.value)} placeholder="New workspace" required className="rounded-lg border border-line bg-ink px-3 py-2 text-sm outline-none focus:border-accent" />
        <input name="workspaceDescription" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What is it for?" className="rounded-lg border border-line bg-ink px-3 py-2 text-sm outline-none focus:border-accent" />
        <button type="submit" disabled={busy} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Create</button>
      </form>
      {error && <p className="mt-2 text-sm text-[#f0b4b4]">{error}</p>}
      {invitations.length > 0 && (
        <section className="mt-5 rounded-xl border border-line bg-card p-4">
          <h2 className="font-semibold">Invitations</h2>
          <p className="mt-1 text-xs text-muted">Accept an invitation before the workspace and its notes become available.</p>
          <ul className="mt-3 divide-y divide-line">
            {invitations.map((invitation) => (
              <li key={invitation.id} className="flex flex-wrap items-center gap-2 py-3 sm:gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{invitation.workspaceName}</div>
                  {invitation.workspaceDescription && <div className="mt-0.5 text-xs text-muted">{invitation.workspaceDescription}</div>}
                  <div className="mt-1 text-xs text-muted">Invited by {invitation.inviterName}</div>
                </div>
                <button type="button" disabled={busy} onClick={() => respondToInvitation(invitation.id, 'accept')} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">Accept</button>
                <button type="button" disabled={busy} onClick={() => respondToInvitation(invitation.id, 'decline')} className="rounded-lg border border-line px-3 py-1.5 text-sm text-soft hover:bg-white/5 disabled:opacity-50">Decline</button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="mt-5 space-y-4">
        {workspaces.length === 0 && invitations.length === 0 && (
          <EmptyState title="No shared spaces yet" description="Create a workspace to share notes, tasks, and context with other MemoFlow members." />
        )}
        {workspaces.map((workspace) => (
          <WorkspaceCard key={`${workspace.id}-${workspace.memberCount}`} workspace={workspace} onChanged={onChanged} onOpen={onOpen} onNotify={onNotify} />
        ))}
      </div>
    </section>
  )
}

function WorkspaceCard({ workspace, onChanged, onOpen, onNotify }) {
  const [detail, setDetail] = useState(null)
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [confirmation, setConfirmation] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let ignore = false
    api(`/api/workspaces/${workspace.id}`).then((data) => {
      if (!ignore) setDetail(data.workspace)
    }).catch((err) => {
      if (!ignore) {
        setError(err.message)
        onNotify(err.message, 'error')
      }
    })
    return () => { ignore = true }
  }, [workspace.id, workspace.memberCount])

  async function invite(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const data = await api(`/api/workspaces/${workspace.id}/invitations`, { method: 'POST', json: { email } })
      setDetail(data.workspace)
      setEmail('')
      onChanged()
      onNotify('Invitation sent')
    } catch (err) {
      setError(err.message)
      onNotify(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  async function cancelInvitation(invitationId) {
    setBusy(true)
    setError('')
    try {
      const data = await api(`/api/workspaces/${workspace.id}/invitations/${invitationId}`, { method: 'DELETE' })
      setDetail(data.workspace)
      onChanged()
      onNotify('Invitation cancelled')
    } catch (err) {
      setError(err.message)
      onNotify(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  async function remove(userId) {
    setBusy(true)
    setError('')
    try {
      const data = await api(`/api/workspaces/${workspace.id}/members/${userId}`, { method: 'DELETE' })
      setDetail(data.workspace)
      onChanged()
      onNotify('Member removed')
    } catch (err) {
      setError(err.message)
      onNotify(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  async function transfer(userId) {
    setBusy(true)
    setError('')
    try {
      const data = await api(`/api/workspaces/${workspace.id}/owner`, {
        method: 'PATCH',
        json: { userId },
      })
      setDetail(data.workspace)
      onChanged()
      onNotify('Workspace ownership transferred')
    } catch (err) {
      setError(err.message)
      onNotify(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  async function leave() {
    setBusy(true)
    setError('')
    try {
      await api(`/api/workspaces/${workspace.id}/leave`, { method: 'POST' })
      onChanged()
      onNotify('You left the workspace')
    } catch (err) {
      setError(err.message)
      onNotify(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  async function removeWorkspace() {
    setBusy(true)
    setError('')
    try {
      await api(`/api/workspaces/${workspace.id}`, { method: 'DELETE' })
      onChanged()
      onNotify('Workspace deleted')
    } catch (err) {
      setError(err.message)
      onNotify(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  async function confirmAction() {
    if (!confirmation) return
    await confirmation.action()
    setConfirmation(null)
  }

  const members = detail?.members || []
  const pendingInvitations = detail?.pendingInvitations || []
  const isOwner = (detail?.role || workspace.role) === 'owner'
  const memberCount = detail?.memberCount ?? workspace.memberCount

  return (
    <article className="rounded-xl border border-line bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{workspace.name}</h2>
          {workspace.description && <p className="mt-1 text-sm text-muted">{workspace.description}</p>}
          <p className="mt-1 text-xs text-muted">{memberCount} {memberCount === 1 ? 'member' : 'members'} · You are {isOwner ? 'Owner' : 'Member'}</p>
        </div>
        <button type="button" onClick={() => onOpen(workspace.id)} className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-white/5">Open notes</button>
      </div>
      <h3 className="mt-4 text-[11px] font-semibold tracking-[0.14em] text-muted">ACTIVE MEMBERS</h3>
      {!detail && <LoadingState label="Loading members…" compact />}
      <ul className="mt-1 divide-y divide-line">
        {members.map((member) => (
          <li key={member.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
            <div className="grid h-7 w-7 place-items-center rounded-full bg-[#2c3d55] text-xs font-semibold text-tagtext">{member.name.slice(0, 1).toUpperCase()}</div>
            <div className="min-w-0 flex-1">
              <div className="truncate">{member.name}</div>
              <div className="truncate text-xs text-muted">{member.email}</div>
            </div>
            <span className="text-xs text-muted">{member.role === 'owner' ? 'Owner' : 'Member'}</span>
            {isOwner && member.role !== 'owner' && (
              <div className="flex items-center gap-2">
                <button type="button" disabled={busy} onClick={() => setConfirmation({
                  title: `Make ${member.name} the owner?`,
                  description: 'You will become a Member. The new owner will control membership and workspace deletion.',
                  confirmLabel: 'Transfer ownership',
                  danger: false,
                  action: () => transfer(member.id),
                })} className="text-xs text-link hover:underline disabled:opacity-50">Make owner</button>
                <button type="button" disabled={busy} onClick={() => setConfirmation({
                  title: `Remove ${member.name}?`,
                  description: 'They will immediately lose access to this workspace and its shared notes.',
                  confirmLabel: 'Remove member',
                  danger: true,
                  action: () => remove(member.id),
                })} className="text-xs text-[#f0b4b4] hover:underline disabled:opacity-50">Remove</button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {isOwner && (
        <>
          {pendingInvitations.length > 0 && (
            <div className="mt-4">
              <h3 className="text-[11px] font-semibold tracking-[0.14em] text-muted">PENDING INVITATIONS</h3>
              <ul className="mt-1 divide-y divide-line">
                {pendingInvitations.map((invitation) => (
                  <li key={invitation.id} className="flex items-center gap-3 py-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{invitation.name}</div>
                      <div className="truncate text-xs text-muted">{invitation.email}</div>
                    </div>
                    <span className="text-xs text-muted">Pending</span>
                    <button type="button" disabled={busy} onClick={() => setConfirmation({
                      title: 'Cancel this invitation?',
                      description: `${invitation.email} will no longer be able to accept it.`,
                      confirmLabel: 'Cancel invitation',
                      danger: true,
                      action: () => cancelInvitation(invitation.id),
                    })} className="text-xs text-[#f0b4b4] hover:underline disabled:opacity-50">Cancel</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <form onSubmit={invite} className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input name={`workspace-${workspace.id}-invite-email`} type="email" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="Invite a registered user by email" className="min-w-0 flex-1 rounded-lg border border-line bg-ink px-3 py-2 text-sm outline-none focus:border-accent" />
            <button type="submit" disabled={busy} className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-50">Send invite</button>
          </form>
        </>
      )}
      {error && <p className="mt-2 text-sm text-[#f0b4b4]">{error}</p>}
      {isOwner && (
        <div className="mt-4">
          <button type="button" onClick={() => setConfirmation({
            title: `Delete ${workspace.name}?`,
            description: 'This permanently deletes the workspace, its shared notes, tasks, images, and pending invitations.',
            confirmLabel: 'Delete workspace',
            danger: true,
            action: removeWorkspace,
          })} className="text-xs text-muted hover:text-[#f0b4b4]">Delete workspace</button>
        </div>
      )}
      {!isOwner && (
        <div className="mt-4">
          <button type="button" onClick={() => setConfirmation({
            title: `Leave ${workspace.name}?`,
            description: 'You will lose access to this workspace and its shared notes. Your personal notes are not affected.',
            confirmLabel: 'Leave workspace',
            danger: true,
            action: leave,
          })} className="text-xs text-muted hover:text-[#f0b4b4]">Leave workspace</button>
        </div>
      )}
      <ConfirmDialog
        open={Boolean(confirmation)}
        title={confirmation?.title || ''}
        description={confirmation?.description || ''}
        confirmLabel={confirmation?.confirmLabel}
        danger={confirmation?.danger}
        busy={busy}
        onConfirm={confirmAction}
        onCancel={() => setConfirmation(null)}
      />
    </article>
  )
}
