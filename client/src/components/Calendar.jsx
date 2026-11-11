import { buildMonth, dayKey, formatMonth } from '../format.js'
import { IconChevron } from './Icons.jsx'

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

export default function Calendar({ year, month, selected, dayCounts, onSelect, onMonth, large = false }) {
  const cells = buildMonth(year, month)
  const counts = new Map((dayCounts || []).map((entry) => (
    typeof entry === 'string' ? [entry, 1] : [entry.day, entry.count]
  )))
  const today = dayKey(new Date())

  function shift(amount) {
    const next = new Date(year, month + amount, 1)
    onMonth(next.getFullYear(), next.getMonth())
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className={large ? 'text-lg font-semibold' : 'text-[15px] font-semibold'}>{formatMonth(year, month)}</h2>
        <div className="flex items-center">
          <button type="button" aria-label="Previous month" onClick={() => shift(-1)} className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-white/5 hover:text-soft">
            <IconChevron direction="left" />
          </button>
          <button type="button" aria-label="Next month" onClick={() => shift(1)} className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-white/5 hover:text-soft">
            <IconChevron direction="right" />
          </button>
        </div>
      </div>
      <div className={`grid grid-cols-7 text-center ${large ? 'gap-1 sm:gap-2' : 'gap-y-1'}`}>
        {WEEKDAYS.map((label, index) => (
          <div key={`${label}-${index}`} className="pb-1 text-[11px] font-medium text-muted">{label}</div>
        ))}
        {cells.map((cell) => {
          const isSelected = cell.key === selected
          const count = counts.get(cell.key) || 0
          const hasNotes = count > 0
          const isToday = cell.key === today
          return (
            <button
              key={cell.key}
              type="button"
              onClick={() => onSelect(cell.key, cell.outside)}
              aria-label={`${cell.key}${count ? `, ${count} ${count === 1 ? 'note' : 'notes'}` : ', no notes'}`}
              title={count ? `${count} ${count === 1 ? 'note' : 'notes'}` : undefined}
              className={`relative mx-auto grid place-items-center rounded-full ${large ? 'aspect-square w-full max-w-12 text-sm' : 'h-8 w-8 text-[13px]'} ${
                isSelected
                  ? 'bg-[#3b82f6] font-semibold text-white'
                  : hasNotes
                    ? 'bg-[#2d4464] text-soft'
                    : cell.outside
                      ? 'text-[#5c656f]'
                      : 'text-[#d5d8de] hover:bg-white/5'
              } ${isToday && !isSelected ? 'ring-1 ring-[#4d627c]' : ''}`}
            >
              <span>{cell.day}</span>
              {count > 0 && (
                <span className={large
                  ? `absolute bottom-0.5 text-[9px] leading-none ${isSelected ? 'text-white/80' : 'text-tagtext'}`
                  : `absolute -top-1 -right-1 min-w-4 rounded-full px-1 text-[9px] leading-4 ${isSelected ? 'bg-white text-accent' : 'bg-accent text-white'}`
                }>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
