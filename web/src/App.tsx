import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import {
  Layers3,
  LayoutDashboard,
  CalendarDays,
  UserRound,
  FileText,
  ChartNoAxesCombined,
  Bell,
  Plus,
  Search,
  Sun,
  Moon,
  LogOut,
  Users,
  ArrowUpRight,
  ChevronDown,
  Folder,
  X,
  CheckCheck,
  Pencil,
} from 'lucide-react';
import { api, ApiError } from './api';
import { placeTask, restoreTask } from './taskMoves';
import { Auth } from './components/Auth';
import { Board } from './components/Board';
import { TaskDialog } from './components/TaskDialog';
import { Select } from './components/Select';
import { Modal } from './components/Modal';
import { ProfileMenu } from './components/ProfileMenu';
import { MyBoard } from './components/MyBoard';
import { useBoardPreferences } from './useBoardPreferences';
import { palettes } from './themes';
import { AdminPanel } from './components/AdminPanel';
import { ChangePassword, EditProfile, SettingsDialog } from './components/AccountDialogs';
import {
  initials,
  priorities,
  type User,
  type Task,
  type Note,
  type Notification,
  type WorkspaceData,
  type Scope,
  type Status,
  type Project,
} from './types';

type Page = 'board' | 'agenda' | 'notes' | 'insights';
// The rich editor is the largest dependency; fetch it only when notes are opened.
const Notes = lazy(() => import('./components/Notes').then((m) => ({ default: m.Notes })));
const NoteEditor = lazy(() =>
  import('./components/Notes').then((m) => ({ default: m.NoteEditor })),
);
const Insights = lazy(() => import('./components/Insights').then((m) => ({ default: m.Insights })));
type Dialog =
  | { type: 'task'; task?: Task; status?: Status }
  | { type: 'note'; note?: Note }
  | { type: 'project'; project?: Project }
  | { type: 'team' | 'inbox' | 'profile' | 'settings' }
  | null;
export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);
  const [theme, setTheme] = useState(() => localStorage.getItem('traceboard-theme') || 'light');
  const [palette, setPalette] = useState(() => {
    const saved = localStorage.getItem('traceboard-palette');
    return palettes.some((p) => p.id === saved) ? saved! : 'honey';
  });
  useEffect(() => {
    document.documentElement.dataset.palette = palette;
    localStorage.setItem('traceboard-palette', palette);
  }, [palette]);
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const pendingMoves = useRef(new Set<string>());
  const [movingIds, setMovingIds] = useState<string[]>([]);
  const taskRevision = useRef(0);
  const session = useRef(user?.id);
  session.current = user?.id;
  const [notes, setNotes] = useState<Note[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [scope, setScope] = useState<Scope>('team');
  const [page, setPage] = useState<Page>('board');
  const [projectId, setProjectId] = useState('');
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [priority, setPriority] = useState('');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const boardView = useBoardPreferences(user ? `${user.workspace_id}:${user.id}` : 'signed-out');
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('traceboard-theme', theme);
  }, [theme]);
  useEffect(() => {
    api<User>('/auth/me')
      .then(setUser)
      .catch((e) => {
        if (e.status !== 401) setError(e.message);
      })
      .finally(() => setBooting(false));
  }, []);
  const refresh = useCallback(async () => {
    if (!user || user.must_change_password || user.is_admin_account) return;
    const revision = ++taskRevision.current;
    try {
      const [workspace, newTasks, newNotes, inbox] = await Promise.all([
        api<WorkspaceData>('/workspace'),
        api<Task[]>('/tasks'),
        api<Note[]>('/notes'),
        api<Notification[]>('/notifications'),
      ]);
      if (session.current !== user.id) return;
      setData(workspace);
      // A poll started before a drop must not put the card back in its old lane.
      if (revision === taskRevision.current && !pendingMoves.current.size) setTasks(newTasks);
      setNotes(newNotes);
      setNotifications(inbox);
    } catch (e) {
      if (session.current !== user.id) return;
      if (e instanceof ApiError && e.status === 401) {
        setUser(null);
        setData(null);
        setDialog(null);
      } else setError((e as Error).message);
    }
  }, [user]);
  async function refreshTasks() {
    const owner = session.current;
    const revision = ++taskRevision.current;
    try {
      const latest = await api<Task[]>('/tasks', 'GET', undefined, 15000);
      if (
        owner === session.current &&
        revision === taskRevision.current &&
        !pendingMoves.current.size
      ) {
        setTasks(latest);
      }
    } catch {
      // Keep the current board usable; the regular poll will reconcile it later.
    }
  }
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (!user || dialog || busy) return;
    const interval = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 15000);
    return () => clearInterval(interval);
  }, [user, dialog, busy, refresh]);
  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(''), 5000);
    return () => clearTimeout(timeout);
  }, [notice]);
  async function move(task: Task, status: Status, before?: string) {
    if (busy || pendingMoves.current.has(task.id)) return;
    const owner = session.current;
    const previous = tasks;
    pendingMoves.current.add(task.id);
    setMovingIds([...pendingMoves.current]);
    ++taskRevision.current;
    setTasks((current) => placeTask(current, task, status, before));
    setError('');
    try {
      const savedTask = await api<Task>(
        `/tasks/${task.id}/move`,
        'POST',
        {
          status,
          before_id: before || null,
          version: task.version,
        },
        15000,
      );
      if (owner !== session.current) return;
      setTasks((current) => current.map((item) => (item.id === task.id ? savedTask : item)));
      setNotice(`TB-${task.number} moved.`);
    } catch (e) {
      if (owner !== session.current) return;
      setTasks((current) => restoreTask(current, task, previous));
      setError(`TB-${task.number}: ${(e as Error).message}`);
    } finally {
      pendingMoves.current.delete(task.id);
      setMovingIds([...pendingMoves.current]);
      ++taskRevision.current;
      if (owner === session.current && !pendingMoves.current.size) void refreshTasks();
    }
  }
  async function logout() {
    try {
      await api('/auth/logout', 'POST');
      setUser(null);
      setData(null);
      setTasks([]);
      setNotes([]);
      setNotifications([]);
      setDialog(null);
      setProjectId('');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function sample() {
    setBusy(true);
    setError('');
    try {
      const project = await api<Project>('/projects', 'POST', { name: 'Atlas · starter project' });
      const examples = [
        {
          title: 'Evaluate retrieval quality on the new dataset',
          priority: 'high',
          status: 'progress',
          kind: 'experiment',
          description:
            'Compare recall@5 against the baseline. Record the results in project notes.',
        },
        {
          title: 'Fix the streaming response timeout',
          priority: 'urgent',
          status: 'todo',
          kind: 'bug',
          description: 'Investigate requests that exceed 30 seconds and add a clear retry path.',
        },
        {
          title: 'Document our evaluation workflow',
          priority: 'normal',
          status: 'todo',
          kind: 'task',
          description: 'Write down how we select datasets, run evaluations, and review failures.',
        },
        {
          title: 'Explore a smaller embedding model',
          priority: 'low',
          status: 'todo',
          kind: 'experiment',
          description: 'Measure latency, memory use, and retrieval quality.',
        },
        {
          title: 'Set up the first project workspace',
          priority: 'low',
          status: 'done',
          kind: 'task',
          description: 'An illustrative starter task. You can edit it like any other task.',
        },
      ];
      for (const item of examples)
        await api('/tasks', 'POST', {
          ...item,
          assignee_id: user!.id,
          project_id: project.id,
          private: false,
        });
      await api('/notes', 'POST', {
        title: 'Atlas · ideas and next steps',
        project_id: project.id,
        content: {
          type: 'doc',
          content: [
            {
              type: 'heading',
              attrs: { level: 2 },
              content: [{ type: 'text', text: 'A useful assistant starts with a clear question.' }],
            },
            ...[
              'What can we improve about answer quality this week?',
              'Review the failure cases from the evaluation set',
              'Add a latency benchmark for the retrieval pipeline',
            ].map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
          ],
        },
      });
      setNotice('Starter project added. These are editable example tasks.');
      await refresh();
    } catch (e) {
      setError((e as Error).message);
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');
  if (booting)
    return (
      <div className="loading-screen">
        <Layers3 />
        <p>Opening your workspace…</p>
      </div>
    );
  if (!user)
    return (
      <>
        {error && (
          <div className="boot-error" role="alert">
            {error}
            <button onClick={() => location.reload()}>Retry</button>
          </div>
        )}
        <Auth
          onLogin={(u) => {
            setError('');
            setUser(u);
          }}
          theme={theme}
          toggleTheme={toggleTheme}
        />
      </>
    );
  if (user.must_change_password)
    return (
      <ChangePassword
        requiredChange
        onBack={logout}
        onClose={logout}
        onUpdated={() => {
          void api<User>('/auth/me').then(setUser);
        }}
      />
    );
  if (user.is_admin_account) return <AdminPanel onLogout={logout} />;
  if (!data)
    return (
      <div className="loading-screen">
        <Layers3 />
        <p>{error || 'Loading your workspace…'}</p>
        <button onClick={() => void refresh()}>Retry</button>
        <button onClick={logout}>Sign out</button>
      </div>
    );
  const filtered = tasks.filter(
    (t) =>
      (page === 'agenda' || scope === 'personal'
        ? t.assign_all || (t.assignee_ids || [t.assignee_id]).includes(user.id) || t.private
        : !t.private) &&
      (!projectId || t.project_id === projectId) &&
      (!priority || t.priority === priority) &&
      (!query ||
        `${t.title} ${t.description} TB-${t.number}`.toLowerCase().includes(query.toLowerCase())),
  );
  const visibleNotes = notes.filter(
    (n) =>
      (scope === 'team' ? !n.private : n.owner_id === user.id) &&
      (!projectId || n.project_id === projectId) &&
      (!query || `${n.title} ${n.plain_text}`.toLowerCase().includes(query.toLowerCase())),
  );
  const unread = notifications.filter((n) => !n.read).length;
  const heading =
    page === 'notes'
      ? 'Project notes'
      : page === 'insights'
        ? 'Insights'
        : page === 'agenda'
          ? 'My Board'
          : 'Task Board';
  const saved = () => {
    setDialog(null);
    void refresh();
    setNotice('Saved.');
  };
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-icon">
            <Layers3 size={21} />
          </span>
          traceboard<span className="brand-dot">.</span>
        </div>
        <span className="nav-label">WORKSPACE</span>
        <nav>
          <button
            className={page === 'board' ? 'active' : ''}
            onClick={() => {
              setPage('board');
              setQuery('');
            }}
          >
            <LayoutDashboard size={18} />
            Task Board
          </button>
          <button
            className={page === 'agenda' ? 'active' : ''}
            onClick={() => {
              setPage('agenda');
              setQuery('');
            }}
          >
            <CalendarDays size={18} />
            My Board
          </button>
          <button
            className={page === 'notes' ? 'active' : ''}
            onClick={() => {
              setPage('notes');
              setQuery('');
            }}
          >
            <FileText size={18} />
            Project notes
          </button>
          <button
            className={page === 'insights' ? 'active' : ''}
            onClick={() => setPage('insights')}
          >
            <ChartNoAxesCombined size={18} />
            Insights
          </button>
          <button onClick={() => setDialog({ type: 'inbox' })}>
            <Bell size={18} />
            Inbox{unread > 0 && <span className="nav-badge">{unread}</span>}
          </button>
        </nav>
        <div className="row spread nav-label">
          <span>PROJECTS</span>
          <button
            className="icon-button"
            aria-label="New project"
            onClick={() => setDialog({ type: 'project' })}
          >
            <Plus size={15} />
          </button>
        </div>
        <div className="project-nav">
          <button
            className={!projectId ? 'selected' : ''}
            aria-expanded={projectsOpen}
            aria-controls="sidebar-projects"
            onClick={() => {
              setProjectsOpen((value) => !value);
              setProjectId('');
            }}
          >
            <Folder size={15} />
            All Projects
            <ChevronDown
              size={13}
              className={projectsOpen ? 'project-chevron expanded' : 'project-chevron'}
            />
          </button>
          {projectsOpen && (
            <div id="sidebar-projects" className="project-list">
              {data.projects.map((p) => (
                <div className="project-nav-row" key={p.id}>
                  <button
                    title={p.name}
                    className={projectId === p.id ? 'selected' : ''}
                    onClick={() => setProjectId(p.id)}
                  >
                    <span className="project-bullet" />
                    {p.name}
                  </button>
                  <button
                    className="project-rename-button"
                    aria-label={`Rename ${p.name}`}
                    title={`Rename ${p.name}`}
                    onClick={() => setDialog({ type: 'project', project: p })}
                  >
                    <Pencil size={13} />
                  </button>
                </div>
              ))}
              {!data.projects.length && <small className="project-empty">No projects</small>}
            </div>
          )}
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="breadcrumb">
            <span>{data.workspace.name}</span>
            <span>/</span>
            <strong>{heading}</strong>
          </div>
          <div className="row">
            <span className="local-indicator">
              <span className="live-dot" />
              Connected
            </span>
            <button className="icon-button" onClick={toggleTheme} aria-label="Toggle color theme">
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button
              className="icon-button notification-button"
              onClick={() => setDialog({ type: 'inbox' })}
              aria-label={`Inbox, ${unread} unread`}
            >
              <Bell size={18} />
              {unread > 0 && <span />}
            </button>
            <ProfileMenu user={user} onSelect={(type) => setDialog({ type })} onLogout={logout} />
          </div>
        </header>
        <div className="page-heading">
          <div>
            <h1>{heading}</h1>
          </div>
          <button
            className="primary"
            onClick={() => setDialog(page === 'notes' ? { type: 'note' } : { type: 'task' })}
          >
            <Plus size={17} />
            {page === 'notes' ? 'New note' : 'New task'}
          </button>
        </div>
        {page !== 'agenda' && (
          <div className="view-strip">
            <div className="view-tabs">
              <button className={scope === 'team' ? 'active' : ''} onClick={() => setScope('team')}>
                <Users size={15} />
                Team
              </button>
              <button
                className={scope === 'personal' ? 'active' : ''}
                onClick={() => setScope('personal')}
              >
                <UserRound size={15} />
                Personal
              </button>
            </div>
            <div className="row">
              <div className="avatar-stack">
                {data.members.slice(0, 4).map((m) => (
                  <span className="avatar small" key={m.id} title={m.name}>
                    {initials(m.name)}
                  </span>
                ))}
              </div>
              <button className="invite-button" onClick={() => setDialog({ type: 'team' })}>
                <Plus size={14} />
                <span>Invite</span>
              </button>
            </div>
          </div>
        )}
        <div className="content">
          <div className="filters">
            {page !== 'insights' && (
              <div className="search-box">
                <Search size={16} />
                <input
                  aria-label="Search workspace"
                  placeholder={page === 'notes' ? 'Find a note…' : 'Search tasks…'}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {query && (
                  <button aria-label="Clear search" onClick={() => setQuery('')}>
                    <X size={14} />
                  </button>
                )}
              </div>
            )}
            <Select
              label="Filter project"
              value={projectId}
              onChange={setProjectId}
              options={[
                { value: '', label: 'All projects' },
                ...data.projects.map((p) => ({ value: p.id, label: p.name })),
              ]}
            />
            {projectId && (
              <button
                className="rename-project-filter"
                onClick={() =>
                  setDialog({
                    type: 'project',
                    project: data.projects.find((p) => p.id === projectId),
                  })
                }
              >
                <Pencil size={14} />
                Rename project
              </button>
            )}
            {(page === 'board' || page === 'agenda') && (
              <Select
                label="Filter priority"
                value={priority}
                onChange={setPriority}
                options={[
                  { value: '', label: 'All priorities' },
                  ...priorities.map((p) => ({
                    value: p,
                    label: p[0].toUpperCase() + p.slice(1),
                    color: p,
                  })),
                ]}
              />
            )}
            <span className="filter-spacer" />
            {page === 'board' && (
              <div className="priority-legend">
                {priorities.map((p) => (
                  <span key={p}>
                    <i className={`priority-${p}`} />
                    {p}
                  </span>
                ))}
              </div>
            )}
          </div>
          {error && (
            <div className="error row spread" role="alert">
              {error}
              <button onClick={() => setError('')} aria-label="Dismiss error">
                <X size={16} />
              </button>
            </div>
          )}
          {movingIds.length > 0 && (
            <p className="muted small-text" role="status">
              Saving {movingIds.length === 1 ? 'task move' : `${movingIds.length} task moves`}…
            </p>
          )}
          {!tasks.length && !data.projects.length && page === 'board' && (
            <div className="welcome-banner">
              <div>
                <h3>No tasks yet</h3>
              </div>
              <button disabled={busy} onClick={sample}>
                {busy ? 'Adding…' : 'Try a starter project'}
                <ArrowUpRight size={16} />
              </button>
            </div>
          )}
          {page === 'board' && (
            <>
              <Board
                key={user.id}
                view={boardView}
                tasks={filtered}
                members={data.members}
                projects={data.projects}
                busy={busy}
                movingIds={movingIds}
                onEdit={(task) => setDialog({ type: 'task', task })}
                onMove={move}
                onCreate={(status) => setDialog({ type: 'task', status })}
              />
            </>
          )}
          {page === 'agenda' && (
            <MyBoard
              key={user.id}
              tasks={filtered}
              user={user}
              projects={data.projects}
              members={data.members}
              busy={busy}
              movingIds={movingIds}
              view={boardView}
              onMove={move}
              onCreate={(status) => setDialog({ type: 'task', status })}
              onEdit={(task) => setDialog({ type: 'task', task })}
            />
          )}
          <Suspense fallback={<p className="muted">Opening this view…</p>}>
            {page === 'notes' && (
              <Notes
                notes={visibleNotes}
                projects={data.projects}
                onOpen={(note) => setDialog({ type: 'note', note })}
              />
            )}
            {page === 'insights' && (
              <Insights
                scope={scope}
                projectId={projectId}
                revision={tasks.map((t) => `${t.id}:${t.version}`).join('|')}
                onTask={(id) => {
                  const task = tasks.find((t) => t.id === id);
                  if (task) setDialog({ type: 'task', task });
                }}
              />
            )}
          </Suspense>
        </div>
      </main>
      <nav className="mobile-nav">
        <button className={page === 'board' ? 'active' : ''} onClick={() => setPage('board')}>
          <LayoutDashboard size={20} />
          <span>Tasks</span>
        </button>
        <button className={page === 'agenda' ? 'active' : ''} onClick={() => setPage('agenda')}>
          <CalendarDays size={20} />
          <span>My Board</span>
        </button>
        <button className={page === 'notes' ? 'active' : ''} onClick={() => setPage('notes')}>
          <FileText size={20} />
          <span>Notes</span>
        </button>
        <button className={page === 'insights' ? 'active' : ''} onClick={() => setPage('insights')}>
          <ChartNoAxesCombined size={20} />
          <span>Insights</span>
        </button>
      </nav>
      {notice && (
        <div className="toast" role="status">
          <CheckCheck size={17} />
          {notice}
        </div>
      )}
      {dialog?.type === 'task' && (
        <TaskDialog
          key={dialog.task?.id || 'new-task'}
          task={dialog.task}
          status={dialog.status}
          projectId={projectId}
          user={user}
          members={data.members}
          projects={data.projects}
          onClose={() => setDialog(null)}
          onSaved={saved}
          onOpen={(task) => setDialog({ type: 'task', task })}
          onChanged={() => void refresh()}
        />
      )}
      <Suspense fallback={<div className="toast">Opening editor…</div>}>
        {dialog?.type === 'note' && (
          <NoteEditor
            note={dialog.note}
            projectId={projectId}
            user={user}
            members={data.members}
            projects={data.projects}
            onClose={() => setDialog(null)}
            onSaved={saved}
            onTasks={(count) => {
              void refresh();
              setNotice(
                count
                  ? `${count} task${count === 1 ? '' : 's'} created from your note.`
                  : 'These tasks were already created.',
              );
            }}
          />
        )}
      </Suspense>
      {dialog?.type === 'project' && (
        <ProjectDialog
          project={dialog.project}
          onClose={() => {
            setDialog(null);
            void refresh();
          }}
          onSaved={saved}
        />
      )}
      {dialog?.type === 'team' && (
        <TeamDialog user={user} data={data} onClose={() => setDialog(null)} onLogout={logout} />
      )}
      {dialog?.type === 'profile' && (
        <EditProfile
          user={user}
          onClose={() => setDialog(null)}
          onSaved={(updated) => {
            setUser(updated);
            setDialog(null);
            setNotice('Profile saved.');
          }}
        />
      )}
      {dialog?.type === 'settings' && (
        <SettingsDialog
          theme={theme}
          onTheme={setTheme}
          palette={palette}
          onPalette={setPalette}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'inbox' && (
        <Modal title="Your inbox" onClose={() => setDialog(null)}>
          <div className="modal-body">
            {notifications.length ? (
              <>
                <div className="row spread">
                  <p className="muted">Mentions and assignments from your team.</p>
                  <button
                    onClick={async () => {
                      try {
                        await api('/notifications/read', 'POST');
                        await refresh();
                      } catch (e) {
                        setError((e as Error).message);
                        setDialog(null);
                      }
                    }}
                  >
                    Mark all read
                  </button>
                </div>
                {notifications.map((n) => (
                  <button
                    key={n.id}
                    className={`notification-item ${n.read ? '' : 'unread'}`}
                    onClick={() => {
                      const task = tasks.find((t) => t.id === n.task_id);
                      const note = notes.find((t) => t.id === n.note_id);
                      if (task) setDialog({ type: 'task', task });
                      else if (note) setDialog({ type: 'note', note });
                    }}
                  >
                    <span>{n.message}</span>
                    <small>{new Date(n.created_at).toLocaleString()}</small>
                  </button>
                ))}
              </>
            ) : (
              <div className="empty-state">
                <Bell />
                <h3>No notifications</h3>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

function ProjectDialog({
  project,
  onClose,
  onSaved,
}: {
  project?: Project;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title={project ? 'Rename project' : 'Create a project'}
      onClose={busy ? () => {} : onClose}
    >
      <form
        className="modal-body"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setError('');
          const name = String(new FormData(e.currentTarget).get('name') || '').trim();
          try {
            await api(project ? `/projects/${project.id}` : '/projects', project ? 'PUT' : 'POST', {
              name,
              ...(project ? { expected_name: project.name } : {}),
            });
            onSaved();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Project name
          <input
            name="name"
            defaultValue={project?.name || ''}
            disabled={busy}
            autoFocus
            required
            minLength={2}
            maxLength={100}
            placeholder="Evaluation platform"
          />
        </label>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="primary" disabled={busy}>
            {busy ? 'Saving…' : project ? 'Save name' : 'Create project'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function TeamDialog({
  user,
  data,
  onClose,
  onLogout,
}: {
  user: User;
  data: WorkspaceData;
  onClose: () => void;
  onLogout: () => void;
}) {
  const [link, setLink] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={data.workspace.name} onClose={onClose}>
      <div className="modal-body">
        <div className="member-list">
          {data.members.map((m) => (
            <div className="row" key={m.id}>
              <span className="avatar">{initials(m.name)}</span>
              <div>
                <strong>{m.name}</strong>
                <small>@{m.handle}</small>
              </div>
              <span className="tag">{m.role}</span>
            </div>
          ))}
        </div>
        {user.role === 'admin' ? (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError('');
              const email = new FormData(e.currentTarget).get('email');
              try {
                const result = await api<{ token: string }>('/auth/invites', 'POST', { email });
                setLink(`${location.origin}/?invite=${encodeURIComponent(result.token)}`);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <h3>Invite teammate</h3>
            <p className="muted small-text">
              Create an invitation valid for 7 days. For local testing, open it in another browser
              on this computer.
            </p>
            <label>
              Teammate’s email
              <input name="email" type="email" required placeholder="teammate@yourteam.com" />
            </label>
            <button className="primary" disabled={busy}>
              {busy ? 'Creating…' : 'Create invite link'}
            </button>
          </form>
        ) : (
          <p className="muted">Ask a workspace admin to invite more teammates.</p>
        )}
        {link && (
          <label className="invite-result">
            Invitation link
            <input
              readOnly
              aria-label="Invitation link"
              value={link}
              onFocus={(e) => e.currentTarget.select()}
            />
            <small>Select and copy this link. It can only be used with the invited email.</small>
          </label>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button onClick={onLogout}>
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      </div>
    </Modal>
  );
}
