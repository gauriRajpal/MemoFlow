import { useEffect } from 'react'

export function useDismiss(open, ref, onClose) {
  useEffect(() => {
    if (!open) return undefined
    function onPointer(event) {
      if (ref.current && !ref.current.contains(event.target)) onClose()
    }
    function onKey(event) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, ref, onClose])
}
