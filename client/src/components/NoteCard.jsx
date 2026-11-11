import { useRef, useState } from 'react'
import { fileUrl } from '../api.js'
import { formatWhen, snippet } from '../format.js'
import { useDismiss } from '../hooks.js'
import { IconCheck, IconDots, IconGlobe, IconLink, IconLock } from './Icons.jsx'
import NoteForm from './NoteForm.jsx'

export default function NoteCard({
  note,
  currentUserId,
  highlighted,
  workspaces,
  recent,
  editing,
  saving,
  deleting,
  taskBusyId,
  error,
  onTag,
  onToggle,
  onEdit,
  onCancelEdit,
  onSave,
  onDelete,
  onOpenReference,
}) {
  const [menu, setMenu] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const menuRef = useRef(null)
  const closeMenu = () => { setMenu(false); setConfirming(false) }
  useDismiss(menu, menuRef, closeMenu)
  const inlineTags = new Set([...note.body.matchAll(/#([A-Za-z0-9][\w-]*)/g)].map((match) => match[1].toLowerCase()))
  const separateTags = note.tags.filter((tag) => !inlineTags.has(tag.toLowerCase()))

  return (
    <article id={`note-${note.id}`} className={`rounded-xl border bg-card px-4 py-3.5 shadow-sm transition-colors hover:border-[#414852] ${highlighted ? 'border-accent ring-1 ring-accent/30' : 'border-line'}`}>
      {editing ? (
        <NoteForm
          variant="edit"
          initial={note}
          workspaces={workspaces}
          recent={recent}
          busy={saving}
          error={error}
          onSubmit={onSave}
          onCancel={onCancelEdit}
        />
      ) : (
        <>
          <div className="mb-1.5 flex items-start justify-between gap-3">
            <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
              <time dateTime={note.createdAt} title={new Date(note.createdAt).toLocaleString()}>{formatWhen(note.createdAt)}</time>
              {note.authorId !== currentUserId && <span> · {note.authorName}</span>}
              {note.visibility === 'shared' && note.workspaceName && <span className="text-tagtext">· {note.workspaceName}</span>}
            </p>
            <div className="flex items-center gap-0.5 text-muted">
              <span title={note.visibility === 'shared' ? `Shared in ${note.workspaceName}` : 'Only you'} className="grid h-7 w-7 place-items-center">
                {note.visibility === 'shared' ? <IconGlobe /> : <IconLock />}
              </span>
              {note.canEdit && (
                <div className="relative" ref={menuRef}>
                  <button type="button" aria-label="Note actions" aria-expanded={menu} onClick={() => setMenu((open) => !open)} className="grid h-7 w-7 place-items-center rounded-md hover:bg-white/5 hover:text-soft">
                    <IconDots />
                  </button>
                  {menu && (
                    <div className="absolute right-0 z-20 mt-1 w-40 rounded-lg border border-line bg-[#1b1f25] p-1 shadow-xl" role={confirming ? 'alertdialog' : 'menu'} aria-label={confirming ? 'Delete this note?' : 'Note actions'}>
                      {confirming ? (
                        <>
                          <p className="px-2 py-1.5 text-xs text-muted">Delete this note?</p>
                          <button type="button" disabled={deleting} onClick={() => onDelete(note)} className="block w-full rounded-md px-2 py-1.5 text-left text-sm text-[#f0b4b4] hover:bg-white/5 disabled:opacity-50">{deleting ? 'Deleting…' : 'Delete'}</button>
                          <button type="button" onClick={() => setConfirming(false)} className="block w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-white/5">Cancel</button>
                        </>
                      ) : (
                        <>
                          <button type="button" onClick={() => { setMenu(false); onEdit(note) }} className="block w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-white/5">Edit</button>
                          <button type="button" onClick={() => setConfirming(true)} className="block w-full rounded-md px-2 py-1.5 text-left text-sm text-[#f0b4b4] hover:bg-white/5">Delete</button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <RichText text={note.body} onTag={onTag} />
          {separateTags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Tags">
              {separateTags.map((tag) => (
                <button key={tag} type="button" onClick={() => onTag(tag)} className="rounded-full bg-tag px-2 py-0.5 text-xs font-medium text-tagtext hover:brightness-110">
                  #{tag}
                </button>
              ))}
            </div>
          )}
          {note.items.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {note.items.map((item) => (
                <li key={item.id} className="flex items-start gap-2.5">
                  <label className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center">
                    <input
                      name={`task-${item.id}`}
                      type="checkbox"
                      checked={item.done}
                      disabled={!note.canEdit || taskBusyId === item.id}
                      onChange={() => onToggle(note, item)}
                      aria-label={`${item.done ? 'Mark incomplete' : 'Mark complete'}: ${item.text}`}
                      className="peer sr-only"
                    />
                    <span className={`grid h-4 w-4 place-items-center rounded-[4px] border peer-focus-visible:ring-2 peer-focus-visible:ring-accent ${item.done ? 'border-[#3b82f6] bg-[#3b82f6] text-white' : 'border-[#66707b]'} ${!note.canEdit ? 'opacity-50' : 'cursor-pointer'}`} aria-hidden="true">
                      {item.done && <IconCheck />}
                    </span>
                  </label>
                  <span className={`text-[15px] leading-6 ${item.done ? 'text-[#a8b0b8] line-through' : 'text-soft'}`}>{item.text}</span>
                </li>
              ))}
            </ul>
          )}
          {note.linkUrl && (
            <a href={note.linkUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block font-medium text-link hover:underline">
              {note.linkTitle || note.linkUrl}
            </a>
          )}
          {note.imageName && (
            <img src={fileUrl(note.imageName)} alt="" className="mt-3 max-h-60 w-full rounded-lg object-cover" />
          )}
          {note.reference && (
            <button type="button" onClick={() => onOpenReference(note.reference.id)} className="mt-3 flex w-full items-center gap-2 border-t border-line pt-3 text-left">
              <span className="text-muted"><IconLink /></span>
              <span className="truncate text-sm text-soft">{snippet(note.reference.body, 64)}</span>
              <span className="ml-auto shrink-0 text-xs text-muted">Referencing</span>
            </button>
          )}
        </>
      )}
    </article>
  )
}

function RichText({ text, onTag }) {
  const parts = text.split(/(#[A-Za-z0-9][\w-]*)/g)
  return (
    <p className="text-[15px] leading-7 font-medium break-words whitespace-pre-wrap">
      {parts.map((part, index) => {
        if (/^#[A-Za-z0-9][\w-]*$/.test(part)) {
          return (
            <button key={index} type="button" onClick={() => onTag(part.slice(1).toLowerCase())} className="mx-0.5 inline-flex translate-y-[-1px] rounded-full bg-tag px-2 py-0.5 align-middle text-xs font-medium text-tagtext hover:brightness-110">
              {part.toLowerCase()}
            </button>
          )
        }
        return <span key={index}>{part}</span>
      })}
    </p>
  )
}
