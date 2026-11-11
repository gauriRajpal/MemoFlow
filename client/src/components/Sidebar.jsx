import { api } from '../api.js'
import Calendar from './Calendar.jsx'
import { IconBook, IconCalendar, IconList, IconLogout, IconPanel, IconSearch, IconTasks } from './Icons.jsx'

export default function Sidebar({
  user,
  feed,
  query,
  searchOpen,
  onQuery,
  onToggleSearch,
  onTimeline,
  onCalendarView,
  onTasks,
  onWorkspaces,
  cursor,
  onMonth,
  selectedDay,
  onSelectDay,
  activeDays,
  tasks,
  taskBusyId,
  onToggleTask,
  onOpenTask,
  tags,
  tag,
  onTag,
  scope,
  workspaceId,
  workspaces,
  onScope,
  onLogout,
  collapsed,
  onToggleCollapsed,
}) {
  const title = feed === 'tasks' ? 'Tasks' : feed === 'calendar' ? 'Calendar' : feed === 'workspaces' ? 'Workspaces' : 'Timeline'

  async function logout() {
    await api('/api/auth/logout', { method: 'POST', skipAuthRedirect: true }).catch(() => {})
    onLogout()
  }

  function showSearch() {
    if (collapsed) {
      onToggleCollapsed()
      if (!searchOpen) onToggleSearch()
      return
    }
    onToggleSearch()
  }

  if (collapsed) {
    return (
      <aside className="flex h-full w-[72px] flex-col border-r border-line bg-sidebar transition-[width] duration-200">
        <nav className="flex flex-col items-center gap-1 px-2 pt-4" aria-label="Primary navigation">
          <IconButton label="Timeline" active={feed === 'timeline'} onClick={onTimeline}><IconList /></IconButton>
          <IconButton label="Calendar" active={feed === 'calendar'} onClick={onCalendarView}><IconCalendar /></IconButton>
          <IconButton label="Unfinished tasks" active={feed === 'tasks'} onClick={onTasks}><IconTasks /></IconButton>
          <IconButton label="Shared spaces" active={feed === 'workspaces'} onClick={onWorkspaces}><IconBook /></IconButton>
          <IconButton label="Search notes" active={searchOpen} onClick={showSearch}><IconSearch /></IconButton>
          <div className="my-2 h-px w-8 bg-line" />
          <IconButton label="Expand sidebar" onClick={onToggleCollapsed}><IconPanel direction="right" /></IconButton>
        </nav>
        <div className="mt-auto flex flex-col items-center gap-2 border-t border-line py-3">
          <div title={`${user.name} · ${user.email}`} className="grid h-9 w-9 place-items-center rounded-full bg-[#2c3d55] text-xs font-semibold text-tagtext">
            {user.name.slice(0, 1).toUpperCase()}
          </div>
          <IconButton label="Log out" onClick={logout}><IconLogout /></IconButton>
        </div>
      </aside>
    )
  }

  return (
    <aside className="flex h-full w-[268px] flex-col border-r border-line bg-sidebar transition-[width] duration-200">
      <div className="flex items-center gap-1 px-3 pt-4 pb-2">
        <button type="button" aria-label="Timeline" onClick={onTimeline} className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left font-medium hover:bg-white/5">
          <IconList />
          <span className="truncate">{title}</span>
        </button>
        <div className="ml-auto flex items-center text-muted">
          <IconButton label="Calendar view" active={feed === 'calendar'} onClick={onCalendarView}><IconCalendar /></IconButton>
          <IconButton label="Workspaces" active={feed === 'workspaces'} onClick={onWorkspaces}><IconBook /></IconButton>
          <IconButton label="Search" active={searchOpen} onClick={showSearch}><IconSearch /></IconButton>
          <span className="hidden md:block"><IconButton label="Collapse sidebar" onClick={onToggleCollapsed}><IconPanel /></IconButton></span>
        </div>
      </div>
      {searchOpen && (
        <div className="px-4 pb-2">
          <label className="relative block">
            <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted"><IconSearch size={15} /></span>
            <input
              name="search"
              autoFocus
              aria-label="Search notes"
              value={query}
              onChange={(event) => onQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  onQuery('')
                  onToggleSearch()
                }
              }}
              placeholder="Search notes"
              className="w-full rounded-lg border border-line bg-ink py-1.5 pr-7 pl-8 text-sm outline-none placeholder:text-muted focus:border-accent"
            />
            {query && (
              <button type="button" aria-label="Clear search" onClick={() => onQuery('')} className="absolute top-1/2 right-2 -translate-y-1/2 text-sm text-muted hover:text-soft">
                ×
              </button>
            )}
          </label>
        </div>
      )}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="pt-3">
          <Calendar
            year={cursor.year}
            month={cursor.month}
            selected={selectedDay}
            dayCounts={activeDays}
            onMonth={onMonth}
            onSelect={onSelectDay}
          />
        </div>
        <section className="mt-6">
          <h3 className="px-2 text-[11px] font-semibold tracking-[0.14em] text-muted">VIEWS</h3>
          <button
            type="button"
            onClick={onTasks}
            className={`mt-2 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${feed === 'tasks' ? 'bg-white/8 text-white' : 'text-soft hover:bg-white/5'}`}
          >
            <IconTasks />
            <span className="flex-1 text-left">Unfinished tasks</span>
            {tasks.length > 0 && <span className="text-xs text-muted">{tasks.length}</span>}
          </button>
          {tasks.length > 0 && (
            <ul className="mt-2 space-y-1" aria-label="Unfinished tasks">
              {tasks.map((task) => (
                <li key={task.id} className="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5">
                  <input
                    name={`sidebar-task-${task.id}`}
                    type="checkbox"
                    checked={false}
                    disabled={!task.canEdit || taskBusyId === task.id}
                    onChange={() => onToggleTask(task)}
                    aria-label={`Complete ${task.text}`}
                    title={task.canEdit ? 'Mark complete' : 'You do not have permission to update this task'}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[#3b82f6] disabled:opacity-40"
                  />
                  <button
                    type="button"
                    onClick={() => onOpenTask(task)}
                    title={`${task.text} — ${task.noteBody}`}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="block truncate text-sm text-soft">{task.text}</span>
                    <span className="block truncate text-[11px] text-muted">{task.noteBody}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="mt-6">
          <h3 className="px-2 text-[11px] font-semibold tracking-[0.14em] text-muted">TAGS</h3>
          <div className="mt-1">
            {tags.length === 0 && <p className="px-2 py-1 text-sm text-muted">No tags yet</p>}
            {tags.map((item) => (
              <button
                key={item.name}
                type="button"
                onClick={() => onTag(item.name)}
                className={`flex w-full items-center justify-between rounded-lg px-2 py-1 text-sm ${tag === item.name ? 'bg-white/8 text-white' : 'text-soft hover:bg-white/5'}`}
              >
                <span># {item.name}</span>
                <span className="text-xs text-muted">{item.count}</span>
              </button>
            ))}
          </div>
        </section>
        <section className="mt-6">
          <h3 className="px-2 text-[11px] font-semibold tracking-[0.14em] text-muted">SPACES</h3>
          <div className="mt-1">
            <SpaceButton active={scope === 'all'} onClick={() => onScope('all')}>All notes</SpaceButton>
            <SpaceButton active={scope === 'personal'} onClick={() => onScope('personal')}>Personal</SpaceButton>
            {workspaces.map((workspace) => (
              <SpaceButton key={workspace.id} active={scope === 'workspace' && workspaceId === workspace.id} onClick={() => onScope('workspace', workspace.id)}>
                {workspace.name}
              </SpaceButton>
            ))}
          </div>
        </section>
      </div>
      <div className="border-t border-line px-3 py-3">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#2c3d55] text-xs font-semibold text-tagtext">
            {user.name.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm">{user.name}</div>
            <div className="truncate text-xs text-muted">{user.email}</div>
          </div>
          <button type="button" aria-label="Log out" onClick={logout} className="grid h-8 w-8 place-items-center rounded-md text-muted hover:bg-white/5 hover:text-soft">
            <IconLogout />
          </button>
        </div>
      </div>
    </aside>
  )
}

function IconButton({ children, label, onClick, active }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className={`grid h-8 w-8 place-items-center rounded-md ${active ? 'bg-white/10 text-white' : 'hover:bg-white/5 hover:text-soft'}`}>
      {children}
    </button>
  )
}

function SpaceButton({ children, active, onClick }) {
  return (
    <button type="button" onClick={onClick} className={`flex w-full rounded-lg px-2 py-1 text-left text-sm ${active ? 'bg-white/8 text-white' : 'text-soft hover:bg-white/5'}`}>
      <span className="truncate">{children}</span>
    </button>
  )
}
