import { useCallback, useEffect, useState } from 'react'
import { api, toForm } from '../api.js'
import { dayKey, formatDayLabel, monthKey, parseDay } from '../format.js'
import Calendar from './Calendar.jsx'
import { EmptyState, LoadingState, Toast } from './Feedback.jsx'
import { IconMenu } from './Icons.jsx'
import NoteCard from './NoteCard.jsx'
import NoteForm from './NoteForm.jsx'
import Sidebar from './Sidebar.jsx'
import WorkspacePanel from './WorkspacePanel.jsx'

export default function Shell({ user, onLogout }) {
  const now = new Date()
  const [feed, setFeed] = useState('timeline')
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() })
  const [day, setDay] = useState('')
  const [tag, setTag] = useState('')
  const [scope, setScope] = useState('all')
  const [workspaceId, setWorkspaceId] = useState(null)
  const [notes, setNotes] = useState([])
  const [tags, setTags] = useState([])
  const [days, setDays] = useState([])
  const [tasks, setTasks] = useState([])
  const [recent, setRecent] = useState([])
  const [workspaces, setWorkspaces] = useState([])
  const [workspaceInvitations, setWorkspaceInvitations] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [formError, setFormError] = useState('')
  const [toast, setToast] = useState(null)
  const [saving, setSaving] = useState(false)
  const [draftKey, setDraftKey] = useState(0)
  const [editingId, setEditingId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [taskBusyId, setTaskBusyId] = useState(null)
  const [editError, setEditError] = useState('')
  const [highlight, setHighlight] = useState(null)
  const [version, setVersion] = useState(0)
  const [workspaceVersion, setWorkspaceVersion] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('memoflow_sidebar_collapsed') === '1')

  const month = monthKey(cursor.year, cursor.month)
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  const dismissToast = useCallback(() => setToast(null), [])
  const notify = useCallback((message, type = 'success') => {
    setToast({ id: Date.now(), message, type })
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 250)
    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    localStorage.setItem('memoflow_sidebar_collapsed', sidebarCollapsed ? '1' : '0')
  }, [sidebarCollapsed])

  useEffect(() => {
    let ignore = false
    api('/api/workspaces').then((data) => {
      if (!ignore) {
        setWorkspaces(data.workspaces)
        setWorkspaceInvitations(data.invitations || [])
      }
    }).catch((error) => {
      if (!ignore) {
        setLoadError(error.message)
        notify(error.message, 'error')
      }
    })
    return () => { ignore = true }
  }, [workspaceVersion, notify])

  useEffect(() => {
    if (scope === 'workspace' && workspaces.length && !workspaces.some((workspace) => workspace.id === workspaceId)) {
      setScope('all')
      setWorkspaceId(null)
    }
  }, [workspaces, scope, workspaceId])

  useEffect(() => {
    let ignore = false
    const controller = new AbortController()
    const params = new URLSearchParams({ month, timeZone })
    if (feed === 'tasks') params.set('view', 'tasks')
    if (day) params.set('day', day)
    if (tag) params.set('tag', tag)
    if (debounced) params.set('q', debounced)
    if (scope === 'personal') params.set('scope', 'personal')
    if (scope === 'workspace' && workspaceId) {
      params.set('scope', 'workspace')
      params.set('workspaceId', String(workspaceId))
    }
    setLoading(true)
    api(`/api/notes?${params}`, { signal: controller.signal }).then((data) => {
      if (ignore) return
      setNotes(data.notes)
      setTags(data.tags)
      setDays(data.days)
      setTasks(data.tasks || [])
      setRecent(data.recent)
      setLoadError('')
    }).catch((error) => {
      if (ignore || error.name === 'AbortError') return
      setLoadError(error.message)
      notify(error.message, 'error')
    }).finally(() => {
      if (!ignore) setLoading(false)
    })
    return () => {
      ignore = true
      controller.abort()
    }
  }, [feed, day, tag, debounced, scope, workspaceId, month, version, notify])

  useEffect(() => {
    if (!highlight) return
    document.getElementById(`note-${highlight}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [highlight, notes])

  function refresh() {
    setVersion((value) => value + 1)
  }

  function chooseDay(key, outside) {
    if (outside) {
      const date = parseDay(key)
      setCursor({ year: date.getFullYear(), month: date.getMonth() })
    }
    setDay(key)
    setTag('')
    setQuery('')
    setFeed((current) => (current === 'calendar' ? 'calendar' : 'timeline'))
    setSidebarOpen(false)
  }

  function changeMonth(year, monthIndex) {
    setCursor({ year, month: monthIndex })
    if (feed === 'calendar') setDay(dayKey(new Date(year, monthIndex, 1)))
  }

  function showTimeline() {
    setFeed('timeline')
    setDay('')
    setTag('')
    setQuery('')
    setHighlight(null)
    setSidebarOpen(false)
  }

  function chooseTag(name) {
    setTag((current) => (current === name ? '' : name))
    setFeed((current) => (current === 'workspaces' || current === 'calendar' ? 'timeline' : current))
    setSidebarOpen(false)
  }

  function chooseScope(next, id) {
    setScope(next)
    setWorkspaceId(id || null)
    if (feed === 'workspaces') setFeed('timeline')
    setSidebarOpen(false)
  }

  async function createNote(payload) {
    setSaving(true)
    setFormError('')
    try {
      const notePayload = {
        ...payload,
        timeZone,
        // A selected day can come from the full Calendar View or the
        // persistent sidebar calendar. The day itself, not the current view
        // label, determines where a new note is captured.
        calendarDay: day || '',
      }
      await api('/api/notes', { method: 'POST', form: toForm(notePayload) })
      setDraftKey((value) => value + 1)
      notify('Note saved')
      const hasOpenItem = payload.items.some((item) => item.text.trim() && !item.done)
      if (feed === 'tasks' && !hasOpenItem) setFeed('timeline')
      refresh()
    } catch (error) {
      setFormError(error.message)
      notify(error.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function saveNote(note, payload) {
    setSaving(true)
    setEditError('')
    try {
      await api(`/api/notes/${note.id}`, {
        method: 'PUT',
        form: toForm({ ...payload, timeZone }),
      })
      setEditingId(null)
      notify('Note updated')
      refresh()
    } catch (error) {
      setEditError(error.message)
      notify(error.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function removeNote(note) {
    setLoadError('')
    setDeletingId(note.id)
    try {
      await api(`/api/notes/${note.id}`, { method: 'DELETE' })
      if (editingId === note.id) setEditingId(null)
      notify('Note deleted')
      refresh()
    } catch (error) {
      setLoadError(error.message)
      notify(error.message, 'error')
    } finally {
      setDeletingId(null)
    }
  }

  async function toggleItem(note, item) {
    const nextDone = !item.done
    setTaskBusyId(item.id)
    setNotes((current) => current.flatMap((entry) => {
      if (entry.id !== note.id) return [entry]
      const items = entry.items.map((candidate) => candidate.id === item.id ? { ...candidate, done: nextDone } : candidate)
      if (feed === 'tasks' && items.every((candidate) => candidate.done)) return []
      return [{ ...entry, items }]
    }))
    setTasks((current) => {
      if (nextDone) return current.filter((task) => task.id !== item.id)
      if (current.some((task) => task.id === item.id)) return current
      return [{
        id: item.id,
        noteId: note.id,
        text: item.text,
        noteBody: note.body,
        authorId: note.authorId,
        authorName: note.authorName,
        visibility: note.visibility,
        workspaceId: note.workspaceId,
        workspaceName: note.workspaceName,
        createdAt: note.createdAt,
        canEdit: note.canEdit,
      }, ...current]
    })
    try {
      await api(`/api/notes/${note.id}/items/${item.id}`, { method: 'PATCH', json: { done: nextDone } })
      notify(nextDone ? 'Task completed' : 'Task reopened')
    } catch (error) {
      setLoadError(error.message)
      notify(error.message, 'error')
      refresh()
    } finally {
      setTaskBusyId(null)
    }
  }

  async function completeSidebarTask(task) {
    if (!task.canEdit) return
    setTaskBusyId(task.id)
    setTasks((current) => current.filter((candidate) => candidate.id !== task.id))
    setNotes((current) => current.flatMap((note) => {
      if (note.id !== task.noteId) return [note]
      const items = note.items.map((item) => item.id === task.id ? { ...item, done: true } : item)
      if (feed === 'tasks' && items.every((item) => item.done)) return []
      return [{ ...note, items }]
    }))
    try {
      await api(`/api/notes/${task.noteId}/items/${task.id}`, { method: 'PATCH', json: { done: true } })
      notify('Task completed')
    } catch (error) {
      setLoadError(error.message)
      notify(error.message, 'error')
      refresh()
    } finally {
      setTaskBusyId(null)
    }
  }

  function openTask(task) {
    setHighlight(task.noteId)
    setDay('')
    setTag('')
    setQuery('')
    setFeed('timeline')
    setSidebarOpen(false)
  }

  function openReference(id) {
    setHighlight(id)
    setDay('')
    setTag('')
    setQuery('')
    setScope('all')
    setWorkspaceId(null)
    setFeed('timeline')
  }

  const chips = []
  if (scope === 'personal') chips.push({ key: 'personal', label: 'Personal', clear: () => setScope('all') })
  if (scope === 'workspace') {
    const workspace = workspaces.find((item) => item.id === workspaceId)
    chips.push({ key: 'space', label: workspace?.name || 'Workspace', clear: () => setScope('all') })
  }
  if (tag) chips.push({ key: 'tag', label: `#${tag}`, clear: () => setTag('') })
  if (day && feed !== 'calendar') chips.push({ key: 'day', label: formatDayLabel(day), clear: () => setDay('') })
  if (debounced) chips.push({ key: 'q', label: `“${debounced}”`, clear: () => setQuery('') })

  const empty = !loading && notes.length === 0
  let emptyCopy = 'Nothing here yet. Capture a thought above.'
  if (feed === 'tasks') emptyCopy = 'No open checklist items.'
  else if (debounced) emptyCopy = 'No notes found.'
  else if (tag || day || scope !== 'all') emptyCopy = 'No notes match this view.'

  return (
    <div className="flex h-full min-h-0 bg-ink">
      <Toast toast={toast} onDismiss={dismissToast} />
      {sidebarOpen && <button type="button" aria-label="Close menu" className="fixed inset-0 z-20 bg-black/50 md:hidden" onClick={() => setSidebarOpen(false)} />}
      <div className={`fixed inset-y-0 left-0 z-30 transition-[transform,width] duration-200 md:static md:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <Sidebar
          user={user}
          feed={feed}
          query={query}
          searchOpen={searchOpen}
          onQuery={setQuery}
          onToggleSearch={() => setSearchOpen((open) => !open)}
          onTimeline={showTimeline}
          onCalendarView={() => {
            const today = new Date()
            setCursor({ year: today.getFullYear(), month: today.getMonth() })
            setFeed('calendar')
            setDay(dayKey(today))
            setTag('')
            setQuery('')
            setSidebarOpen(false)
          }}
          onTasks={() => { setFeed('tasks'); setDay(''); setTag(''); setQuery(''); setSidebarOpen(false) }}
          onWorkspaces={() => { setFeed('workspaces'); setSidebarOpen(false) }}
          cursor={cursor}
          onMonth={changeMonth}
          selectedDay={day}
          onSelectDay={chooseDay}
          activeDays={days}
          tasks={tasks}
          taskBusyId={taskBusyId}
          onToggleTask={completeSidebarTask}
          onOpenTask={openTask}
          tags={tags}
          tag={tag}
          onTag={chooseTag}
          scope={scope}
          workspaceId={workspaceId}
          workspaces={workspaces}
          onScope={chooseScope}
          onLogout={onLogout}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={() => setSidebarCollapsed((value) => !value)}
        />
      </div>
      <main className="min-w-0 flex-1 overflow-y-auto scroll-smooth">
        <div className="mx-auto w-full max-w-3xl px-4 py-4 sm:px-6 md:px-8 md:py-7">
          <button type="button" onClick={() => { setSidebarCollapsed(false); setSidebarOpen(true) }} className="mb-4 flex items-center gap-2 rounded-lg border border-line bg-card px-3 py-2 text-sm text-soft md:hidden">
            <IconMenu /> Menu
          </button>
          {feed === 'workspaces' ? (
            <WorkspacePanel
              workspaces={workspaces}
              invitations={workspaceInvitations}
              onNotify={notify}
              onChanged={() => { setWorkspaceVersion((value) => value + 1); refresh() }}
              onOpen={(id) => { setScope('workspace'); setWorkspaceId(id); setFeed('timeline') }}
            />
          ) : (
            <>
              <NoteForm
                key={draftKey}
                workspaces={workspaces}
                recent={recent}
                captureDay={day}
                busy={saving && editingId == null}
                error={formError}
                onSubmit={createNote}
              />
              {feed === 'calendar' && (
                <div className="mt-5 rounded-xl border border-line bg-card p-4">
                  <div className="mb-4 flex justify-end">
                    <button type="button" onClick={showTimeline} className="rounded-lg border border-line px-3 py-1.5 text-sm text-soft hover:bg-white/5">
                      Back to timeline
                    </button>
                  </div>
                  <Calendar
                    large
                    year={cursor.year}
                    month={cursor.month}
                    selected={day}
                    dayCounts={days}
                    onMonth={changeMonth}
                    onSelect={chooseDay}
                  />
                </div>
              )}
              {feed === 'tasks' && <h1 className="mt-5 text-lg font-semibold">Unfinished tasks</h1>}
              {feed === 'calendar' && day && <h1 className="mt-5 text-lg font-semibold">{formatDayLabel(day)}</h1>}
              {chips.length > 0 && (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {chips.map((chip) => (
                    <button key={chip.key} type="button" onClick={chip.clear} className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-soft hover:bg-white/10">
                      {chip.label} ×
                    </button>
                  ))}
                </div>
              )}
              {loadError && <p className="mt-4 text-sm text-[#f0b4b4]">{loadError}</p>}
              <div className="mt-4 space-y-3" aria-busy={loading}>
                {loading && notes.length === 0 && <LoadingState label="Loading notes…" />}
                {loading && notes.length > 0 && <LoadingState label="Refreshing…" compact />}
                {empty && <EmptyState title={emptyCopy} description={feed === 'tasks' ? 'Checklist items you have not completed will appear here.' : 'Use the editor above to capture your first note or adjust the current filters.'} />}
                {notes.map((note) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    currentUserId={user.id}
                    highlighted={highlight === note.id}
                    workspaces={workspaces}
                    recent={recent}
                    editing={editingId === note.id}
                    saving={saving && editingId === note.id}
                    deleting={deletingId === note.id}
                    taskBusyId={taskBusyId}
                    error={editingId === note.id ? editError : ''}
                    onTag={chooseTag}
                    onToggle={toggleItem}
                    onEdit={(target) => { setEditingId(target.id); setEditError('') }}
                    onCancelEdit={() => setEditingId(null)}
                    onSave={(payload) => saveNote(note, payload)}
                    onDelete={removeNote}
                    onOpenReference={openReference}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
