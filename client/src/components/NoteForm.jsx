import { useEffect, useRef, useState } from 'react'
import { fileUrl } from '../api.js'
import { formatDayLabel, snippet } from '../format.js'
import { useDismiss } from '../hooks.js'
import { IconChevron, IconGlobe, IconLock, IconPlus } from './Icons.jsx'

export default function NoteForm({
  workspaces,
  recent,
  captureDay = '',
  initial,
  variant = 'composer',
  submitLabel = 'Save',
  busy = false,
  error = '',
  onSubmit,
  onCancel,
}) {
  const [body, setBody] = useState(initial?.body || '')
  const [tags, setTags] = useState(initial?.tags?.join(', ') || '')
  const [visibility, setVisibility] = useState(initial?.visibility || 'private')
  const [workspaceId, setWorkspaceId] = useState(initial?.workspaceId || workspaces[0]?.id || '')
  const [items, setItems] = useState(initial?.items?.map((item) => ({ text: item.text, done: item.done })) || [])
  const [showItems, setShowItems] = useState(Boolean(initial?.items?.length))
  const [linkUrl, setLinkUrl] = useState(initial?.linkUrl || '')
  const [linkTitle, setLinkTitle] = useState(initial?.linkTitle || '')
  const [showLink, setShowLink] = useState(Boolean(initial?.linkUrl))
  const [referenceNoteId, setReferenceNoteId] = useState(initial?.reference?.id || '')
  const [showRef, setShowRef] = useState(Boolean(initial?.reference))
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(initial?.imageName ? fileUrl(initial.imageName) : '')
  const [removeImage, setRemoveImage] = useState(false)
  const [localError, setLocalError] = useState('')
  const [menu, setMenu] = useState(false)
  const [visOpen, setVisOpen] = useState(false)
  const menuRef = useRef(null)
  const visRef = useRef(null)
  const fileRef = useRef(null)
  const closeMenu = () => setMenu(false)
  const closeVis = () => setVisOpen(false)
  useDismiss(menu, menuRef, closeMenu)
  useDismiss(visOpen, visRef, closeVis)

  useEffect(() => () => {
    if (preview.startsWith('blob:')) URL.revokeObjectURL(preview)
  }, [preview])

  const workspace = workspaces.find((item) => item.id === Number(workspaceId))
  const visibilityLabel = visibility === 'shared' ? (workspace?.name || 'Shared') : 'Personal'

  function chooseFile(event) {
    const next = event.target.files?.[0]
    event.target.value = ''
    if (!next) return
    if (next.size > 2 * 1024 * 1024) {
      setLocalError('Image must be under 2 MB')
      return
    }
    setLocalError('')
    setFile(next)
    setRemoveImage(false)
    setPreview(URL.createObjectURL(next))
    setMenu(false)
  }

  function submit(event) {
    event.preventDefault()
    if (!body.trim()) return
    onSubmit({
      body,
      tags: tags.split(',').map((tag) => tag.trim().replace(/^#/, '')).filter(Boolean),
      visibility,
      workspaceId: visibility === 'shared' ? Number(workspaceId) : null,
      items: showItems ? items : [],
      linkUrl: showLink ? linkUrl.trim() : '',
      linkTitle: showLink ? linkTitle.trim() : '',
      referenceNoteId: showRef && referenceNoteId ? Number(referenceNoteId) : null,
      file,
      removeImage,
    })
  }

  return (
    <form onSubmit={submit} className={variant === 'composer' ? 'border-b border-line pb-5' : ''}>
      <div className="flex items-start gap-3">
        <textarea
          name="body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') submit(event)
          }}
          placeholder={variant === 'composer' ? 'Any thoughts...' : 'Edit this note...'}
          rows={variant === 'composer' ? 2 : 4}
          maxLength={8000}
          className="min-h-[48px] flex-1 resize-none bg-transparent text-[15px] leading-7 outline-none placeholder:text-[#6f7782]"
        />
        <div className="flex shrink-0 items-center gap-2 pt-1">
          {onCancel && (
            <button type="button" onClick={onCancel} className="rounded-lg px-2 py-1.5 text-sm text-muted hover:text-soft">Cancel</button>
          )}
          <button type="submit" disabled={busy || !body.trim()} className="rounded-lg bg-accent px-3.5 py-1.5 text-sm font-medium text-white hover:brightness-110 disabled:opacity-40">
            {busy ? 'Saving…' : submitLabel}
          </button>
        </div>
      </div>
      <div className="mt-1 flex items-center gap-1">
        <div className="relative" ref={menuRef}>
          <button type="button" aria-label="Add to note" aria-expanded={menu} onClick={() => setMenu((open) => !open)} className="grid h-8 w-8 place-items-center rounded-full border border-[#3a424c] text-soft hover:bg-white/5">
            <IconPlus />
          </button>
          {menu && (
            <div className="absolute top-10 left-0 z-20 w-44 rounded-xl border border-line bg-[#1e2228] p-1 shadow-xl">
              <MenuItem onClick={() => { setShowItems(true); setItems((current) => current.length ? current : [{ text: '', done: false }]); setMenu(false) }}>Checklist</MenuItem>
              <MenuItem onClick={() => { setShowLink(true); setMenu(false) }}>Link</MenuItem>
              <MenuItem onClick={() => fileRef.current?.click()}>Image</MenuItem>
              <MenuItem onClick={() => { setShowRef(true); setMenu(false) }}>Reference</MenuItem>
            </div>
          )}
          <input ref={fileRef} name="image" type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={chooseFile} />
        </div>
        <div className="relative" ref={visRef}>
          <button type="button" aria-expanded={visOpen} onClick={() => setVisOpen((open) => !open)} className="flex items-center gap-1.5 rounded-full px-2 py-1 text-sm text-soft hover:bg-white/5">
            {visibility === 'shared' ? <IconGlobe /> : <IconLock />}
            <span className="max-w-40 truncate">{visibilityLabel}</span>
            <IconChevron />
          </button>
          {visOpen && (
            <div className="absolute top-9 left-0 z-20 w-60 rounded-xl border border-line bg-[#1e2228] p-1 shadow-xl">
              <button type="button" onClick={() => { setVisibility('private'); setVisOpen(false) }} className="w-full rounded-lg px-3 py-2 text-left hover:bg-white/5">
                <span className="block text-sm">Personal</span>
                <span className="block text-xs text-muted">Only you can see this</span>
              </button>
              <p className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wider text-muted">SHARED</p>
              {workspaces.length === 0 && <p className="px-3 pb-2 text-xs text-muted">Create a workspace to share notes.</p>}
              {workspaces.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => { setVisibility('shared'); setWorkspaceId(item.id); setVisOpen(false) }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-white/5"
                >
                  <IconGlobe />
                  <span className="truncate">{item.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {variant === 'composer' && captureDay && (
        <p className="mt-1 text-xs text-tagtext" role="status">
          Saving to {formatDayLabel(captureDay)}
        </p>
      )}
      <label className="mt-2 flex max-w-xl items-center gap-2 text-sm text-muted">
        <span className="shrink-0">Tags</span>
        <input
          name="tags"
          value={tags}
          onChange={(event) => setTags(event.target.value)}
          placeholder="ideas, project"
          aria-label="Tags, separated by commas"
          maxLength={200}
          className="min-w-0 flex-1 bg-transparent py-1 text-soft outline-none placeholder:text-[#6f7782]"
        />
      </label>
      {showItems && (
        <div className="mt-3 space-y-2">
          {items.map((item, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                name={`checklist-done-${index}`}
                type="checkbox"
                checked={item.done}
                onChange={(event) => setItems(items.map((entry, entryIndex) => entryIndex === index ? { ...entry, done: event.target.checked } : entry))}
                className="h-4 w-4 accent-[#3b82f6]"
              />
              <input
                name={`checklist-item-${index}`}
                value={item.text}
                onChange={(event) => setItems(items.map((entry, entryIndex) => entryIndex === index ? { ...entry, text: event.target.value } : entry))}
                placeholder="Checklist item"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
              />
              <button type="button" aria-label="Remove item" onClick={() => setItems(items.filter((_, entryIndex) => entryIndex !== index))} className="px-1 text-muted hover:text-soft">×</button>
            </div>
          ))}
          <button type="button" onClick={() => setItems([...items, { text: '', done: false }])} className="text-sm text-link">Add item</button>
        </div>
      )}
      {showLink && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <input name="linkTitle" value={linkTitle} onChange={(event) => setLinkTitle(event.target.value)} placeholder="Link title" aria-label="Link title" className="rounded-lg border border-line bg-ink px-3 py-2 text-sm outline-none focus:border-accent" />
          <input name="linkUrl" type="url" value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} placeholder="https://" aria-label="Link URL" className="rounded-lg border border-line bg-ink px-3 py-2 text-sm outline-none focus:border-accent" />
        </div>
      )}
      {showRef && (
        <select name="referenceNoteId" aria-label="Reference a note" value={referenceNoteId} onChange={(event) => setReferenceNoteId(event.target.value)} className="mt-3 w-full rounded-lg border border-line bg-ink px-3 py-2 text-sm outline-none focus:border-accent">
          <option value="">Reference a note</option>
          {recent.filter((note) => note.id !== initial?.id).map((note) => (
            <option key={note.id} value={note.id}>{snippet(note.body) || 'Untitled note'}</option>
          ))}
        </select>
      )}
      {preview && (
        <div className="relative mt-3 max-w-xl">
          <img src={preview} alt="" className="max-h-48 w-full rounded-lg object-cover" />
          <button
            type="button"
            onClick={() => { setPreview(''); setFile(null); setRemoveImage(true) }}
            className="absolute top-2 right-2 rounded-md bg-black/60 px-2 py-1 text-xs"
          >
            Remove
          </button>
        </div>
      )}
      {(localError || error) && <p className="mt-3 text-sm text-[#f0b4b4]" role="alert">{localError || error}</p>}
    </form>
  )
}

function MenuItem({ children, onClick }) {
  return (
    <button type="button" onClick={onClick} className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-white/5">
      {children}
    </button>
  )
}
