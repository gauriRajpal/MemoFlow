export function fileUrl(name) {
  return `/api/notes/files/${encodeURIComponent(name)}`
}

export function toForm(payload) {
  const form = new FormData()
  form.set('body', payload.body)
  form.set('visibility', payload.visibility)
  if (payload.workspaceId) form.set('workspaceId', String(payload.workspaceId))
  if (payload.calendarDay) form.set('calendarDay', payload.calendarDay)
  if (payload.timeZone) form.set('timeZone', payload.timeZone)
  form.set('tags', JSON.stringify(payload.tags || []))
  form.set('items', JSON.stringify(payload.items || []))
  form.set('linkUrl', payload.linkUrl || '')
  form.set('linkTitle', payload.linkTitle || '')
  form.set('referenceNoteId', payload.referenceNoteId ? String(payload.referenceNoteId) : '')
  form.set('removeImage', payload.removeImage ? 'true' : 'false')
  if (payload.file) form.set('image', payload.file)
  return form
}

export async function api(path, { method = 'GET', json, form, signal, skipAuthRedirect = false } = {}) {
  const headers = {}
  let body
  if (form) {
    body = form
  } else if (json !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(json)
  }
  const response = await fetch(path, { method, headers, body, signal, credentials: 'same-origin' })
  const data = await response.json().catch(() => ({}))
  if (response.status === 401 && !skipAuthRedirect && !path.startsWith('/api/auth/login') && !path.startsWith('/api/auth/register')) {
    window.location.reload()
  }
  if (!response.ok) throw new Error(data.error || 'Request failed')
  return data
}
