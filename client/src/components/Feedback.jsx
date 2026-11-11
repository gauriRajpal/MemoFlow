import { useEffect } from 'react'

export function Toast({ toast, onDismiss }) {
  useEffect(() => {
    if (!toast) return undefined
    const timer = setTimeout(onDismiss, 4200)
    return () => clearTimeout(timer)
  }, [toast, onDismiss])

  if (!toast) return null
  const success = toast.type === 'success'
  return (
    <div className="pointer-events-none fixed inset-x-4 top-4 z-50 flex justify-center md:inset-x-auto md:right-6 md:justify-end" role="status" aria-live="polite">
      <div className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border bg-[#1c2026] px-4 py-3 shadow-2xl shadow-black/35 ${success ? 'border-[#315b49]' : 'border-[#704044]'}`}>
        <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${success ? 'bg-[#62c896]' : 'bg-[#ec7b83]'}`} />
        <p className="min-w-0 flex-1 text-sm leading-5 text-soft">{toast.message}</p>
        <button type="button" onClick={onDismiss} aria-label="Dismiss notification" className="rounded px-1 text-muted hover:bg-white/5 hover:text-white">×</button>
      </div>
    </div>
  )
}

export function LoadingState({ label = 'Loading…', compact = false }) {
  return (
    <div className={`flex items-center justify-center gap-2 text-muted ${compact ? 'py-2 text-xs' : 'rounded-xl border border-line bg-card/60 py-10 text-sm'}`} role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted/30 border-t-tagtext" aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}

export function EmptyState({ title, description }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-card/35 px-5 py-10 text-center">
      <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full border border-line bg-white/[0.03] text-lg text-muted" aria-hidden="true">·</div>
      <h2 className="text-sm font-medium text-soft">{title}</h2>
      {description && <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-muted">{description}</p>}
    </div>
  )
}

export function ConfirmDialog({ open, title, description, confirmLabel = 'Confirm', busy = false, danger = true, onConfirm, onCancel }) {
  useEffect(() => {
    if (!open) return undefined
    function onKey(event) {
      if (event.key === 'Escape' && !busy) onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, busy, onCancel])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/65 px-4" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onCancel()
    }}>
      <div className="w-full max-w-sm rounded-2xl border border-line bg-[#1c2026] p-5 shadow-2xl" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-description">
        <h2 id="confirm-title" className="text-lg font-semibold tracking-tight">{title}</h2>
        <p id="confirm-description" className="mt-2 text-sm leading-6 text-muted">{description}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" disabled={busy} onClick={onCancel} className="rounded-lg border border-line px-3.5 py-2 text-sm text-soft hover:bg-white/5 disabled:opacity-50">Cancel</button>
          <button type="button" autoFocus disabled={busy} onClick={onConfirm} className={`rounded-lg px-3.5 py-2 text-sm font-medium text-white disabled:opacity-50 ${danger ? 'bg-[#a8454d] hover:bg-[#b94d56]' : 'bg-accent hover:brightness-110'}`}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
